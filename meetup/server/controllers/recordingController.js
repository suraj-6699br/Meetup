import { AssemblyAI } from "assemblyai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { sql } from "../config/db.js";
import fs from "fs";
import path from "path";

// Configure ffmpeg static binary
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Convert audio (WebM) to MP3 format
const convertToMp3 = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat("mp3")
            .audioBitrate(128)
            .save(outputPath)
            .on("end", () => {
                console.log(`[Recording] Converted audio to MP3: ${outputPath}`);
                resolve(outputPath);
            })
            .on("error", (err) => {
                console.warn("[Recording] ffmpeg conversion warning:", err.message);
                reject(err);
            });
    });
};

// Fallback structured meeting summary generator if Gemini API key is unavailable or fails
const generateFallbackSummary = (transcriptText) => {
    if (!transcriptText || transcriptText.trim().length === 0 || transcriptText.includes("Speech transcription encountered an error")) {
        return `## 📌 Executive Overview\nNo clear speech was detected in this recording.\n\n## 🎯 Key Topics Discussed\n- Audio recording captured and stored.\n\n## ✅ Decisions Made\n- No formal decisions recorded.\n\n## 📋 Action Items & Next Steps\n- Ensure microphone is enabled and active during the session.`;
    }

    const lines = transcriptText.split("\n").filter(l => l.trim().length > 0);
    const preview = lines.slice(0, 3).map(l => l.replace(/^Speaker [^:]+:\s*/, "")).join(" ");
    
    // Extract unique speakers
    const speakers = [...new Set(lines.map(l => {
        const match = l.match(/^(Speaker [^:]+):/);
        return match ? match[1] : null;
    }).filter(Boolean))];

    // Pick key conversational points (up to 4 bullet points)
    const points = lines.slice(0, 5).map(l => `- ${l.trim()}`).join("\n");

    return `## 📌 Executive Overview\n${preview ? preview.slice(0, 300) + (preview.length > 300 ? "..." : "") : "Meeting audio transcribed and analyzed."}\n\n## 🎯 Key Topics Discussed\n${points || "- Meeting discussion captured across participants."}\n${speakers.length > 0 ? `\n*Active Speakers*: ${speakers.join(", ")}` : ""}\n\n## ✅ Decisions Made\n- Discussions concluded as recorded above.\n\n## 📋 Action Items & Next Steps\n- Review full transcript and audio recording playback for detailed follow-ups.`;
};

export const processRecording = async (req, res) => {
    const { meetingId } = req.params;
    const userId = req.user.id;
    const audioFile = req.file;

    if (!audioFile) {
        return res.status(400).json({ error: "No audio file uploaded" });
    }

    try {
        // 1. Verify meeting exists and user is the host
        const meetings = await sql`
            SELECT id, host_id FROM meetings WHERE meeting_id = ${meetingId}
        `;
        if (meetings.length === 0) {
            if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
            return res.status(404).json({ error: "Meeting not found" });
        }

        const meeting = meetings[0];
        if (meeting.host_id !== userId) {
            if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
            return res.status(403).json({ error: "Only the host can submit a recording" });
        }

        // 2. Mark as processing and respond immediately so host UI navigates without delay
        await sql`UPDATE meetings SET recording_status = 'processing' WHERE id = ${meeting.id}`;
        res.status(202).json({ message: "Recording received, processing started" });

        // 3. Process conversion, object storage upload, transcription & summary asynchronously in background
        (async () => {
            const mp3Path = path.join("uploads/recordings", `recording-${meetingId}-${Date.now()}.mp3`);
            let finalAudioPath = audioFile.path;
            let recordingUrl = null;

            try {
                // Convert WebM to MP3
                try {
                    await convertToMp3(audioFile.path, mp3Path);
                    if (fs.existsSync(mp3Path)) {
                        finalAudioPath = mp3Path;
                    }
                } catch (convErr) {
                    console.warn("[Recording] Using original audio file for upload/transcription:", convErr.message);
                }

                // --- 1. Upload to Neon Object Storage ---
                const s3Key = `recordings/meeting-${meetingId}-${Date.now()}.mp3`;

                if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
                    try {
                        console.log(`[Recording] Uploading audio to Neon Object Storage bucket "uploads"...`);
                        const files = new Files({ adapter: neon({ bucket: "uploads" }) });
                        const audioBuffer = fs.readFileSync(finalAudioPath);

                        await files.upload(s3Key, audioBuffer, {
                            contentType: "audio/mpeg",
                        });

                        // Generate 7-day presigned playback & download URL
                        recordingUrl = await files.url(s3Key, { expiresIn: 7 * 24 * 3600 });
                        console.log(`[Recording] ✅ Audio saved to Neon Object Storage! URL generated.`);
                    } catch (storageErr) {
                        console.error("[Recording] Neon Object Storage upload failed:", storageErr.message);
                    }
                } else {
                    console.warn("[Recording] AWS_* credentials not found in environment.");
                }

                // Immediately save recordingUrl to DB so host can play & download even if transcription is running
                if (recordingUrl) {
                    await sql`UPDATE meetings SET recording_url = ${recordingUrl} WHERE id = ${meeting.id}`;
                }

                // --- 2. Transcribe Audio with AssemblyAI ---
                let transcriptText = "";
                const assemblyApiKey = (process.env.ASSEMBLYAI_API_KEY || "").replace(/['"]/g, "").trim();

                if (assemblyApiKey) {
                    try {
                        const client = new AssemblyAI({ apiKey: assemblyApiKey });

                        // Upload file to AssemblyAI to obtain a reliable processed audio URL
                        console.log(`[Recording] Uploading audio file to AssemblyAI for meeting ${meetingId}...`);
                        const aaiUploadUrl = await client.files.upload(finalAudioPath);
                        console.log(`[Recording] AssemblyAI upload URL obtained. Starting transcription...`);

                        const transcript = await client.transcripts.transcribe({
                            audio: aaiUploadUrl,
                            language_detection: true, // Auto-detects English, Hindi, Spanish, etc.
                            speaker_labels: true,
                        });

                        if (transcript.status === "completed") {
                            if (transcript.utterances && transcript.utterances.length > 0) {
                                transcriptText = transcript.utterances
                                    .map((u) => `Speaker ${u.speaker}: ${u.text}`)
                                    .join("\n");
                            } else {
                                transcriptText = transcript.text || "No speech detected in this meeting.";
                            }
                            console.log(`[Recording] ✅ Transcription complete (${transcriptText.length} chars). Detected language: ${transcript.language_code || 'auto'}`);
                        } else {
                            console.warn("[Recording] AssemblyAI status not completed:", transcript.status, transcript.error);
                            transcriptText = "Could not detect clear speech in this recording.";
                        }
                    } catch (aaiErr) {
                        console.error("[Recording] AssemblyAI error:", aaiErr.message);
                        transcriptText = "Speech transcription encountered an error: " + aaiErr.message;
                    }
                } else {
                    console.warn("[Recording] ASSEMBLYAI_API_KEY not configured.");
                    transcriptText = "ASSEMBLYAI_API_KEY is not configured on the server.";
                }

                // --- 3. Generate Structured Meeting Summary with Google Gemini ---
                let summaryText = "";
                const geminiApiKey = (process.env.GEMINI_API_KEY || "").replace(/['"]/g, "").trim();

                if (geminiApiKey && geminiApiKey.startsWith("AIzaSy") && transcriptText && transcriptText.length > 20) {
                    try {
                        console.log(`[Recording] Generating summary using Google Gemini (gemini-1.5-flash)...`);
                        const genAI = new GoogleGenerativeAI(geminiApiKey);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                        const prompt = `You are an expert AI meeting assistant. Analyze the following meeting transcript (which may be in English, Hindi, Spanish, or multilingual) and provide a professional, structured executive meeting summary in English.

Format your response cleanly with these exact sections:

## 📌 Executive Overview
(A concise 2-3 sentence overview of what the meeting was about)

## 🎯 Key Topics Discussed
(Bullet points covering the main themes, discussions, and ideas)

## ✅ Decisions Made
(Bullet points of any agreements, finalized plans, or conclusions reached. If none, write "No formal decisions were finalized.")

## 📋 Action Items & Next Steps
(Bullet points with clear tasks, assignees if mentioned, and next steps. If none, write "No action items assigned.")

Meeting Transcript:
"""
${transcriptText}
"""`;

                        const result = await model.generateContent(prompt);
                        summaryText = result.response.text();
                        console.log(`[Recording] ✅ Gemini summary generated successfully!`);
                    } catch (geminiErr) {
                        console.warn("[Recording] Gemini summarization failed, using structured fallback:", geminiErr.message);
                        summaryText = generateFallbackSummary(transcriptText);
                    }
                } else {
                    summaryText = generateFallbackSummary(transcriptText);
                }

                // --- 4. Update Database ---
                await sql`
                    UPDATE meetings
                    SET recording_url = ${recordingUrl},
                        transcript = ${transcriptText},
                        summary = ${summaryText},
                        recording_status = 'done',
                        updated_at = NOW()
                    WHERE id = ${meeting.id}
                `;
                console.log(`[Recording] ✅ Audio URL, transcription and summary saved to database for meeting ${meetingId}`);

            } catch (err) {
                console.error("[Recording] Processing failed:", err);
                await sql`UPDATE meetings SET recording_url = ${recordingUrl}, recording_status = 'done', transcript = 'Recording saved. Transcription incomplete.', summary = 'No summary available.', updated_at = NOW() WHERE id = ${meeting.id}`;
            } finally {
                // Delete temporary files from disk
                if (fs.existsSync(audioFile.path)) {
                    fs.unlinkSync(audioFile.path);
                }
                if (fs.existsSync(mp3Path)) {
                    fs.unlinkSync(mp3Path);
                }
            }
        })();

    } catch (error) {
        console.error("processRecording controller error:", error);
        if (audioFile?.path && fs.existsSync(audioFile.path)) {
            fs.unlinkSync(audioFile.path);
        }
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to process recording" });
        }
    }
};

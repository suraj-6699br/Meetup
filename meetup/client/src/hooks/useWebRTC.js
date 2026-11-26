import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "../config/socket";
import toast from "react-hot-toast";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
    ],
};

export const useWebRTC = (roomId, user, onMeetingEnded, enabled = true, isHost = false) => {
    const [localStream, setLocalStream] = useState(null);
    const [localScreenStream, setLocalScreenStream] = useState(null);
    const [remoteUsers, setRemoteUsers] = useState([]); // Array of { socketId, userId, userName, stream, audioEnabled, videoEnabled, isScreenShare }
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const screenSendersRef = useRef(new Map()); // socketId -> RTCRtpSender
    const isScreenSharingRef = useRef(false);

    // Initialize local media stream
    const initLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            localStreamRef.current = stream;
            setLocalStream(stream);
            return stream;
        } catch (error) {
            toast.error("Could not access camera/microphone");
            console.error("Media devices access error:", error);
            // Fallback: try audio only
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStreamRef.current = audioStream;
                setLocalStream(audioStream);
                setVideoEnabled(false);
                return audioStream;
            } catch (err) {
                console.error("Audio-only fallback error:", err);
                return null;
            }
        }
    }, []);

    // Create RTCPeerConnection for a target socket
    const createPeerConnection = useCallback((targetSocketId, targetUser) => {
        if (peersRef.current.has(targetSocketId)) {
            return peersRef.current.get(targetSocketId);
        }

        const peer = new RTCPeerConnection(ICE_SERVERS);

        // Add local tracks (camera & microphone) to peer connection
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
                peer.addTrack(track, localStreamRef.current);
            });
        }

        // If local user is currently sharing screen, attach screen track to this peer too
        if (screenStreamRef.current && isScreenSharingRef.current) {
            const screenTrack = screenStreamRef.current.getVideoTracks()[0];
            if (screenTrack && screenTrack.readyState === "live") {
                try {
                    const sender = peer.addTrack(screenTrack, screenStreamRef.current);
                    screenSendersRef.current.set(targetSocketId, sender);
                } catch (e) {
                    console.error("Error adding screen track to new peer:", e);
                }
            }
        }

        // Handle ICE candidates
        peer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", {
                    targetSocketId,
                    senderSocketId: socket.id,
                    candidate: event.candidate,
                });
            }
        };

        // Handle incoming remote stream tracks
        peer.ontrack = (event) => {
            const incomingStream = event.streams[0];
            if (!incomingStream) return;

            setRemoteUsers((prev) => {
                // Find existing camera user for this socket
                const existingBaseUser = prev.find(
                    (u) => u.socketId === targetSocketId && !u.isScreenShare
                );

                // If base user exists and has a stream with a different ID, this is a separate screen share stream!
                const isScreen = Boolean(
                    existingBaseUser &&
                    existingBaseUser.stream &&
                    existingBaseUser.stream.id !== incomingStream.id
                );

                if (isScreen) {
                    const screenSocketId = `${targetSocketId}-screen`;
                    const existingScreenIdx = prev.findIndex((u) => u.socketId === screenSocketId);
                    const screenEntry = {
                        socketId: screenSocketId,
                        userId: `${targetUser?.userId || targetSocketId}-screen`,
                        userName: `${targetUser?.userName || "Participant"}'s Screen`,
                        stream: incomingStream,
                        audioEnabled: false,
                        videoEnabled: true,
                        isScreenShare: true,
                    };

                    if (existingScreenIdx > -1) {
                        const updated = [...prev];
                        updated[existingScreenIdx] = screenEntry;
                        return updated;
                    } else {
                        return [...prev, screenEntry];
                    }
                } else {
                    // Regular camera/audio participant stream
                    const existingIdx = prev.findIndex(
                        (u) => u.socketId === targetSocketId && !u.isScreenShare
                    );
                    if (existingIdx > -1) {
                        const updated = [...prev];
                        updated[existingIdx] = {
                            ...updated[existingIdx],
                            stream: incomingStream,
                        };
                        return updated;
                    } else {
                        return [
                            ...prev,
                            {
                                socketId: targetSocketId,
                                userId: targetUser?.userId,
                                userName: targetUser?.userName || "Participant",
                                stream: incomingStream,
                                audioEnabled: targetUser?.audioEnabled ?? true,
                                videoEnabled: targetUser?.videoEnabled ?? true,
                                isScreenShare: false,
                            },
                        ];
                    }
                }
            });
        };

        peersRef.current.set(targetSocketId, peer);
        return peer;
    }, []);

    // Main WebRTC & Socket signaling setup effect
    useEffect(() => {
        if (!roomId || !user || !enabled) return;

        let isMounted = true;

        const startSession = async () => {
            const stream = await initLocalStream();

            if (!isMounted) return;

            if (!socket.connected) {
                socket.connect();
            }

            // Emit join room
            socket.emit("join-room", {
                roomId,
                user,
                audioEnabled: true,
                videoEnabled: true,
            });

            // 1. Receive all existing users in room
            socket.on("all-users", (existingUsers) => {
                existingUsers.forEach((existingUser) => {
                    const peer = createPeerConnection(existingUser.socketId, existingUser);

                    // Create offer to existing user
                    peer.createOffer()
                        .then((offer) => peer.setLocalDescription(offer))
                        .then(() => {
                            socket.emit("offer", {
                                targetSocketId: existingUser.socketId,
                                callerSocketId: socket.id,
                                sdp: peer.localDescription,
                            });
                        })
                        .catch((err) => console.error("Error creating offer:", err));
                });
            });

            // 2. Someone new joined -> add to state
            socket.on("user-joined", (newUser) => {
                toast(`${newUser.userName} joined the meeting`, { icon: "👋" });
                createPeerConnection(newUser.socketId, newUser);
            });

            // 3. Receive offer from caller
            socket.on("offer", async ({ callerSocketId, sdp, callerUser }) => {
                const peer = createPeerConnection(callerSocketId, callerUser);
                try {
                    await peer.setRemoteDescription(new RTCSessionDescription(sdp));
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);

                    socket.emit("answer", {
                        targetSocketId: callerSocketId,
                        responderSocketId: socket.id,
                        sdp: peer.localDescription,
                    });
                } catch (err) {
                    console.error("Error handling offer:", err);
                }
            });

            // 4. Receive answer from responder
            socket.on("answer", async ({ responderSocketId, sdp }) => {
                const peer = peersRef.current.get(responderSocketId);
                if (peer) {
                    try {
                        await peer.setRemoteDescription(new RTCSessionDescription(sdp));
                    } catch (err) {
                        console.error("Error setting remote description from answer:", err);
                    }
                }
            });

            // 5. Receive ICE candidate
            socket.on("ice-candidate", async ({ senderSocketId, candidate }) => {
                const peer = peersRef.current.get(senderSocketId);
                if (peer && candidate) {
                    try {
                        await peer.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (err) {
                        console.error("Error adding ICE candidate:", err);
                    }
                }
            });

            // 6. Handle peer audio toggle
            socket.on("user-toggled-audio", ({ socketId, audioEnabled }) => {
                setRemoteUsers((prev) => prev.map((u) => (u.socketId === socketId ? { ...u, audioEnabled } : u)));
            });

            // 7. Handle peer video toggle
            socket.on("user-toggled-video", ({ socketId, videoEnabled }) => {
                setRemoteUsers((prev) => prev.map((u) => (u.socketId === socketId ? { ...u, videoEnabled } : u)));
            });

            // 8. Handle being muted by host
            socket.on("muted-by-host", () => {
                if (isHost) {
                    // Host should NEVER be muted by mute-all
                    return;
                }
                if (localStreamRef.current) {
                    const audioTrack = localStreamRef.current.getAudioTracks()[0];
                    if (audioTrack) {
                        audioTrack.enabled = false;
                        setAudioEnabled(false);
                        socket.emit("toggle-audio", { roomId, audioEnabled: false });
                    }
                }
                toast("🔇 You were muted by the host");
            });

            // 9. Handle peer left
            socket.on("user-left", ({ socketId, user: leftUser }) => {
                if (leftUser) {
                    toast(`${leftUser.userName} left the meeting`);
                }
                const peer = peersRef.current.get(socketId);
                if (peer) {
                    peer.close();
                    peersRef.current.delete(socketId);
                }
                setRemoteUsers((prev) => prev.filter((u) => u.socketId !== socketId));
            });

            // 10. Handle peer screen share started/stopped
            socket.on("user-started-screen-share", ({ user: senderUser }) => {
                toast(`🖥️ ${senderUser?.userName || "A participant"} started sharing screen`);
            });

            socket.on("user-stopped-screen-share", ({ socketId }) => {
                setRemoteUsers((prev) => prev.filter((u) => u.socketId !== `${socketId}-screen`));
                toast("Screen share ended");
            });

            // 11. Handle meeting ended by host
            socket.on("meeting-ended", ({ message }) => {
                toast.error(message || "This meeting has ended");
                if (onMeetingEnded) {
                    onMeetingEnded(message);
                }
            });
        };

        startSession();

        // Cleanup on leave/unmount
        return () => {
            isMounted = false;

            // Stop local tracks
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => track.stop());
            }

            // Stop screen sharing tracks if any
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach((track) => track.stop());
                screenStreamRef.current = null;
            }

            // Close all peer connections
            peersRef.current.forEach((peer) => peer.close());
            peersRef.current.clear();
            screenSendersRef.current.clear();

            // Off socket listeners
            socket.off("all-users");
            socket.off("user-joined");
            socket.off("offer");
            socket.off("answer");
            socket.off("ice-candidate");
            socket.off("user-toggled-audio");
            socket.off("user-toggled-video");
            socket.off("muted-by-host");
            socket.off("user-left");
            socket.off("user-started-screen-share");
            socket.off("user-stopped-screen-share");
            socket.off("meeting-ended");

            socket.disconnect();
        };
    }, [roomId, user?.id, enabled, createPeerConnection, initLocalStream, onMeetingEnded]);

    // Toggle local mic
    const toggleAudio = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                const newState = !audioEnabled;
                audioTrack.enabled = newState;
                setAudioEnabled(newState);
                socket.emit("toggle-audio", { roomId, audioEnabled: newState });
            }
        }
    };

    // Toggle local camera (can freely toggle camera on/off even while screen sharing!)
    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                const newState = !videoEnabled;
                videoTrack.enabled = newState;
                setVideoEnabled(newState);
                socket.emit("toggle-video", { roomId, videoEnabled: newState });
            }
        }
    };

    // Helper to stop screen share
    const stopScreenShare = useCallback(async () => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
        }

        isScreenSharingRef.current = false;
        setIsScreenSharing(false);
        setLocalScreenStream(null);

        // Remove screen sender from all active peer connections & renegotiate
        peersRef.current.forEach(async (peer, targetSocketId) => {
            const sender = screenSendersRef.current.get(targetSocketId);
            if (sender) {
                try {
                    peer.removeTrack(sender);
                } catch (e) {
                    console.warn("Error removing screen sender:", e);
                }
                screenSendersRef.current.delete(targetSocketId);

                if (peer.signalingState === "stable") {
                    try {
                        const offer = await peer.createOffer();
                        await peer.setLocalDescription(offer);
                        socket.emit("offer", {
                            targetSocketId,
                            callerSocketId: socket.id,
                            sdp: peer.localDescription,
                        });
                    } catch (err) {
                        console.warn("Renegotiate removal error:", err);
                    }
                }
            }
        });

        socket.emit("screen-share-stopped", { roomId });
        toast("Screen sharing stopped");
    }, [roomId]);

    // Toggle Screen Share (Separate stream & tile like Google Meet)
    const toggleScreenShare = useCallback(async () => {
        if (isScreenSharing) {
            await stopScreenShare();
            return;
        }

        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: false,
            });

            const screenTrack = screenStream.getVideoTracks()[0];
            if (!screenTrack) return;

            screenStreamRef.current = screenStream;
            isScreenSharingRef.current = true;
            setIsScreenSharing(true);
            setLocalScreenStream(screenStream);

            // Add screen track to all connected peers and renegotiate
            peersRef.current.forEach(async (peer, targetSocketId) => {
                try {
                    const sender = peer.addTrack(screenTrack, screenStream);
                    screenSendersRef.current.set(targetSocketId, sender);

                    if (peer.signalingState === "stable") {
                        const offer = await peer.createOffer();
                        await peer.setLocalDescription(offer);
                        socket.emit("offer", {
                            targetSocketId,
                            callerSocketId: socket.id,
                            sdp: peer.localDescription,
                        });
                    }
                } catch (err) {
                    console.error(`Error adding screen track to peer ${targetSocketId}:`, err);
                }
            });

            socket.emit("screen-share-started", {
                roomId,
                streamId: screenStream.id,
            });

            toast.success("🖥️ Screen sharing started");

            // Handle user clicking native browser "Stop sharing" bar
            screenTrack.onended = () => {
                stopScreenShare();
            };
        } catch (err) {
            if (err.name !== "NotAllowedError") {
                console.error("Screen share error:", err);
                toast.error("Failed to share screen: " + err.message);
            }
        }
    }, [isScreenSharing, roomId, stopScreenShare]);

    // End meeting for everyone (Host action)
    const endMeeting = useCallback(() => {
        if (roomId) {
            socket.emit("end-meeting", { roomId });
        }
    }, [roomId]);

    // Mute all participants (Host action)
    const muteAll = useCallback(() => {
        if (roomId) {
            socket.emit("mute-all", { roomId });
            toast.success("Muted all participants");
        }
    }, [roomId]);

    return {
        localStream,
        localScreenStream,
        remoteUsers,
        audioEnabled,
        videoEnabled,
        toggleAudio,
        toggleVideo,
        endMeeting,
        muteAll,
        isScreenSharing,
        toggleScreenShare,
    };
};

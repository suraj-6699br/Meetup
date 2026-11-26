# WebRTC Screen Sharing Implementation Guide for Meetup

## 1. Overview: Can We Implement Screen Sharing?

**Yes, absolutely!** 
Screen sharing can be implemented cleanly in Meetup using native browser WebRTC APIs without requiring any backend server architecture changes or media relay servers (SFUs).

In modern WebRTC, screen sharing is achieved using:
1. **`navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`** to capture the user's screen, window, or specific browser tab.
2. **`RTCRtpSender.replaceTrack()`** to dynamically hot-swap the existing camera video track with the screen video track across all active peer connections without dropping or renegotiating connections.
3. **`screenTrack.onended`** event listener to detect when the user clicks the browser's native floating "Stop Sharing" button and seamlessly swap back to the camera.

---

## 2. Architecture & Flow Diagram

```
[ User clicks "Share Screen" ]
               │
               ▼
[ navigator.mediaDevices.getDisplayMedia() ]
               │
      ┌────────┴────────┐
      ▼                 ▼
[ Local Preview ]   [ Active Peers (RTCPeerConnection) ]
Updates local       Iterates over peersRef:
video stream        sender = peer.getSenders().find(s => s.track?.kind === "video")
                    sender.replaceTrack(screenVideoTrack)
                                │
                                ▼
                    [ Remote participants immediately ]
                    [ see shared screen in HD        ]
                                │
[ User clicks "Stop Sharing" OR native browser stop ]
                                │
                                ▼
                    sender.replaceTrack(cameraVideoTrack)
                    Restores local camera preview
```

---

## 3. Step-by-Step Code Changes Required

Only **3 frontend files** need to be updated:
1. `client/src/hooks/useWebRTC.js` — core logic for capturing display stream and hot-swapping tracks.
2. `client/src/pages/MeetingRoom.jsx` — pass screen sharing states and handlers.
3. `client/src/components/meeting/ControlBar.jsx` — add the Screen Share button with active toggle indicators.

---

### Step 1: `client/src/hooks/useWebRTC.js`

Add screen share tracking, the `toggleScreenShare` function, and ensure cleanup on disconnect.

#### A. Add State and Ref
```javascript
const [isScreenSharing, setIsScreenSharing] = useState(false);
const screenStreamRef = useRef(null);
```

#### B. Implement `toggleScreenShare`
```javascript
// Toggle Screen Sharing
const toggleScreenShare = useCallback(async () => {
    // If already sharing, stop screen share
    if (isScreenSharing) {
        stopScreenShare();
        return;
    }

    try {
        // 1. Request screen media from browser
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                displaySurface: "monitor", // or "window", "browser"
            },
            audio: false, // Set to true if you want to capture tab/system audio
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        screenStreamRef.current = screenStream;

        // 2. Hot-swap video track on all connected peers
        peersRef.current.forEach((peer) => {
            const sender = peer.getSenders().find((s) => s.track && s.track.kind === "video");
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        });

        // 3. Update local stream preview so host sees their own screen
        if (localStreamRef.current) {
            const oldCameraTrack = localStreamRef.current.getVideoTracks()[0];
            localStreamRef.current.removeTrack(oldCameraTrack);
            localStreamRef.current.addTrack(screenTrack);
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }

        setIsScreenSharing(true);
        toast.success("🖥️ Screen sharing started");

        // 4. Handle native browser "Stop sharing" button
        screenTrack.onended = () => {
            stopScreenShare();
        };

    } catch (err) {
        if (err.name !== "NotAllowedError") {
            console.error("Screen share error:", err);
            toast.error("Failed to share screen: " + err.message);
        }
    }
}, [isScreenSharing]);

// Helper to stop screen share and restore camera
const stopScreenShare = useCallback(async () => {
    // Stop screen tracks
    if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
    }

    // Restore original camera track
    try {
        let cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const cameraTrack = cameraStream.getVideoTracks()[0];

        // Replace track on all peers back to camera
        peersRef.current.forEach((peer) => {
            const sender = peer.getSenders().find((s) => s.track && s.track.kind === "video");
            if (sender) {
                sender.replaceTrack(cameraTrack);
            }
        });

        // Replace track on local stream
        if (localStreamRef.current) {
            const currentVideo = localStreamRef.current.getVideoTracks()[0];
            if (currentVideo) localStreamRef.current.removeTrack(currentVideo);
            localStreamRef.current.addTrack(cameraTrack);
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }

        setIsScreenSharing(false);
        toast("Screen sharing stopped");
    } catch (err) {
        console.warn("Could not re-enable camera after screen share:", err);
        setIsScreenSharing(false);
    }
}, []);
```

#### C. Export the new values from `useWebRTC`:
```javascript
return {
    localStream,
    remoteUsers,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    endMeeting,
    muteAll,
    isScreenSharing,     // <-- new
    toggleScreenShare,   // <-- new
};
```

---

### Step 2: `client/src/pages/MeetingRoom.jsx`

Receive `isScreenSharing` and `toggleScreenShare` from `useWebRTC` and pass them to `<ControlBar />`:

```jsx
// 1. Destructure from useWebRTC
const {
    localStream,
    remoteUsers,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    endMeeting,
    muteAll,
    isScreenSharing,
    toggleScreenShare,
} = useWebRTC(meetingId, userdata, handleMeetingEnded, Boolean(meeting), isHost);

// 2. Pass to ControlBar
<ControlBar
    ...
    isScreenSharing={isScreenSharing}
    onToggleScreenShare={toggleScreenShare}
/>
```

---

### Step 3: `client/src/components/meeting/ControlBar.jsx`

Add the Screen Share button with `ScreenShare` icon from `lucide-react`:

```jsx
import { 
    MicIcon, 
    MicOffIcon, 
    VideoIcon, 
    VideoOffIcon, 
    MessageSquareIcon, 
    UsersIcon, 
    PhoneOffIcon, 
    VolumeX, 
    ScreenShare,        // <-- new import
    ScreenShareOff      // <-- new import
} from 'lucide-react';

const ControlBar = ({
    ...
    isScreenSharing = false,
    onToggleScreenShare,
}) => {
    return (
        ...
        {/* Screen Share Button */}
        <button
            onClick={onToggleScreenShare}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer border ${
                isScreenSharing
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-md shadow-emerald-500/20"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 shadow-xs"
            }`}
            title={isScreenSharing ? "Stop Sharing Screen" : "Share Your Screen"}
        >
            {isScreenSharing ? (
                <ScreenShareOff className="w-5 h-5 text-white animate-pulse" />
            ) : (
                <ScreenShare className="w-5 h-5" />
            )}
        </button>
        ...
    );
};
```

---

## 4. Key Edge Cases Handled

1. **User Cancelation**: If the user opens the screen share dialog and clicks "Cancel", `getDisplayMedia` throws a `NotAllowedError`. The code silently catches this without showing an unnecessary error toast.
2. **Native "Stop Sharing" Bar**: Browsers (Chrome, Edge, Firefox) display a bottom floating bar with a "Stop sharing" button. Hooking into `screenTrack.onended` ensures the UI updates instantly even if the user stops sharing via the browser bar instead of the in-app button.
3. **No Connection Drop**: By using `sender.replaceTrack()`, the WebRTC peer connection stays alive with no renegotiation (SDP offer/answer) required.
4. **Mobile Devices**: `getDisplayMedia` is not supported on mobile browsers (iOS Safari, Android Chrome). You can easily hide the screen share button on mobile screens using Tailwind (`hidden md:flex`).

---

## 5. Summary

Implementing Screen Sharing in Meetup:
- **Feasible:** Yes, 100% supported by WebRTC.
- **Backend changes needed:** None (purely client-side track swapping).
- **Files to touch:** 3 files (`useWebRTC.js`, `MeetingRoom.jsx`, `ControlBar.jsx`).
- **Dependencies needed:** None (uses standard browser WebRTC APIs).

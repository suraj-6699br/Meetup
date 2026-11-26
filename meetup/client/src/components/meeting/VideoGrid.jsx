import React from 'react'
import VideoTile from './VideoTile';

const VideoGrid = ({localStream, localScreenStream, localUser, remoteUsers, audioEnabled, videoEnabled}) => {
    
    // Check if there is an active screen share (local or remote)
    const activeRemoteScreen = remoteUsers.find((u) => u.isScreenShare);
    const hasScreenShare = Boolean(localScreenStream || activeRemoteScreen);

    const activeScreenData = localScreenStream
        ? {
              stream: localScreenStream,
              name: `${localUser?.name || "You"} (Presentation)`,
              isLocal: true,
          }
        : activeRemoteScreen
        ? {
              stream: activeRemoteScreen.stream,
              name: activeRemoteScreen.userName,
              isLocal: false,
          }
        : null;

    // Camera participants (excluding screen share virtual tiles)
    const cameraRemoteUsers = remoteUsers.filter((u) => !u.isScreenShare);
    const totalParticipants = 1 + cameraRemoteUsers.length;

    // Determine grid columns dynamically when no screen is shared
    const getGridClass = () => {
        if (totalParticipants === 1) return "grid-cols-1 max-w-4xl";
        if (totalParticipants === 2) return "grid-cols-1 md:grid-cols-2 max-w-5xl";
        if (totalParticipants <= 4) return "grid-cols-1 md:grid-cols-2 max-w-5xl";
        if (totalParticipants <= 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl";
        return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-w-7xl";
    };

    // Stage Presentation Layout (Google Meet style)
    if (hasScreenShare && activeScreenData) {
        return (
            <div className="flex-1 w-full h-full flex flex-col md:flex-row gap-3 p-3 overflow-hidden">
                {/* Main Featured Presentation Stage */}
                <div className="flex-1 h-full min-h-0 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center">
                    <VideoTile
                        stream={activeScreenData.stream}
                        name={activeScreenData.name}
                        isLocal={activeScreenData.isLocal}
                        audioEnabled={false}
                        videoEnabled={true}
                        isScreenSharing={true}
                    />
                </div>

                {/* Side Strip for Webcams (Local Camera + All Remote Cameras) */}
                <div className="w-full md:w-64 lg:w-72 h-44 md:h-full flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto shrink-0 pr-1 pb-1">
                    {/* Local Camera Tile */}
                    <div className="w-56 md:w-full h-full md:h-44 shrink-0">
                        <VideoTile
                            stream={localStream}
                            name={localUser?.name || "You"}
                            isLocal={true}
                            audioEnabled={audioEnabled}
                            videoEnabled={videoEnabled}
                            isScreenSharing={false}
                        />
                    </div>

                    {/* Remote Participants' Camera Tiles */}
                    {cameraRemoteUsers.map((remote) => (
                        <div key={remote.socketId} className="w-56 md:w-full h-full md:h-44 shrink-0">
                            <VideoTile
                                stream={remote.stream}
                                name={remote.userName}
                                isLocal={false}
                                audioEnabled={remote.audioEnabled}
                                videoEnabled={remote.videoEnabled}
                                isScreenSharing={false}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Default Dynamic Grid Layout (when no screen is being shared)
    return (
        <div className="flex-1 w-full flex items-center justify-center p-4 overflow-y-auto">
            <div className={`w-full grid gap-4 ${getGridClass()} aspect-video max-h-[calc(100vh-140px)] transition-all duration-300`}>
                {/* Local User Tile */}
                <VideoTile
                    stream={localStream}
                    name={localUser?.name || "You"}
                    isLocal={true}
                    audioEnabled={audioEnabled}
                    videoEnabled={videoEnabled}
                    isScreenSharing={false}
                />

                {/* Remote Users Tiles */}
                {remoteUsers.map((remote) => (
                    <VideoTile
                        key={remote.socketId}
                        stream={remote.stream}
                        name={remote.userName}
                        isLocal={false}
                        audioEnabled={remote.audioEnabled}
                        videoEnabled={remote.videoEnabled}
                        isScreenSharing={remote.isScreenShare}
                    />
                ))}
            </div>
        </div>
    );
};

export default VideoGrid;
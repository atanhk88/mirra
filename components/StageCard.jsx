"use client";

import VideoAvatar from "./VideoAvatar";

export default function StageCard({ stylized, clips = {}, animConfigured }) {
  return (
    <div className="stage-card">
      <h3 className="card-title">Your avatar</h3>
      <p className="card-sub">It breathes and blinks on its own — reactions fire from the panels on the right.</p>
      <div className="stage-backdrop" data-backdrop="fog">
        {stylized && animConfigured ? (
          <VideoAvatar image={stylized} clips={clips} />
        ) : stylized ? (
          <div className="video-avatar">
            <img src={stylized} alt="Stylized avatar" />
            <div className="video-avatar-overlay">
              Animation isn&apos;t configured — add REPLICATE_API_TOKEN to bring this avatar to life.
            </div>
          </div>
        ) : (
          <div className="video-avatar">
            <div className="video-avatar-overlay">Upload a photo in step 1 to create your avatar.</div>
          </div>
        )}
      </div>
      <div className="stage-meta">
        <span className="stage-mode">2D animated — real motion clips from your reference</span>
      </div>
    </div>
  );
}

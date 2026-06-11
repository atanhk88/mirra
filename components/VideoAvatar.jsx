"use client";

// 2D animated avatar: real motion clips generated from the stylized reference
// by an image-to-video model. The idle loop (breathing, blinking, weight
// shifts) plays continuously; each reaction is generated on first use, cached
// for the session, and plays once before returning to idle.

import { useEffect, useRef, useState } from "react";
import { onReaction } from "@/lib/reactions";

const POLL_MS = 5000;

export default function VideoAvatar({ image }) {
  const [clips, setClips] = useState({});
  const [activeClip, setActiveClip] = useState(null);
  const [note, setNote] = useState(null);
  const stateRef = useRef({ clips: {}, pending: new Set(), alive: true });

  async function ensureClip(motion) {
    const s = stateRef.current;
    if (s.clips[motion]) return s.clips[motion];
    if (s.pending.has(motion)) return null;
    s.pending.add(motion);
    try {
      const res = await fetch("/api/animate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: image.split(",")[1], motion }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Animation failed (${res.status}).`);
      while (s.alive) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const poll = await fetch(`/api/animate?task=${encodeURIComponent(json.taskId)}`);
        const status = await poll.json();
        if (status.status === "completed" && status.videoUrl) {
          s.clips[motion] = status.videoUrl;
          setClips({ ...s.clips });
          return status.videoUrl;
        }
        if (status.status === "error") throw new Error(status.message || "Animation failed.");
      }
      return null;
    } catch (err) {
      setNote(String(err.message || err));
      return null;
    } finally {
      s.pending.delete(motion);
    }
  }

  useEffect(() => {
    const s = stateRef.current;
    s.alive = true;
    ensureClip("idle");
    const off = onReaction(async (name) => {
      const cached = s.clips[name];
      if (cached) {
        setActiveClip({ motion: name, url: cached });
        return;
      }
      setNote(`Animating “${name}” for the first time — it plays as soon as it’s ready (~1 min). Cached after that.`);
      const url = await ensureClip(name);
      if (url && s.alive) {
        setNote(null);
        setActiveClip({ motion: name, url });
      }
    });
    return () => {
      s.alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const idleUrl = clips.idle;

  return (
    <div className="video-avatar">
      {activeClip ? (
        <video
          key={activeClip.motion + activeClip.url}
          src={activeClip.url}
          autoPlay
          muted
          playsInline
          onEnded={() => setActiveClip(null)}
          onError={() => setActiveClip(null)}
        />
      ) : idleUrl ? (
        <video key={idleUrl} src={idleUrl} autoPlay muted loop playsInline />
      ) : (
        <>
          <img src={image} alt="Stylized avatar" />
          <div className="video-avatar-overlay">
            Bringing your avatar to life — the idle loop takes about a minute to animate…
          </div>
        </>
      )}
      {note && <div className="video-avatar-note">{note}</div>}
    </div>
  );
}

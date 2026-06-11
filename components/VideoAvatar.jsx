"use client";

// 2D animated avatar: real motion clips generated from the stylized reference
// by an image-to-video model.
//
// - Two idle loops (idle + a subtle variation) rotate to avoid the
//   every-5-seconds déjà vu of a single loop.
// - After the first idle is ready, the remaining clips (idle variation + all
//   reactions) auto-generate sequentially in the background.
// - Finished clips are downloaded once and persisted to the IndexedDB library
//   (when avatarId is set); playback always runs from local blob URLs, so
//   loop/reaction transitions are instant.
// - A reaction triggered before its clip exists is bumped to the front of the
//   queue and plays the moment it's ready.

import { useEffect, useRef, useState } from "react";
import { onReaction, REACTIONS, REACTION_LABELS } from "@/lib/reactions";
import { saveClip } from "@/lib/library";

const POLL_MS = 5000;
const IDLES = ["idle", "idle2"];
const AUTO_QUEUE = ["idle2", ...REACTIONS];

export default function VideoAvatar({ image, avatarId, initialClips = {} }) {
  const [clips, setClips] = useState(initialClips);
  const [activeReaction, setActiveReaction] = useState(null);
  const [idleIdx, setIdleIdx] = useState(0);
  const [note, setNote] = useState(null);
  const [generating, setGenerating] = useState(null);
  const s = useRef({ clips: { ...initialClips }, jobs: {}, alive: true }).current;

  function ensureClip(motion) {
    if (s.clips[motion]) return Promise.resolve(s.clips[motion]);
    if (s.jobs[motion]) return s.jobs[motion];
    const job = (async () => {
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
            let url = status.videoUrl;
            try {
              const blob = await (await fetch(status.videoUrl)).blob();
              url = URL.createObjectURL(blob);
              if (avatarId) saveClip(avatarId, motion, blob).catch(() => {});
            } catch {
              // CDN refused the download — play the remote URL directly.
            }
            s.clips[motion] = url;
            setClips({ ...s.clips });
            return url;
          }
          if (status.status === "error") throw new Error(status.message || "Animation failed.");
        }
        return null;
      } finally {
        delete s.jobs[motion];
      }
    })();
    s.jobs[motion] = job;
    job.catch(() => {});
    return job;
  }

  useEffect(() => {
    s.alive = true;

    (async () => {
      try {
        await ensureClip("idle");
      } catch (err) {
        if (s.alive) setNote(String(err.message || err));
        return;
      }
      // Background queue: idle variation first, then every reaction.
      for (const motion of AUTO_QUEUE) {
        if (!s.alive) return;
        if (s.clips[motion]) continue;
        setGenerating(motion);
        try {
          await ensureClip(motion);
        } catch {
          // keep going — a failed clip can regenerate on demand later
        }
      }
      if (s.alive) setGenerating(null);
    })();

    const off = onReaction(async (name) => {
      const cached = s.clips[name];
      if (cached) {
        setActiveReaction({ motion: name, url: cached });
        return;
      }
      setNote(`“${REACTION_LABELS[name] || name}” is still animating — it plays the moment it’s ready.`);
      try {
        const url = await ensureClip(name);
        if (url && s.alive) {
          setNote(null);
          setActiveReaction({ motion: name, url });
        }
      } catch (err) {
        if (s.alive) setNote(String(err.message || err));
      }
    });

    return () => {
      s.alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const idleUrls = IDLES.map((m) => clips[m]).filter(Boolean);
  const idleUrl = idleUrls.length ? idleUrls[idleIdx % idleUrls.length] : null;

  function handleIdleEnded(e) {
    if (idleUrls.length > 1) setIdleIdx((i) => i + 1);
    else {
      e.target.currentTime = 0;
      e.target.play();
    }
  }

  const readyCount = AUTO_QUEUE.filter((m) => clips[m]).length;

  return (
    <div className="video-avatar">
      {activeReaction ? (
        <video
          key={activeReaction.motion + activeReaction.url}
          src={activeReaction.url}
          autoPlay
          muted
          playsInline
          onEnded={() => setActiveReaction(null)}
          onError={() => setActiveReaction(null)}
        />
      ) : idleUrl ? (
        <video key={idleIdx + idleUrl} src={idleUrl} autoPlay muted playsInline onEnded={handleIdleEnded} />
      ) : (
        <>
          <img src={image} alt="Stylized avatar" />
          <div className="video-avatar-overlay">
            Bringing your avatar to life — the idle loop takes about a minute to animate…
          </div>
        </>
      )}
      {note ? (
        <div className="video-avatar-note">{note}</div>
      ) : generating ? (
        <div className="video-avatar-note video-avatar-note--quiet">
          Animating “{REACTION_LABELS[generating] || generating}” in the background ({readyCount}/{AUTO_QUEUE.length})
        </div>
      ) : null}
    </div>
  );
}

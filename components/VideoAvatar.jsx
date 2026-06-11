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

const CROSSFADE = 0.7; // seconds of opacity dissolve across the loop boundary

// Seamless idle: two stacked <video> layers. As the playing layer nears its
// end, the other starts from frame 0 and we crossfade opacity, dissolving over
// the loop seam so there's no flash. Each cycle advances through the idle
// variants, so the same dissolve also masks the variant switch.
function IdleLoop({ urls }) {
  const refs = [useRef(null), useRef(null)];
  const [active, setActive] = useState(0);
  const st = useRef({ active: 0, idx: 0, busy: false }).current;

  useEffect(() => {
    st.active = 0;
    st.idx = 0;
    st.busy = false;
    setActive(0);
    const a = refs[0].current;
    const b = refs[1].current;
    if (a) {
      a.src = urls[0];
      a.currentTime = 0;
      a.play().catch(() => {});
    }
    if (b) {
      b.src = urls[1 % urls.length];
      b.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join("|")]);

  function onTimeUpdate(layer) {
    return (e) => {
      const v = e.target;
      if (layer !== st.active || st.busy || !v.duration) return;
      if (v.duration - v.currentTime > CROSSFADE) return;
      st.busy = true;
      const other = 1 - st.active;
      const ov = refs[other].current;
      const nextIdx = (st.idx + 1) % urls.length;
      if (ov.src !== urls[nextIdx]) ov.src = urls[nextIdx];
      ov.currentTime = 0;
      ov.play().catch(() => {});
      st.active = other;
      st.idx = nextIdx;
      setActive(other);
      // After the dissolve, preload the following variant on the now-idle layer.
      setTimeout(() => {
        st.busy = false;
        const inactive = refs[1 - st.active].current;
        const following = urls[(st.idx + 1) % urls.length];
        if (inactive && inactive.src !== following) {
          inactive.src = following;
          inactive.load();
        }
      }, CROSSFADE * 1000);
    };
  }

  return (
    <>
      {[0, 1].map((layer) => (
        <video
          key={layer}
          ref={refs[layer]}
          className="idle-layer"
          style={{ opacity: active === layer ? 1 : 0, transition: `opacity ${CROSSFADE}s linear` }}
          muted
          playsInline
          onTimeUpdate={onTimeUpdate(layer)}
        />
      ))}
    </>
  );
}

const POLL_MS = 5000;
const IDLES = ["idle", "idle2"];
const AUTO_QUEUE = ["idle2", ...REACTIONS];

// The video model validates input format from the URL's file extension, so
// the image goes up as a data URI (mime included) — which must stay under
// Replicate's ~256KB data-URI limit. 768px JPEG is plenty for 480p output.
function prepareImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 768 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.7, 0.55, 0.4]) {
        const out = canvas.toDataURL("image/jpeg", q);
        if (out.length * 0.75 < 240 * 1024 || q === 0.4) {
          resolve(out);
          return;
        }
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function VideoAvatar({ image, avatarId, initialClips = {} }) {
  const [clips, setClips] = useState(initialClips);
  const [activeReaction, setActiveReaction] = useState(null);
  const [error, setError] = useState(null);
  const [waitingFor, setWaitingFor] = useState(null);
  const [generating, setGenerating] = useState(null);
  const s = useRef({ clips: { ...initialClips }, jobs: {}, alive: true, prepared: null }).current;

  function ensureClip(motion) {
    if (s.clips[motion]) return Promise.resolve(s.clips[motion]);
    if (s.jobs[motion]) return s.jobs[motion];
    const job = (async () => {
      try {
        if (!s.prepared) s.prepared = prepareImage(image);
        const prepared = await s.prepared;
        const res = await fetch("/api/animate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: prepared.split(",")[1], mime: "image/jpeg", motion }),
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
            setError(null);
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
        if (s.alive) setError(String(err.message || err));
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
      setWaitingFor(name);
      try {
        const url = await ensureClip(name);
        if (url && s.alive) setActiveReaction({ motion: name, url });
      } catch (err) {
        if (s.alive) setError(String(err.message || err));
      } finally {
        if (s.alive) setWaitingFor(null);
      }
    });

    return () => {
      s.alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const idleUrls = IDLES.map((m) => clips[m]).filter(Boolean);
  const readyCount = AUTO_QUEUE.filter((m) => clips[m]).length;
  const queuePct = Math.round((readyCount / AUTO_QUEUE.length) * 100);

  return (
    <div className="video-avatar">
      {idleUrls.length > 0 ? (
        <IdleLoop urls={idleUrls} />
      ) : (
        <>
          <img src={image} alt="Stylized avatar" />
          {!error && (
            <div className="video-avatar-overlay">
              <span className="spinner" aria-hidden="true" />
              Bringing your avatar to life — the idle loop takes about a minute…
              <div className="progress-indeterminate" role="progressbar" aria-label="Generating idle animation">
                <span />
              </div>
            </div>
          )}
        </>
      )}

      {/* Reaction plays on top; idle keeps looping underneath and resumes
          seamlessly when the reaction ends. */}
      {activeReaction && (
        <video
          key={activeReaction.motion + activeReaction.url}
          className="reaction-layer"
          src={activeReaction.url}
          autoPlay
          muted
          playsInline
          onEnded={() => setActiveReaction(null)}
          onError={() => setActiveReaction(null)}
        />
      )}

      {error ? (
        <div className="video-avatar-note">{error}</div>
      ) : waitingFor ? (
        <div className="video-avatar-note">
          <span className="spinner" aria-hidden="true" />
          Animating “{REACTION_LABELS[waitingFor] || waitingFor}” — it plays the moment it’s ready…
        </div>
      ) : generating && idleUrls.length > 0 ? (
        <div className="video-avatar-note video-avatar-note--quiet">
          Animating “{REACTION_LABELS[generating] || generating}” in the background ({readyCount}/{AUTO_QUEUE.length})
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={readyCount}
            aria-valuemin={0}
            aria-valuemax={AUTO_QUEUE.length}
          >
            <div className="progress-fill" style={{ width: `${queuePct}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

// Pure playback component — receives ready clip URLs via props, handles idle
// loop rotation and reaction overlay. Generation is managed by the parent.

import { useEffect, useRef, useState } from "react";
import { onReaction, REACTION_LABELS } from "@/lib/reactions";

const CROSSFADE = 0.7;
const IDLES = ["idle", "idle2"];

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

export default function VideoAvatar({ image, clips = {} }) {
  const [activeReaction, setActiveReaction] = useState(null);
  const [waitingFor, setWaitingFor] = useState(null);
  const clipsRef = useRef(clips);

  useEffect(() => {
    clipsRef.current = clips;
    if (waitingFor && clips[waitingFor]) {
      setActiveReaction({ motion: waitingFor, url: clips[waitingFor] });
      setWaitingFor(null);
    }
  }, [clips, waitingFor]);

  useEffect(() => {
    const off = onReaction((name) => {
      const url = clipsRef.current[name];
      if (url) {
        setActiveReaction({ motion: name, url });
      } else {
        setWaitingFor(name);
      }
    });
    return off;
  }, []);

  const idleUrls = IDLES.map((m) => clips[m]).filter(Boolean);

  return (
    <div className="video-avatar">
      {idleUrls.length > 0 ? (
        <IdleLoop urls={idleUrls} />
      ) : image ? (
        <img src={image} alt="Stylized avatar" />
      ) : null}

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

      {waitingFor && (
        <div className="video-avatar-note">
          &ldquo;{REACTION_LABELS[waitingFor] || waitingFor}&rdquo; isn&apos;t generated yet — use the Animations panel to generate it.
        </div>
      )}
    </div>
  );
}

"use client";

// Idle layer: purely procedural motion driven by useFrame.
// It owns its own scene nodes (idle group, breath group, head-drift group,
// eyelid scale) and nothing else ever writes to them — the GSAP reaction
// layer animates sibling/parent nodes instead.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function useIdleMotion({ idleRef, breathRef, headDriftRef, eyeLidRefs } = {}) {
  const blink = useRef({ next: 1.5 + Math.random() * 3, start: -1 });

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (idleRef?.current) {
      idleRef.current.position.y = Math.sin(t * 1.15) * 0.02;
      idleRef.current.rotation.z = Math.sin(t * 0.6) * 0.022;
      idleRef.current.rotation.y = Math.sin(t * 0.35) * 0.03;
    }

    if (breathRef?.current) {
      const s = 1 + Math.sin(t * 1.9) * 0.018;
      breathRef.current.scale.set(s, 1 + Math.sin(t * 1.9) * 0.012, s);
    }

    if (headDriftRef?.current) {
      headDriftRef.current.rotation.y = Math.sin(t * 0.5) * 0.07;
      headDriftRef.current.rotation.x = Math.sin(t * 0.73) * 0.03;
    }

    if (eyeLidRefs?.length) {
      const b = blink.current;
      if (t >= b.next) {
        b.start = t;
        b.next = t + 1.8 + Math.random() * 3.6;
      }
      let lid = 1;
      if (b.start >= 0) {
        const p = (t - b.start) / 0.22;
        if (p < 1) lid = 1 - 0.92 * Math.sin(Math.min(p, 1) * Math.PI);
      }
      for (const ref of eyeLidRefs) {
        if (ref.current) ref.current.scale.y = lid;
      }
    }
  });
}

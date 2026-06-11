"use client";

// 2D paper-puppet stage: the transparent-background stylized PNG on a flat
// plane, driven by the same idle motion and GSAP puppet-reaction layers that
// power the 3D avatar. No arms/head nodes — reactions use the whole-body
// squash-and-stretch / tilt fallback path that already handles this case in
// puppet.js (same as how a generated mesh with no rig behaves).

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { onReaction } from "@/lib/reactions";
import { playPuppetReaction, killPuppetReaction } from "@/lib/puppet";
import { useIdleMotion } from "./useIdleMotion";

const TARGET_HEIGHT = 1.75;

export default function PaperPuppet({ url }) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;

  const img = texture.image;
  const aspect = img?.width && img?.height ? img.width / img.height : 0.48;
  const h = TARGET_HEIGHT;
  const w = h * aspect;

  const reactionRoot = useRef();
  const idleRoot = useRef();
  const currentTl = useRef(null);

  useIdleMotion({ idleRef: idleRoot });

  useEffect(() => {
    const off = onReaction((name) => {
      playPuppetReaction(name, { root: reactionRoot.current }, currentTl);
    });
    return () => {
      off();
      killPuppetReaction(currentTl);
    };
  }, []);

  return (
    <group ref={reactionRoot}>
      <group ref={idleRoot}>
        {/* Feet at y=0; plane center sits at h/2 */}
        <mesh position={[0, h / 2, 0]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={texture} transparent alphaTest={0.05} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

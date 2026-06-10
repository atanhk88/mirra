"use client";

// Procedural Pixar-proportioned stand-in avatar: oversized head, small body,
// primitive geometry, "toy plastic" materials. Implements the full two-layer
// animation system:
//   - idle layer (useFrame) → idle/breath/head-drift/eyelid nodes
//   - reaction layer (GSAP) → reaction root, shoulder pivots, head-tilt node
// The two layers never write to the same scene node.

import { useEffect, useMemo, useRef } from "react";
import { onReaction } from "@/lib/reactions";
import { playPuppetReaction, killPuppetReaction, ARM_BASE } from "@/lib/puppet";
import { SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS } from "@/lib/customize";
import { useIdleMotion } from "./useIdleMotion";

const PLASTIC = { roughness: 0.35, metalness: 0 };

function Hair({ style, color }) {
  if (style === "buzz") {
    return (
      <mesh position={[0, 0.06, -0.02]} rotation={[-0.18, 0, 0]}>
        <sphereGeometry args={[0.425, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
        <meshStandardMaterial color={color} {...PLASTIC} />
      </mesh>
    );
  }
  if (style === "wavy") {
    return (
      <group>
        <mesh position={[0, 0.07, -0.03]} rotation={[-0.22, 0, 0]}>
          <sphereGeometry args={[0.44, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          <meshStandardMaterial color={color} {...PLASTIC} />
        </mesh>
        {[
          [-0.26, 0.32, 0.12],
          [0.26, 0.32, 0.12],
          [0, 0.42, 0.05],
          [-0.14, 0.4, -0.18],
          [0.14, 0.4, -0.18],
        ].map((pos, i) => (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[0.13, 16, 12]} />
            <meshStandardMaterial color={color} {...PLASTIC} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <mesh position={[0, 0.07, -0.03]} rotation={[-0.24, 0, 0]}>
      <sphereGeometry args={[0.445, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      <meshStandardMaterial color={color} {...PLASTIC} />
    </mesh>
  );
}

function Glasses() {
  return (
    <group position={[0, 0.06, 0.36]}>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 0, 0.04]}>
          <torusGeometry args={[0.095, 0.014, 10, 24]} />
          <meshStandardMaterial color="#1d1d1f" roughness={0.4} metalness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, 0.01, 0.04]}>
        <boxGeometry args={[0.12, 0.02, 0.02]} />
        <meshStandardMaterial color="#1d1d1f" roughness={0.4} metalness={0.1} />
      </mesh>
    </group>
  );
}

function Eye({ side, lidRef }) {
  return (
    <group ref={lidRef} position={[side * 0.15, 0.07, 0.355]}>
      <mesh>
        <sphereGeometry args={[0.075, 16, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.055]}>
        <sphereGeometry args={[0.034, 12, 10]} />
        <meshStandardMaterial color="#2b2118" roughness={0.25} />
      </mesh>
    </group>
  );
}

export default function MockAvatar({ options }) {
  const skin = SKIN_TONES[options.skin].value;
  const hair = HAIR_COLORS[options.hair].value;
  const outfit = OUTFIT_COLORS[options.outfit].value;

  // Reaction-layer nodes (GSAP only)
  const reactionRoot = useRef();
  const armL = useRef();
  const armR = useRef();
  const headTilt = useRef();
  const currentTl = useRef(null);

  // Idle-layer nodes (useFrame only)
  const idleRoot = useRef();
  const breath = useRef();
  const headDrift = useRef();
  const eyeLidL = useRef();
  const eyeLidR = useRef();
  const eyeLidRefs = useMemo(() => [eyeLidL, eyeLidR], []);

  useIdleMotion({ idleRef: idleRoot, breathRef: breath, headDriftRef: headDrift, eyeLidRefs });

  useEffect(() => {
    const off = onReaction((name) => {
      playPuppetReaction(
        name,
        { root: reactionRoot.current, armL: armL.current, armR: armR.current, head: headTilt.current, base: ARM_BASE },
        currentTl
      );
    });
    return () => {
      off();
      killPuppetReaction(currentTl);
    };
  }, []);

  const smileArc = Math.PI * 0.75;

  return (
    <group ref={reactionRoot}>
      <group ref={idleRoot}>
        {/* Legs + feet */}
        {[-0.13, 0.13].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.28, 0]}>
              <cylinderGeometry args={[0.085, 0.095, 0.5, 16]} />
              <meshStandardMaterial color="#3b4250" {...PLASTIC} />
            </mesh>
            <mesh position={[x, 0.05, 0.05]} scale={[1, 0.55, 1.4]}>
              <sphereGeometry args={[0.105, 16, 12]} />
              <meshStandardMaterial color="#2c2c2e" {...PLASTIC} />
            </mesh>
          </group>
        ))}

        {/* Torso (breath node wraps it) */}
        <group ref={breath} position={[0, 0.78, 0]}>
          <mesh scale={[1, 1.18, 0.82]}>
            <sphereGeometry args={[0.33, 24, 18]} />
            <meshStandardMaterial color={outfit} {...PLASTIC} />
          </mesh>
        </group>

        {/* Arms — shoulder pivots owned by the reaction layer */}
        <group ref={armL} position={[-0.33, 1.02, 0]} rotation={[0, 0, ARM_BASE.armL]}>
          <mesh position={[0, -0.21, 0]}>
            <cylinderGeometry args={[0.065, 0.07, 0.42, 14]} />
            <meshStandardMaterial color={outfit} {...PLASTIC} />
          </mesh>
          <mesh position={[0, -0.45, 0]}>
            <sphereGeometry args={[0.085, 14, 12]} />
            <meshStandardMaterial color={skin} {...PLASTIC} />
          </mesh>
        </group>
        <group ref={armR} position={[0.33, 1.02, 0]} rotation={[0, 0, ARM_BASE.armR]}>
          <mesh position={[0, -0.21, 0]}>
            <cylinderGeometry args={[0.065, 0.07, 0.42, 14]} />
            <meshStandardMaterial color={outfit} {...PLASTIC} />
          </mesh>
          <mesh position={[0, -0.45, 0]}>
            <sphereGeometry args={[0.085, 14, 12]} />
            <meshStandardMaterial color={skin} {...PLASTIC} />
          </mesh>
        </group>

        {/* Head — tilt node (reactions) wrapping drift node (idle) */}
        <group ref={headTilt} position={[0, 1.42, 0]}>
          <group ref={headDrift}>
            <mesh scale={[1, 1.05, 0.95]}>
              <sphereGeometry args={[0.42, 28, 22]} />
              <meshStandardMaterial color={skin} {...PLASTIC} />
            </mesh>
            <Eye side={-1} lidRef={eyeLidL} />
            <Eye side={1} lidRef={eyeLidR} />
            {/* Smile — torus arc centered on the bottom of the face */}
            <mesh position={[0, -0.13, 0.345]} rotation={[0, 0, -Math.PI / 2 - smileArc / 2]}>
              <torusGeometry args={[0.13, 0.02, 10, 24, smileArc]} />
              <meshStandardMaterial color="#8c4f3f" {...PLASTIC} />
            </mesh>
            <Hair style={options.hairstyle} color={hair} />
            {options.glasses && <Glasses />}
          </group>
        </group>
      </group>
    </group>
  );
}

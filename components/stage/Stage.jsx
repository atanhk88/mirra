"use client";

// The three.js stage. Alpha-transparent canvas so the CSS backdrop gradient
// of the stage card shows through. Three-point "toy plastic" lighting plus a
// soft contact shadow. Never rendered on the server (next/dynamic ssr:false).

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import MockAvatar from "./MockAvatar";
import GeneratedModel from "./GeneratedModel";
import RiggedModel from "./RiggedModel";
import PaperPuppet from "./PaperPuppet";
import Confetti from "./Confetti";

export default function Stage({ mode, options, modelUrl, puppetUrl, rigged }) {
  return (
    <Canvas
      className="stage-canvas"
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 1.3, 4.1], fov: 35 }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.65} />
      {/* Key / fill / rim */}
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-4, 2, 2]} intensity={0.5} />
      <directionalLight position={[0, 4, -4]} intensity={0.9} />

      <Suspense fallback={null}>
        {mode === "rigged" && rigged ? (
          <RiggedModel url={rigged.url} ext={rigged.ext} />
        ) : mode === "generated" && modelUrl ? (
          <GeneratedModel url={modelUrl} />
        ) : mode === "puppet" && puppetUrl ? (
          <PaperPuppet url={puppetUrl} />
        ) : (
          <MockAvatar options={options} />
        )}
        <Confetti />
      </Suspense>

      <ContactShadows position={[0, 0, 0]} opacity={0.35} blur={2.6} far={3.2} scale={6} resolution={512} />

      <OrbitControls
        enablePan={false}
        target={[0, 0.9, 0]}
        minDistance={2.2}
        maxDistance={7}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}

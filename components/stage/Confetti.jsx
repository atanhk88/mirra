"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { onReaction } from "@/lib/reactions";

const COUNT = 90;
const COLORS = ["#dfe74f", "#a8d3fb", "#f3c4f6", "#0071e3", "#f500b4", "#5e9c2a"];

export default function Confetti() {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        life: 0,
      })),
    []
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      const color = new THREE.Color();
      for (let i = 0; i < COUNT; i++) {
        mesh.setColorAt(i, color.set(COLORS[i % COLORS.length]));
      }
      mesh.instanceColor.needsUpdate = true;
    }

    return onReaction((name) => {
      if (name !== "celebrate") return;
      for (const p of particles) {
        p.pos.set((Math.random() - 0.5) * 0.5, 1.7 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5);
        p.vel.set((Math.random() - 0.5) * 3.4, 1.8 + Math.random() * 2.6, (Math.random() - 0.5) * 3.4);
        p.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        p.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
        p.life = 1.5 + Math.random() * 0.9;
      }
    });
  }, [particles]);

  useFrame((_, rawDt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(rawDt, 0.05);
    particles.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 4.6 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        dummy.position.copy(p.pos);
        dummy.rotation.copy(p.rot);
        const s = Math.min(1, p.life * 2.5);
        dummy.scale.set(s, s, s);
      } else {
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.05, 0.05, 0.012]} />
      <meshStandardMaterial roughness={0.5} metalness={0} />
    </instancedMesh>
  );
}

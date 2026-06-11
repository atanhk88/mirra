"use client";

// Hunyuan3D output: a textured but unrigged GLB. ModelAvatar gives it
// procedural idle motion and whole-body puppet reactions; if the file ever
// carries clips (e.g. a re-exported rigged GLB), they take over by name.

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import ModelAvatar from "./ModelAvatar";

export default function GeneratedModel({ url }) {
  const gltf = useGLTF(url);

  // Hunyuan GLBs ship metallic-by-default materials; with no environment map
  // in the scene they render nearly black. The baked textures already carry
  // their own shading, so display them matte.
  const scene = useMemo(() => {
    gltf.scene.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if ("metalness" in mat) mat.metalness = 0;
        if ("roughness" in mat) mat.roughness = 1;
        mat.needsUpdate = true;
      }
    });
    return gltf.scene;
  }, [gltf]);

  return <ModelAvatar object={scene} animations={gltf.animations} />;
}

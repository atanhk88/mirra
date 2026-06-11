"use client";

// Hunyuan3D output: a textured but unrigged GLB. ModelAvatar gives it
// procedural idle motion and whole-body puppet reactions; if the file ever
// carries clips (e.g. a re-exported rigged GLB), they take over by name.

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import ModelAvatar from "./ModelAvatar";

export default function GeneratedModel({ url }) {
  const gltf = useGLTF(url);

  // Hunyuan GLBs (trimesh export) stack several darkeners onto the baked
  // texture: metallic-by-default materials, a gray baseColorFactor, leftover
  // gray vertex colors, and sometimes baked AO — each multiplies the texture
  // toward black. The texture already carries its own shading, so when one
  // exists make it the sole color source and display it matte.
  const scene = useMemo(() => {
    gltf.scene.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if ("metalness" in mat) mat.metalness = 0;
        if ("roughness" in mat) mat.roughness = 1;
        if (mat.map) {
          mat.color?.set("#ffffff");
          mat.vertexColors = false;
        }
        if (mat.aoMap) mat.aoMapIntensity = 0;
        if (!mat.emissiveMap) mat.emissive?.set("#000000");
        mat.needsUpdate = true;
      }
    });
    return gltf.scene;
  }, [gltf]);

  return <ModelAvatar object={scene} animations={gltf.animations} />;
}

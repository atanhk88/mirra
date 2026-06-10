"use client";

// Hunyuan3D output: a textured but unrigged GLB. ModelAvatar gives it
// procedural idle motion and whole-body puppet reactions; if the file ever
// carries clips (e.g. a re-exported rigged GLB), they take over by name.

import { useGLTF } from "@react-three/drei";
import ModelAvatar from "./ModelAvatar";

export default function GeneratedModel({ url }) {
  const gltf = useGLTF(url);
  return <ModelAvatar object={gltf.scene} animations={gltf.animations} />;
}

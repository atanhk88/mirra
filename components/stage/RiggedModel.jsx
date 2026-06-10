"use client";

// Mixamo-rigged upload (FBX or GLB). Named clips (Waving, Excited, Sad
// Idle…) are matched to reactions by keyword inside ModelAvatar; anything
// unmatched falls back to puppet motion.

import { useFBX, useGLTF } from "@react-three/drei";
import ModelAvatar from "./ModelAvatar";

function RiggedFBX({ url }) {
  const fbx = useFBX(url);
  return <ModelAvatar object={fbx} animations={fbx.animations} />;
}

function RiggedGLB({ url }) {
  const gltf = useGLTF(url);
  return <ModelAvatar object={gltf.scene} animations={gltf.animations} />;
}

export default function RiggedModel({ url, ext }) {
  return ext === "fbx" ? <RiggedFBX url={url} /> : <RiggedGLB url={url} />;
}

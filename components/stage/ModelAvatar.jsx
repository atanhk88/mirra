"use client";

// Shared renderer for loaded models (Hunyuan GLB or Mixamo-rigged FBX/GLB).
//
// - Normalizes any model to ~1.75 units tall, feet on the ground, centered.
// - If the model carries animation clips, reactions are matched to clips by
//   name keywords and crossfaded through an AnimationMixer.
// - Reactions with no matching clip (and all reactions on unrigged Hunyuan
//   meshes) fall back to whole-body "puppet" motion: squash-and-stretch hops,
//   tilts and leans on a wrapper group.
// - The idle layer is procedural (bob/sway/breath on its own group) unless an
//   idle clip exists, in which case the clip plays and procedural breathing
//   stays subtle on the wrapper.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAnimations } from "@react-three/drei";
import { onReaction } from "@/lib/reactions";
import { playPuppetReaction, killPuppetReaction } from "@/lib/puppet";
import { useIdleMotion } from "./useIdleMotion";

const TARGET_HEIGHT = 1.75;

const CLIP_KEYWORDS = {
  idle: ["idle", "breathing", "stand"],
  celebrate: ["celebrate", "excited", "cheer", "jump", "victory", "happy"],
  wave: ["wave", "waving", "hello", "greet"],
  think: ["think", "thoughtful", "ponder"],
  proud: ["proud", "confident", "strut", "flex"],
  slump: ["slump", "sad", "defeat", "depress", "rejected", "down"],
};

function matchAction(actions, reaction) {
  const keywords = CLIP_KEYWORDS[reaction] || [];
  const names = Object.keys(actions);
  for (const kw of keywords) {
    const hit = names.find((n) => n.toLowerCase().includes(kw));
    if (hit) return actions[hit];
  }
  return null;
}

export default function ModelAvatar({ object, animations = [] }) {
  const reactionRoot = useRef();
  const idleRoot = useRef();
  const currentTl = useRef(null);
  const activeAction = useRef(null);

  const { actions, mixer } = useAnimations(animations, reactionRoot);
  const hasClips = animations.length > 0;

  // Normalize: bbox-scale to target height (Mixamo FBX arrives in cm),
  // center on x/z, plant feet at y = 0. Skinned meshes can animate outside
  // their bind-pose bounds, so disable frustum culling.
  useMemo(() => {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    object.scale.setScalar(s);
    object.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    object.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.frustumCulled = false;
        child.castShadow = true;
      }
    });
  }, [object]);

  const idleAction = hasClips ? matchAction(actions, "idle") : null;

  // Procedural idle stays on when there is no idle clip to carry the motion.
  useIdleMotion(idleAction ? {} : { idleRef: idleRoot });

  useEffect(() => {
    if (idleAction) idleAction.reset().fadeIn(0.4).play();
    return () => idleAction?.stop();
  }, [idleAction]);

  useEffect(() => {
    const playClip = (action) => {
      if (activeAction.current && activeAction.current !== idleAction) {
        activeAction.current.fadeOut(0.25);
      }
      idleAction?.fadeOut(0.25);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(0.25).play();
      activeAction.current = action;
    };

    const onFinished = (e) => {
      if (e.action !== activeAction.current) return;
      e.action.fadeOut(0.35);
      activeAction.current = null;
      idleAction?.reset().fadeIn(0.35).play();
    };

    mixer.addEventListener("finished", onFinished);
    const off = onReaction((name) => {
      const clip = hasClips ? matchAction(actions, name) : null;
      if (clip) {
        killPuppetReaction(currentTl);
        playClip(clip);
      } else {
        playPuppetReaction(name, { root: reactionRoot.current }, currentTl);
      }
    });

    return () => {
      off();
      mixer.removeEventListener("finished", onFinished);
      killPuppetReaction(currentTl);
    };
  }, [actions, mixer, hasClips, idleAction]);

  return (
    <group ref={reactionRoot}>
      <group ref={idleRoot}>
        <primitive object={object} />
      </group>
    </group>
  );
}

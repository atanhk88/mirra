// Reaction layer: GSAP timelines that animate the avatar's *reaction* nodes.
// Strict separation from the idle layer — the idle layer (useFrame) owns its
// own group nodes and is never written to by these timelines.
//
// refs: {
//   root:  THREE.Group  — whole-body position / rotation / squash-and-stretch
//   armL?: THREE.Group  — left shoulder pivot (mock avatar only)
//   armR?: THREE.Group  — right shoulder pivot
//   head?: THREE.Group  — head tilt pivot (reaction-owned, not the idle drift node)
//   base?: { armL: number, armR: number } — resting rotation.z for the arms
// }
//
// Every timeline starts by easing back to base (so an interrupted reaction
// never leaves the avatar in a broken pose) and always ends at base.

import gsap from "gsap";

const ARM_BASE = { armL: -0.25, armR: 0.25 };

function settleToBase(tl, refs, at = 0, duration = 0.16) {
  const base = refs.base || ARM_BASE;
  tl.to(refs.root.position, { x: 0, y: 0, z: 0, duration, ease: "power1.out" }, at);
  tl.to(refs.root.rotation, { x: 0, y: 0, z: 0, duration, ease: "power1.out" }, at);
  tl.to(refs.root.scale, { x: 1, y: 1, z: 1, duration, ease: "power1.out" }, at);
  if (refs.armL) tl.to(refs.armL.rotation, { x: 0, y: 0, z: base.armL, duration }, at);
  if (refs.armR) tl.to(refs.armR.rotation, { x: 0, y: 0, z: base.armR, duration }, at);
  if (refs.head) tl.to(refs.head.rotation, { x: 0, y: 0, z: 0, duration }, at);
}

function hop(tl, root, height, { squash = 0.1, up = 0.26, down = 0.22 } = {}) {
  tl.to(root.scale, { x: 1 + squash, y: 1 - squash, z: 1 + squash, duration: 0.12, ease: "power2.in" });
  tl.to(root.scale, { x: 1 - squash * 0.6, y: 1 + squash, z: 1 - squash * 0.6, duration: 0.14, ease: "power2.out" });
  tl.to(root.position, { y: height, duration: up, ease: "power2.out" }, "<");
  tl.to(root.scale, { x: 1, y: 1, z: 1, duration: 0.16 }, "<+=0.08");
  tl.to(root.position, { y: 0, duration: down, ease: "power2.in" });
  tl.to(root.scale, { x: 1 + squash * 0.7, y: 1 - squash * 0.7, z: 1 + squash * 0.7, duration: 0.09, ease: "power1.out" });
  tl.to(root.scale, { x: 1, y: 1, z: 1, duration: 0.14, ease: "power1.out" });
}

function buildCelebrate(tl, refs) {
  const { root, armL, armR } = refs;
  const base = refs.base || ARM_BASE;
  if (armL && armR) {
    tl.to(armL.rotation, { z: -2.6, duration: 0.3, ease: "back.out(2)" }, 0.16);
    tl.to(armR.rotation, { z: 2.6, duration: 0.3, ease: "back.out(2)" }, 0.16);
  }
  tl.add("hops", 0.16);
  const hopsTl = gsap.timeline();
  hop(hopsTl, root, 0.5);
  hop(hopsTl, root, 0.32, { squash: 0.08, up: 0.22, down: 0.2 });
  tl.add(hopsTl, "hops");
  if (!armL || !armR) {
    tl.to(root.rotation, { z: 0.14, duration: 0.2, yoyo: true, repeat: 3 }, "hops");
  }
  if (armL && armR) {
    tl.to(armL.rotation, { z: base.armL, duration: 0.35, ease: "power2.inOut" }, "-=0.2");
    tl.to(armR.rotation, { z: base.armR, duration: 0.35, ease: "power2.inOut" }, "<");
  } else {
    tl.to(root.rotation, { z: 0, duration: 0.25, ease: "power1.out" }, "-=0.1");
  }
}

function buildWave(tl, refs) {
  const { root, armR } = refs;
  const base = refs.base || ARM_BASE;
  if (armR) {
    tl.to(armR.rotation, { z: 2.6, duration: 0.32, ease: "back.out(1.8)" }, 0.16);
    tl.to(root.rotation, { z: -0.06, duration: 0.32, ease: "power1.out" }, "<");
    tl.to(armR.rotation, { z: 2.2, duration: 0.14, yoyo: true, repeat: 5, ease: "sine.inOut" });
    tl.to(armR.rotation, { z: base.armR, duration: 0.4, ease: "power2.inOut" });
    tl.to(root.rotation, { z: 0, duration: 0.4, ease: "power1.inOut" }, "<");
  } else {
    tl.to(root.rotation, { z: 0.18, duration: 0.28, ease: "power1.inOut" }, 0.16);
    tl.to(root.rotation, { z: -0.18, duration: 0.28, yoyo: true, repeat: 3, ease: "sine.inOut" });
    tl.to(root.rotation, { z: 0, duration: 0.3, ease: "power1.out" });
  }
}

function buildThink(tl, refs) {
  const { root, armR, head } = refs;
  const base = refs.base || ARM_BASE;
  if (head) tl.to(head.rotation, { z: 0.2, x: 0.1, duration: 0.45, ease: "power2.out" }, 0.16);
  if (armR) tl.to(armR.rotation, { z: 2.25, x: -0.5, duration: 0.45, ease: "power2.out" }, 0.16);
  if (!armR && !head) {
    tl.to(root.rotation, { x: -0.06, y: 0.32, duration: 0.5, ease: "power2.out" }, 0.16);
    tl.to(root.rotation, { y: -0.26, duration: 0.7, ease: "sine.inOut" }, "+=0.5");
  }
  tl.to({}, { duration: 0.9 });
  if (head) tl.to(head.rotation, { z: 0, x: 0, duration: 0.45, ease: "power2.inOut" });
  if (armR) tl.to(armR.rotation, { z: base.armR, x: 0, duration: 0.45, ease: "power2.inOut" }, head ? "<" : ">");
  if (!armR && !head) tl.to(root.rotation, { x: 0, y: 0, duration: 0.5, ease: "power2.inOut" });
}

function buildProud(tl, refs) {
  const { root, armL, armR } = refs;
  const base = refs.base || ARM_BASE;
  tl.to(root.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.4, ease: "power2.out" }, 0.16);
  tl.to(root.rotation, { x: -0.13, duration: 0.4, ease: "power2.out" }, "<");
  if (armL && armR) {
    tl.to(armL.rotation, { z: -0.7, duration: 0.4, ease: "power2.out" }, "<");
    tl.to(armR.rotation, { z: 0.7, duration: 0.4, ease: "power2.out" }, "<");
  }
  tl.to({}, { duration: 0.8 });
  tl.to(root.scale, { x: 1, y: 1, z: 1, duration: 0.45, ease: "power2.inOut" });
  tl.to(root.rotation, { x: 0, duration: 0.45, ease: "power2.inOut" }, "<");
  if (armL && armR) {
    tl.to(armL.rotation, { z: base.armL, duration: 0.45, ease: "power2.inOut" }, "<");
    tl.to(armR.rotation, { z: base.armR, duration: 0.45, ease: "power2.inOut" }, "<");
  }
}

function buildSlump(tl, refs) {
  const { root, armL, armR, head } = refs;
  tl.to(root.rotation, { x: 0.28, duration: 0.55, ease: "power2.out" }, 0.16);
  tl.to(root.position, { y: -0.12, duration: 0.55, ease: "power2.out" }, "<");
  if (head) tl.to(head.rotation, { x: 0.35, duration: 0.55, ease: "power2.out" }, "<");
  if (armL && armR) {
    tl.to(armL.rotation, { z: -0.05, duration: 0.55, ease: "power2.out" }, "<");
    tl.to(armR.rotation, { z: 0.05, duration: 0.55, ease: "power2.out" }, "<");
  }
  tl.to({}, { duration: 0.9 });
  settleToBase(tl, refs, ">", 0.7);
}

const BUILDERS = {
  celebrate: buildCelebrate,
  wave: buildWave,
  think: buildThink,
  proud: buildProud,
  slump: buildSlump,
};

// Kills any in-flight reaction and plays a new one. `currentRef` is a React
// ref holding the active timeline so successive reactions never fight.
export function playPuppetReaction(name, refs, currentRef) {
  const build = BUILDERS[name];
  if (!build || !refs.root) return null;
  if (currentRef.current) currentRef.current.kill();
  const tl = gsap.timeline({
    onComplete() {
      if (currentRef.current === tl) currentRef.current = null;
    },
  });
  currentRef.current = tl;
  settleToBase(tl, refs, 0);
  build(tl, refs);
  settleToBase(tl, refs, ">", 0.25);
  return tl;
}

export function killPuppetReaction(currentRef) {
  if (currentRef.current) {
    currentRef.current.kill();
    currentRef.current = null;
  }
}

export { ARM_BASE };

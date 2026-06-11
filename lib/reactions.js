// Tiny pub/sub event bus for avatar reactions.
// Any UI element can trigger a reaction; the active avatar component
// subscribes and performs it.

const listeners = new Set();

export const REACTIONS = [
  "celebrate",
  "wave",
  "clap",
  "nod",
  "laugh",
  "dance",
  "think",
  "proud",
  "shrug",
  "slump",
];

export const REACTION_LABELS = {
  celebrate: "Celebrate",
  wave: "Wave",
  clap: "Clap",
  nod: "Nod",
  laugh: "Laugh",
  dance: "Dance",
  think: "Think",
  proud: "Proud",
  shrug: "Shrug",
  slump: "Slump",
};

export function onReaction(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function triggerReaction(name, detail = {}) {
  for (const fn of listeners) fn(name, detail);
}

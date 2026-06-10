// Tiny pub/sub event bus for avatar reactions.
// Any UI element can trigger a reaction; the active avatar component
// (mock, generated, or rigged) subscribes and performs it.

const listeners = new Set();

export const REACTIONS = ["celebrate", "wave", "think", "proud", "slump"];

export const REACTION_LABELS = {
  celebrate: "Celebrate",
  wave: "Wave",
  think: "Think",
  proud: "Proud",
  slump: "Slump",
};

export function onReaction(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function triggerReaction(name, detail = {}) {
  for (const fn of listeners) fn(name, detail);
}

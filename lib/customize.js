// Grounded customization options — everyday looks only, no fantasy.

export const SKIN_TONES = [
  { name: "Porcelain", value: "#f6d5b8" },
  { name: "Warm beige", value: "#eab98f" },
  { name: "Tan", value: "#cf9265" },
  { name: "Brown", value: "#a96b44" },
  { name: "Deep brown", value: "#7c4a2d" },
];

export const HAIR_COLORS = [
  { name: "Black", value: "#2b2118" },
  { name: "Dark brown", value: "#4a3220" },
  { name: "Chestnut", value: "#8a5a2b" },
  { name: "Auburn", value: "#a8472e" },
  { name: "Blond", value: "#d6b06a" },
  { name: "Gray", value: "#b5b8bf" },
];

export const HAIRSTYLES = [
  { name: "Short", value: "short" },
  { name: "Wavy", value: "wavy" },
  { name: "Buzz", value: "buzz" },
];

export const OUTFIT_COLORS = [
  { name: "Steel blue", value: "#5a7d9a" },
  { name: "Olive", value: "#7d9a5a" },
  { name: "Plum", value: "#9a5a7d" },
  { name: "Charcoal", value: "#444a52" },
  { name: "Terracotta", value: "#c2703e" },
];

export const DEFAULT_OPTIONS = {
  skin: 1,
  hair: 1,
  hairstyle: "short",
  outfit: 0,
  glasses: false,
  tweaks: "",
};

// Turns the option diff into a single constrained Gemini edit instruction.
export function buildEditInstruction(options) {
  const parts = [
    `skin tone to ${SKIN_TONES[options.skin].name.toLowerCase()}`,
    `hair color to ${HAIR_COLORS[options.hair].name.toLowerCase()}`,
    `hairstyle to a ${options.hairstyle} everyday haircut`,
    `outfit color to ${OUTFIT_COLORS[options.outfit].name.toLowerCase()}`,
    options.glasses ? "add simple everyday glasses" : "no glasses",
  ];
  if (options.tweaks.trim()) parts.push(options.tweaks.trim());
  return parts.join("; ");
}

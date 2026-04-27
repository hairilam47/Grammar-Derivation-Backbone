// EAStudio Path B Phase 3 — Organisational Unit hue helper.
//
// Maps an OU id to a deterministic, *categorical* hue. The output
// is a CSS `hsl(...)` colour with a fixed saturation and lightness:
//
//   S = 35%   (low chroma — the overlay must not compete with
//              first-class semantic colour cues elsewhere)
//   L = 22%   (dark, suitable for an overlay on the studio's
//              dark canvas surface)
//
// Hue is derived from a deterministic djb2 hash of the OU id mod
// 360 so two browsers viewing the same workspace agree on the
// colour, and a freshly-created unit gets a stable colour that
// never shifts as the registry grows.
//
// Categorical-only contract: this helper exposes `hashHueForOu`
// (the numeric hue in [0, 359]) and `cssForOu` (the formatted
// `hsl(h, 35%, 22%)` string). It deliberately does NOT expose a
// continuous range, a sequential ramp, or any opinion about
// which OUs are "more" or "less" — units are categorical labels.

export const OU_HUE_SATURATION_PERCENT = 35 as const;
export const OU_HUE_LIGHTNESS_PERCENT = 22 as const;

// Classic djb2. Fast, dependency-free, and well-known to produce
// uniform-looking distributions for short identifiers.
function djb2(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  // Keep the result in the unsigned 32-bit range.
  return hash >>> 0;
}

export function hashHueForOu(id: string): number {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("hashHueForOu requires a non-empty string id.");
  }
  return djb2(id) % 360;
}

export function cssForOu(id: string): string {
  const h = hashHueForOu(id);
  return `hsl(${h}, ${OU_HUE_SATURATION_PERCENT}%, ${OU_HUE_LIGHTNESS_PERCENT}%)`;
}

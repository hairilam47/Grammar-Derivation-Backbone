// EAStudio Path B Phase 3 — build-time invariants for the OU hue helper.
//
// Guards two properties of `hashHueForOu` / `cssForOu`:
//
//   1. Determinism — the same id always produces the same hue
//      and the same css string. Two browsers viewing the same
//      workspace must agree on the colour for unit "ou-x".
//   2. Categorical-only — saturation is locked at 35%, lightness
//      at 22%, and the hue is an integer in [0, 359]. The brief
//      forbids continuous, sequential, or value-encoded ramps;
//      these constants are the structural enforcement of that ban.
import {
  OU_HUE_LIGHTNESS_PERCENT,
  OU_HUE_SATURATION_PERCENT,
  cssForOu,
  hashHueForOu,
} from "./ouHue";

const PREFIX = "ACW Path B Phase 3 OU hue invariant violation";

if (OU_HUE_SATURATION_PERCENT !== 35) {
  throw new Error(
    `${PREFIX}: saturation drift. Categorical OU overlay must remain at S=35%; got ${OU_HUE_SATURATION_PERCENT}.`,
  );
}
if (OU_HUE_LIGHTNESS_PERCENT !== 22) {
  throw new Error(
    `${PREFIX}: lightness drift. Categorical OU overlay must remain at L=22%; got ${OU_HUE_LIGHTNESS_PERCENT}.`,
  );
}

for (const id of ["ou-a", "ou-b", "ou-with-a-much-longer-id-than-most"]) {
  const h1 = hashHueForOu(id);
  const h2 = hashHueForOu(id);
  if (h1 !== h2) {
    throw new Error(`${PREFIX}: hashHueForOu("${id}") was non-deterministic.`);
  }
  if (!Number.isInteger(h1) || h1 < 0 || h1 > 359) {
    throw new Error(`${PREFIX}: hashHueForOu("${id}") returned out-of-range hue ${h1}.`);
  }
  const css = cssForOu(id);
  const expected = `hsl(${h1}, ${OU_HUE_SATURATION_PERCENT}%, ${OU_HUE_LIGHTNESS_PERCENT}%)`;
  if (css !== expected) {
    throw new Error(
      `${PREFIX}: cssForOu("${id}") drifted from the categorical formula. Expected "${expected}", got "${css}".`,
    );
  }
}

let threw = false;
try {
  hashHueForOu("");
} catch {
  threw = true;
}
if (!threw) {
  throw new Error(`${PREFIX}: hashHueForOu accepted an empty id.`);
}

export function assertOuHueInvariants(): void {
  if (OU_HUE_SATURATION_PERCENT !== 35 || OU_HUE_LIGHTNESS_PERCENT !== 22) {
    throw new Error(`${PREFIX}: OU hue constants drifted at runtime.`);
  }
}

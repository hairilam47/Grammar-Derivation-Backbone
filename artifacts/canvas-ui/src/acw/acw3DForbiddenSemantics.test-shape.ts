// ACW v3 — forbidden-semantics invariants for the 3D renderer.
//
// Master prompt v3 brief: depth represents decomposition only —
// never priority, risk, severity, or any computed weight. Motion
// and animation cannot imply timeline or change. The 3D canvas
// must be visually as inert as its 2D twin.
//
// This module source-scans `Canvas3DStructural.tsx` for tokens
// that, if present, would indicate a regression toward judgement,
// motion, or judgemental colour. Any match throws at bundle load.
//
// File suffix `.test-shape.ts` per the established negative-shape
// convention. Removing the App.tsx side-effect import (and this
// file) is sufficient to drop the gate; no other module references
// it.
const SOURCES = import.meta.glob<string>(
  ["/src/components/acw/Canvas3DStructural.tsx"],
  { eager: true, query: "?raw", import: "default" },
);

const PREFIX = "ACW v3 forbidden-semantics invariant violation";

// Each entry is matched as a case-insensitive substring against
// the file's source text (with comments stripped). The list is
// deliberately conservative — `weight`, `score`, `risk`, etc.
// are common enough words that any innocent appearance must be
// rephrased rather than allowlisted.
//
// Notes on coverage:
//   - Animation primitives: useFrame, useSpring, setInterval,
//     requestAnimationFrame, lerp, damp, easing, tween, keyframe,
//     animate.
//   - Judgement / weighting tokens: priority, risk, severity,
//     score, weight, urgency, importance.
//   - Time tokens: timeline, duration, elapsed.
//   - Traffic-light colour names: "red", "green", "amber",
//     "warning", "danger". (We use neutral hex codes only.)
const FORBIDDEN_TOKENS: readonly string[] = [
  "useFrame",
  "useSpring",
  "setInterval",
  "requestAnimationFrame",
  "easing",
  "tween",
  "keyframe",
  "animate",
  "priority",
  "risk",
  "severity",
  "score",
  "weight",
  "urgency",
  "importance",
  "timeline",
  "duration",
  "elapsed",
  "warning",
  "danger",
];

// Strip line comments (//...) and block comments (/* ... */) so
// that documentation that NAMES the forbidden tokens (this very
// module's prose, mirrored into the renderer's banner comment,
// for instance) does not trip the assertion. The token must
// appear in actual code to count.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

for (const [path, raw] of Object.entries(SOURCES)) {
  const code = stripComments(raw).toLowerCase();
  for (const token of FORBIDDEN_TOKENS) {
    if (code.includes(token.toLowerCase())) {
      throw new Error(
        `${PREFIX}: file "${path}" contains forbidden token "${token}". The 3D canvas must remain inert: depth represents decomposition only, no animation, no judgemental palette, no priority / risk / severity coupling.`,
      );
    }
  }
}

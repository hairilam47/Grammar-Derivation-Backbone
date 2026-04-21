// ACW Track 3 — forbidden-semantics invariant.
//
// Both Track 3 renderers must contain ZERO of the following
// tokens in their executable source. Only `//` and `/* */`
// comments are stripped before scanning (so this header may
// reference banned words freely); STRING LITERALS ARE SCANNED.
// A renderer that smuggles `"red"` or `"recommended"` as a
// runtime label, alt-text, className suffix, or test id is the
// most likely leak vector for the forbidden semantics, so the
// invariant deliberately catches it. The Track 3 surface text
// is independently asserted by the static-text guard.
//
//   - Animation primitives: useFrame, setInterval,
//     requestAnimationFrame, easing, tween, keyframe, animate.
//   - Judgement / weighting: priority, risk, severity, score,
//     weight, urgency, importance, health, maturity, correctness.
//   - Time tokens: timeline, duration, elapsed.
//   - Traffic-light colour names: red, green, yellow, amber,
//     warning, danger.
//   - Recommendation tokens: recommended, optimal, optimised,
//     optimized, best, validated, approved.
//
// Modelled on `acw3DForbiddenSemantics.test-shape.ts`. The
// scanner is case-insensitive and substring-based; the
// comment-strip pass means a banned token may still appear in a
// `//` or `/* */` documentation block (e.g. this file does so
// freely).

const RENDERER_SOURCES = import.meta.glob<string>(
  [
    "/src/components/acw/track3/Track3Canvas2D.tsx",
    "/src/components/acw/track3/Track3Canvas3D.tsx",
  ],
  { eager: true, query: "?raw", import: "default" },
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

const FORBIDDEN_TOKENS: ReadonlyArray<{ readonly category: string; readonly tokens: readonly string[] }> = [
  {
    category: "animation",
    tokens: ["useFrame", "setInterval", "requestAnimationFrame", "easing", "tween", "keyframe", "animate"],
  },
  {
    category: "judgement",
    tokens: [
      "priority",
      "risk",
      "severity",
      "score",
      "weight",
      "urgency",
      "importance",
      "health",
      "maturity",
      "correctness",
    ],
  },
  {
    category: "time",
    tokens: ["timeline", "duration", "elapsed"],
  },
  {
    category: "traffic-light",
    tokens: ["red", "green", "yellow", "amber", "warning", "danger"],
  },
  {
    category: "recommendation",
    tokens: ["recommended", "optimal", "optimised", "optimized", "best", "validated", "approved"],
  },
];

function assertNoForbiddenSemantics(): void {
  for (const [path, raw] of Object.entries(RENDERER_SOURCES)) {
    // String literals are NOT stripped: a banned token smuggled
    // as a runtime label (`"red"`, `"recommended"`, etc.) is
    // exactly what this invariant must catch.
    const stripped = stripComments(raw).toLowerCase();
    for (const { category, tokens } of FORBIDDEN_TOKENS) {
      for (const token of tokens) {
        // Token-bounded match so identifiers that contain a
        // banned substring (e.g. "scored" inside "scorecard")
        // are also flagged — that is intentional.
        const re = new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`);
        if (re.test(stripped)) {
          throw new Error(
            `ACW Track 3 forbidden-semantics invariant: file "${path}" contains the ${category} token "${token}". Track 3 renderers must remain inert; the ${category} concept is forbidden.`,
          );
        }
      }
    }
  }
}

assertNoForbiddenSemantics();

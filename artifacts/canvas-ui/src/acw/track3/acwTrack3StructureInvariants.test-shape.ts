// ACW Track 3 — structural-identity invariant.
//
// Both Track 3 renderers (`Track3Canvas2D.tsx` and
// `Track3Canvas3D.tsx`) MUST consume the shared visibility
// helper `enumerateLensVisibility(...)` so neither can fabricate
// visibility the other does not surface. They also must NOT
// reach into the authored ACW workspace via any store hook
// (`useSyncExternalStore` against `acwStore`, `getWorkspace`,
// `subscribe` from `acw/acwStore`), because Track 3 derives its
// own structure and never reads the authored workspace.
//
// Phase 3 (Task #80) added two structural assertions:
//   - The retired `track3AdcBounds.ts` module must be ABSENT
//     (Track 3 no longer projects ADC bounds).
//   - `compileTrack3Specs(state)` must take a single CTAD-state
//     argument — the `bounds` parameter is gone.
//
// Modelled on `acw3DStructureInvariants.test-shape.ts`. The scan
// is a literal-substring check on the file source after BOTH
// comments AND string literals are stripped, so a documentation
// comment or a string literal that mentions a forbidden token
// does NOT trip the invariant — and, symmetrically, a string
// literal that mentions a required token cannot satisfy it.

const RENDERER_SOURCES = import.meta.glob<string>(
  ["/src/components/acw/track3/Track3Canvas2D.tsx", "/src/components/acw/track3/Track3Canvas3D.tsx"],
  { eager: true, query: "?raw", import: "default" },
);

function stripComments(src: string): string {
  // Block comments first, then line comments. The replacement
  // preserves line counts so any future error-line reporting
  // remains accurate.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

const REQUIRED_TOKENS: readonly string[] = [
  // Both renderers must call the shared helper.
  "enumerateLensVisibility(",
];

const FORBIDDEN_TOKENS: readonly string[] = [
  // Authored ACW store / view-state hooks — Track 3 never reads
  // the authored workspace.
  "@/acw/acwStore",
  "acw/acwStore",
  "@/acw/acwViewState",
  "acw/acwViewState",
  "@/acw/acwValidator",
  "acw/acwValidator",
  "@/acw/acwGrammarHooks",
  "acw/acwGrammarHooks",
  "getWorkspace(",
];

function assertRendererStructure(): void {
  const entries = Object.entries(RENDERER_SOURCES);
  if (entries.length !== 2) {
    throw new Error(
      `ACW Track 3 structural-identity invariant: expected exactly 2 renderer source files (Track3Canvas2D.tsx and Track3Canvas3D.tsx). Found ${entries.length}.`,
    );
  }
  for (const [path, raw] of entries) {
    // String literals are NOT stripped here: the required-token
    // check looks for a real call-site (`enumerateLensVisibility(`
    // is followed by argument syntax, not the literal text) and
    // the forbidden-token check should still catch a smuggled
    // string-literal import path or call.
    const stripped = stripComments(raw);
    for (const token of REQUIRED_TOKENS) {
      if (stripped.indexOf(token) === -1) {
        throw new Error(
          `ACW Track 3 structural-identity invariant: file "${path}" does not call \`${token}\`. Both Track 3 renderers must consume the shared visibility helper so neither can fabricate visibility the other does not surface.`,
        );
      }
    }
    for (const token of FORBIDDEN_TOKENS) {
      if (stripped.indexOf(token) !== -1) {
        throw new Error(
          `ACW Track 3 structural-identity invariant: file "${path}" references the forbidden token "${token}". Track 3 renderers must derive their own structure from the props passed by the shell; they must not read the authored ACW workspace store.`,
        );
      }
    }
  }
}

assertRendererStructure();

// ---- Phase 3 (Task #80) structural assertions ------------------
// (1) The retired track3AdcBounds module must be ABSENT.
const TRACK3_DIR_SOURCES = import.meta.glob<string>(
  ["/src/acw/track3/*.ts", "/src/acw/track3/*.tsx"],
  { eager: true, query: "?raw", import: "default" },
);
function assertAdcBoundsModuleAbsent(): void {
  for (const path of Object.keys(TRACK3_DIR_SOURCES)) {
    if (path.endsWith("/track3AdcBounds.ts")) {
      throw new Error(
        `ACW Track 3 structural-identity invariant (Phase 3): the file "${path}" must be deleted. Track 3 no longer projects ADC bounds; the entire bounds projection module is retired.`,
      );
    }
  }
}
assertAdcBoundsModuleAbsent();

// (2) The DiagramSpec adapter compiler must take exactly ONE
//     argument (the CTAD state). The retired second `bounds`
//     argument must be gone.
function assertCompilerSignatureBoundsFree(): void {
  const adapterPath = "/src/acw/track3/track3DiagramAdapter.ts";
  const raw = TRACK3_DIR_SOURCES[adapterPath];
  if (raw === undefined) {
    throw new Error(
      `ACW Track 3 structural-identity invariant: adapter source "${adapterPath}" not found.`,
    );
  }
  const stripped = stripComments(raw);
  // The compiler MUST be exported. We pin its single-argument
  // signature by requiring `compileTrack3Specs(state: CtadStateLike)`
  // and rejecting any occurrence of the retired bounds positional
  // arg or the AdcBounds type token.
  if (stripped.indexOf("export function compileTrack3Specs(") === -1) {
    throw new Error(
      `ACW Track 3 structural-identity invariant: adapter must export a top-level \`compileTrack3Specs\` function.`,
    );
  }
  // Reject the retired second-argument shapes.
  const retiredSignatures: readonly RegExp[] = [
    /compileTrack3Specs\([^)]*bounds\s*:\s*AdcBounds/,
    /compileTrack3Specs\([^)]*,\s*bounds/,
  ];
  for (const re of retiredSignatures) {
    if (re.test(stripped)) {
      throw new Error(
        `ACW Track 3 structural-identity invariant (Phase 3): adapter signature still references a retired \`bounds\` argument (matched ${re}). Phase 3 removed ADC bounds from Track 3.`,
      );
    }
  }
  if (stripped.indexOf("AdcBounds") !== -1) {
    throw new Error(
      `ACW Track 3 structural-identity invariant (Phase 3): adapter source still references the retired \`AdcBounds\` type. Phase 3 removed it from track3Types.`,
    );
  }
}
assertCompilerSignatureBoundsFree();

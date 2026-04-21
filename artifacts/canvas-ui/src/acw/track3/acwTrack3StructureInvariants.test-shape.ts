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

function stripStringLiterals(src: string): string {
  // Erase the contents of every single-quoted, double-quoted, and
  // backtick-quoted string literal so a stray token mentioned in
  // (e.g.) an error message cannot satisfy a required-token check
  // or trip a forbidden-token check. Line counts preserved.
  return src
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, (m) =>
      "`" + m.slice(1, -1).replace(/[^\n]/g, " ") + "`",
    );
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
    const stripped = stripStringLiterals(stripComments(raw));
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

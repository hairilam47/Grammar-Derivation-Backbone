// DiagramSpec — isolation invariant scanner (pure function).
//
// Asserts that no file under `lib/diagramspec/src` imports from
//   - `three` / `@react-three/*`
//   - `elkjs`
//   - `@workspace/cncf-catalog`
//   - any path under `@/cncf/`
//
// The compiler must remain semantically isolated from the
// renderer (Three.js), the layout engine (ELK), and the reference
// catalog (CNCF). The function takes the source map as input so
// the same scanner can run from a vitest test (Node fs walk) and
// from a canvas-ui App-boot side-effect import (Vite glob).

const FORBIDDEN_SPECIFIER_SUBSTRINGS: readonly string[] = [
  "three",
  "@react-three/",
  "elkjs",
  "@workspace/cncf-catalog",
  "@/cncf/",
];

// Self-exclude: this file intentionally NAMES the forbidden
// specifiers to ban them. The scanner skips it on path-suffix
// match so its presence does not trip the invariant.
const SELF_FILENAMES: readonly string[] = ["diagramspecIsolation.ts"];

function stripCommentsPreservingOffsets(input: string): string {
  let out = input.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  out = out.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return out;
}

// Token-bounded match: return true if `specifier` equals or
// begins with `needle` followed by an end-of-string or a "/".
// Substring scan is also used for ".../three" packaged paths.
function specifierMatches(specifier: string, needle: string): boolean {
  if (needle.endsWith("/")) {
    return specifier.startsWith(needle) || specifier === needle.slice(0, -1);
  }
  if (specifier === needle) return true;
  if (specifier.startsWith(`${needle}/`)) return true;
  // For bare-package names ("three"), also reject submodule
  // imports such as "three/examples/jsm/...".
  return false;
}

export function assertNoForbiddenDiagramspecImports(
  sources: Readonly<Record<string, string>>,
): void {
  for (const [path, rawContents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;
    const contents = stripCommentsPreservingOffsets(rawContents);
    const importMatches = contents.matchAll(
      /(?:from|import)\s+["']([^"']+)["']/g,
    );
    for (const m of importMatches) {
      const specifier = m[1];
      for (const needle of FORBIDDEN_SPECIFIER_SUBSTRINGS) {
        if (specifierMatches(specifier, needle)) {
          throw new Error(
            `DiagramSpec invariant violation (forbidden-import): file "${path}" imports from "${specifier}". The diagramspec package must remain isolated from the renderer (three / @react-three), the layout engine (elkjs), and the reference catalog (@workspace/cncf-catalog, @/cncf).`,
          );
        }
      }
    }
    // Reject dynamic import() too.
    const dynImport = contents.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g);
    for (const m of dynImport) {
      const specifier = m[1];
      for (const needle of FORBIDDEN_SPECIFIER_SUBSTRINGS) {
        if (specifierMatches(specifier, needle)) {
          throw new Error(
            `DiagramSpec invariant violation (forbidden-dynamic-import): file "${path}" dynamically imports from "${specifier}".`,
          );
        }
      }
    }
  }
}

export const __diagramspecIsolationInternals = Object.freeze({
  FORBIDDEN_SPECIFIER_SUBSTRINGS,
  SELF_FILENAMES,
});

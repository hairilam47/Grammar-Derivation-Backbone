// CNCF reference catalog — build-time isolation invariant.
//
// The CNCF module is a frozen, build-time data catalog plus a
// pure binding-hint engine. It must:
//   - never fetch (no network imports / fetch calls baked into
//     module-level source)
//   - never import any Decision-Canvas decision-pipeline module
//   - import from the CTAD module ONLY through the read-only
//     registry surface (`@/ctad/ctadRegistry`) and the
//     read/write CTAD stores it explicitly needs (the value
//     store, constraints store, and applied-cards store)
//
// File suffix `.test-shape.ts` mirrors the negative-shape pattern
// used by the ACW and CTAD invariants: removing this file plus
// its side-effect import in App.tsx restores pre-CNCF behaviour
// with no other change required.

const CNCF_SOURCES = import.meta.glob<string>(
  ["/src/cncf/**/*.{ts,tsx}"],
  { eager: true, query: "?raw", import: "default" },
);

// Denylist (substrings inside quoted import specifiers).
const FORBIDDEN_IMPORT_SPECIFIERS: readonly string[] = [
  "governance/portfolioStore",
  "governance/signalsStore",
  "governance/adsBuilder",
  "governance/ecpBuilder",
  "governance/ecpSections",
  "governance/exposureDerive",
  "governance/exposureNarratives",
  "governance/responsibilityLens",
  "governance/scenarioReading",
  "governance/decisionReentry",
  "governance/export",
  "governance/hash",
  "governance/identity",
  "architecture-grammar",
  "/lib/architecture-grammar",
  "@workspace/architecture-grammar",
];

// Self-exclude: this file intentionally NAMES the forbidden
// specifiers to ban them.
const SELF_FILENAMES: readonly string[] = [
  "cncfIsolationInvariants.test-shape.ts",
];

// Positive allowlist: the CNCF module may import ONLY from this
// closed set of import-specifier prefixes. Any new dependency
// requires extending this list with a documented justification.
const ALLOWED_IMPORT_PREFIXES: readonly string[] = [
  "./",
  "../",
  // CTAD registry — read-only catalog of parameters/options used
  // for hint validation.
  "@/ctad/ctadRegistry",
  // CTAD value store — read for current values; write for
  // applying card sets effects via the engine.
  "@/ctad/ctadStore",
  // CTAD constraint store — read/write for tracking the
  // contribution list per param.
  "@/ctad/ctadConstraintsStore",
  // CTAD applied-cards store — read/write for the audit log.
  "@/ctad/ctadAppliedCardsStore",
];

function isAllowedSpecifier(specifier: string): boolean {
  for (const prefix of ALLOWED_IMPORT_PREFIXES) {
    if (specifier === prefix) return true;
    if (prefix.endsWith("/") && specifier.startsWith(prefix)) return true;
    if (!prefix.endsWith("/") && specifier.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export function assertNoForbiddenCncfImports(
  sources: Record<string, string>,
): void {
  for (const [path, contents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;
    const importMatches = contents.matchAll(/(?:from|import)\s+["']([^"']+)["']/g);
    for (const m of importMatches) {
      const specifier = m[1];
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        if (specifier.indexOf(forbidden) !== -1) {
          throw new Error(
            `CNCF invariant violation (denylist): file "${path}" imports from a Decision Canvas decision-pipeline module ("${specifier}"). The CNCF reference catalog must remain a frozen, build-time data plus pure engine.`,
          );
        }
      }
      if (!isAllowedSpecifier(specifier)) {
        throw new Error(
          `CNCF invariant violation (allowlist): file "${path}" imports from "${specifier}" which is not on the CNCF allowlist. To add a permitted dependency, edit ALLOWED_IMPORT_PREFIXES in cncfIsolationInvariants.test-shape.ts and document why the new dependency keeps the catalog bundled and inert.`,
        );
      }
    }
    // No-fetch invariant: the catalog is bundled, never fetched.
    // Reject any module-level `fetch(`, `XMLHttpRequest`, or
    // `import(` that could pull external data at runtime.
    if (/\bfetch\s*\(/.test(contents)) {
      throw new Error(
        `CNCF invariant violation (no-fetch): file "${path}" contains a fetch() call. The CNCF catalog must be bundled, never fetched.`,
      );
    }
    if (/new\s+XMLHttpRequest\b/.test(contents)) {
      throw new Error(
        `CNCF invariant violation (no-fetch): file "${path}" instantiates XMLHttpRequest. The CNCF catalog must be bundled, never fetched.`,
      );
    }
    if (/\bimport\s*\(/.test(contents)) {
      throw new Error(
        `CNCF invariant violation (no-fetch): file "${path}" uses dynamic import(). The CNCF catalog must be statically bundled.`,
      );
    }
  }
}

assertNoForbiddenCncfImports(CNCF_SOURCES);

// ACW Workspace Builder — build-time decoupling invariant.
//
// Per Task #44 step 6: ACW source must not import from the Decision
// Canvas decision pipeline (portfolio store, signals store,
// derivers, grammar engine, freeze / export). The empty workspace
// is a sibling lens to the Decision Canvas and must remain
// constitutionally inert; any future regression that crosses the
// isolation line fails the bundle at build time via this module.
//
// File suffix `.test-shape.ts` mirrors the Phase 6 negative-shape
// pattern: this module's exports are predicates, not feature
// surface. Removing this file plus its side-effect import in
// App.tsx restores pre-ACW behaviour with no other change required.
//
// Mechanism: Vite's `import.meta.glob` with `?raw` loads every ACW
// source file as a string at bundle time. We then scan each file
// for forbidden import specifiers. A match throws at module load,
// which fails the application bundle.

const ACW_SOURCES = import.meta.glob<string>(
  ["/src/acw/**/*.{ts,tsx}", "/src/pages/acw/**/*.tsx", "/src/components/acw/**/*.tsx"],
  { eager: true, query: "?raw", import: "default" },
);

// Forbidden import specifiers. Each entry is a substring; if any
// ACW source file contains it, the bundle fails. The list mirrors
// the decision-pipeline modules called out in the task plan.
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

// Self-exclude this file from the scan: it intentionally NAMES the
// forbidden specifiers in order to ban them. Same for documentation
// strings inside the ACW grammar-hooks placeholder (none today).
const SELF_FILENAMES: readonly string[] = [
  "acwIsolationInvariants.test-shape.ts",
];

// Positive allowlist (PH-ACW-3): ACW source files may import ONLY
// from this closed set of import-specifier prefixes. This is the
// stricter half of the isolation invariant — the denylist above
// guards against direct imports of named pipeline modules, and the
// allowlist below guards against indirect coupling through any
// intermediary module that has not been explicitly sanctioned. To
// add a new permitted dependency, append it here with a comment
// explaining why it is constitutionally inert.
const ALLOWED_IMPORT_PREFIXES: readonly string[] = [
  // ACW-internal relative imports.
  "./",
  "../",
  // React + routing (the project uses `wouter`, not react-router).
  "react",
  "react-dom",
  "wouter",
  // Icons — purely presentational SVG components.
  "lucide-react",
  // 3D primitive only — pure rendering, no decision logic.
  "three",
  "@react-three/fiber",
  // ACW-internal aliased imports (Vite `@` alias resolves to /src).
  "@/acw",
  "@/components/acw",
  "@/pages/acw",
  // Generic UI primitives (shadcn-style); render-only, no pipeline state.
  "@/components/ui",
  // Top-level header nav reused across pages — read-only navigation
  // shell with no decision-pipeline state. Allowed so the workspace
  // can present the same global nav as the rest of the app.
  "@/components/governance/GlobalNav",
  // Vocabulary guard — read-only assertion utility shared with the
  // rest of the application; introduces no decision-pipeline coupling.
  "@/governance/staticTextGuard",
  "../governance/staticTextGuard",
  "../../governance/staticTextGuard",
];

function isAllowedSpecifier(specifier: string): boolean {
  for (const prefix of ALLOWED_IMPORT_PREFIXES) {
    if (specifier === prefix) return true;
    if (prefix.endsWith("/") && specifier.startsWith(prefix)) return true;
    if (!prefix.endsWith("/") && specifier.startsWith(`${prefix}/`)) return true;
    if (prefix === specifier) return true;
  }
  return false;
}

export function assertNoDecisionPipelineImports(
  sources: Record<string, string>,
): void {
  for (const [path, contents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;
    // Match `from "..."` and `import "..."` style import specifiers
    // only. We deliberately scan substring within those quoted
    // forms so a comment that cites a specifier (e.g. for
    // documentation) does NOT trip the invariant.
    const importMatches = contents.matchAll(/(?:from|import)\s+["']([^"']+)["']/g);
    for (const m of importMatches) {
      const specifier = m[1];
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        if (specifier.indexOf(forbidden) !== -1) {
          throw new Error(
            `ACW invariant violation (denylist): file "${path}" imports from a Decision Canvas decision-pipeline module ("${specifier}"). ACW must remain isolated from the grammar engine, derivers, portfolio store, signals store, and freeze / export pipeline.`,
          );
        }
      }
      if (!isAllowedSpecifier(specifier)) {
        throw new Error(
          `ACW invariant violation (allowlist): file "${path}" imports from "${specifier}" which is not on the ACW allowlist. To add a new permitted dependency, edit ALLOWED_IMPORT_PREFIXES in acwIsolationInvariants.test-shape.ts and document why the new dependency is constitutionally inert.`,
        );
      }
    }
  }
}

assertNoDecisionPipelineImports(ACW_SOURCES);

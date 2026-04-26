// CTAD — build-time decoupling invariant.
//
// Per the CTAD brief: CTAD has NO upstream authority. It must never
// import from the Decision Canvas decision pipeline (grammar
// engine, ADS / ECP builders, derivers, signals store, exposure
// narratives, etc.) and must never import any WRITE helper of the
// portfolio store. CTAD is allowed to call only the read-side
// `listEntries` / `PortfolioEntry` symbols of the portfolio store
// to resolve its ADC binding selector.
//
// File suffix `.test-shape.ts` mirrors the ACW negative-shape
// pattern: this module's exports are predicates, not feature
// surface. Removing this file plus its side-effect import in
// App.tsx restores pre-CTAD behaviour with no other change required.
//
// Mechanism: Vite's `import.meta.glob` with `?raw` loads every
// CTAD source file as a string at bundle time. We then scan each
// file for forbidden import specifiers and forbidden named-imports
// from the portfolio store. A match throws at module load, which
// fails the application bundle.

const CTAD_SOURCES = import.meta.glob<string>(
  ["/src/ctad/**/*.{ts,tsx}", "/src/pages/ctad/**/*.tsx"],
  { eager: true, query: "?raw", import: "default" },
);

// Denylist: substrings that, if found inside a quoted import
// specifier, fail the bundle. Mirrors the ACW denylist minus the
// portfolio store (which is allowed in read-only form via a
// stricter named-import check below).
const FORBIDDEN_IMPORT_SPECIFIERS: readonly string[] = [
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
// specifiers in order to ban them.
const SELF_FILENAMES: readonly string[] = [
  "ctadIsolationInvariants.test-shape.ts",
];

// Positive allowlist: CTAD source files may import ONLY from this
// closed set of import-specifier prefixes. Mirrors the ACW
// allowlist with one extra entry for the portfolio store, which is
// then further constrained by the read-only named-import check.
const ALLOWED_IMPORT_PREFIXES: readonly string[] = [
  "./",
  "../",
  "react",
  "react-dom",
  "wouter",
  "lucide-react",
  // CTAD-internal aliased imports (Vite `@` alias resolves to /src).
  "@/ctad",
  "@/pages/ctad",
  // CNCF reference catalog — frozen, build-time data + pure
  // binding-hint engine. Has its own dedicated isolation
  // invariant (`cncfIsolationInvariants.test-shape.ts`) that
  // forbids any decision-pipeline imports and any fetch / dynamic
  // import. CTAD may import its catalog and engine for the
  // "Relevant cards" UI panel.
  "@/cncf",
  // CTAD-specific component primitives (e.g. <QuotedSource>, the
  // boundary that exempts attributable third-party text from the
  // CTAD vocabulary guard). Render-only, no pipeline state.
  "@/components/ctad",
  // Generic UI primitives (shadcn-style); render-only, no pipeline state.
  "@/components/ui",
  // Vocabulary guard — read-only assertion utility shared with the
  // rest of the application; introduces no decision-pipeline coupling.
  "@/governance/staticTextGuard",
  // Portfolio store: read-only access only. The allowlist permits
  // the import path; the named-import scan below ensures CTAD
  // imports only the read symbols (listEntries, getEntry, PortfolioEntry).
  "@/governance/portfolioStore",
  // Architecture-attachment store (Phase 2 — many-to-many ADC ↔
  // architecture links). Owns its own localStorage document and
  // mutates nothing else (no portfolio entries, signals, ADS, ECP,
  // or CTAD store). Linking carries no authority — it only records
  // a contractual reference — so this dependency does not introduce
  // any decision-pipeline coupling.
  "@/governance/architectureAttachmentStore",
];

// Read-only named-import allowlist for the portfolio store. CTAD
// may import these symbols and ONLY these symbols by name. Any
// other named import from the portfolio store fails the bundle.
const PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS: readonly string[] = [
  "listEntries",
  "getEntry",
  "PortfolioEntry",
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

export function assertNoForbiddenCtadImports(
  sources: Record<string, string>,
): void {
  for (const [path, contents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;

    // Match `from "..."` and `import "..."` style import specifiers.
    const importMatches = contents.matchAll(/(?:from|import)\s+["']([^"']+)["']/g);
    for (const m of importMatches) {
      const specifier = m[1];
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        if (specifier.indexOf(forbidden) !== -1) {
          throw new Error(
            `CTAD invariant violation (denylist): file "${path}" imports from a Decision Canvas decision-pipeline module ("${specifier}"). CTAD must remain non-authoritative and must not import the grammar engine, derivers, signals store, builders, or freeze / export pipeline.`,
          );
        }
      }
      if (!isAllowedSpecifier(specifier)) {
        throw new Error(
          `CTAD invariant violation (allowlist): file "${path}" imports from "${specifier}" which is not on the CTAD allowlist. To add a new permitted dependency, edit ALLOWED_IMPORT_PREFIXES in ctadIsolationInvariants.test-shape.ts and document why the new dependency is non-authoritative.`,
        );
      }
    }

    // Read-only enforcement against the portfolio store. CTAD may
    // only access the portfolio store through a NAMED-IMPORT block
    // whose bindings are restricted to the read-only allowlist
    // (`listEntries`, `PortfolioEntry`). Every other shape is
    // forbidden so that a future regression cannot reach
    // `addOrUpdateEntry` or any other write helper through an
    // unsupported import form.
    const PORTFOLIO_PATH_RE = /["'][^"']*governance\/portfolioStore["']/;

    // (a) Namespace imports: `import * as foo from ".../portfolioStore"`.
    if (
      new RegExp(
        `import\\s*\\*\\s*as\\s+\\w+\\s+from\\s*${PORTFOLIO_PATH_RE.source}`,
      ).test(contents)
    ) {
      throw new Error(
        `CTAD invariant violation (portfolio read-only): file "${path}" uses a namespace import (\`import * as ... from ".../portfolioStore"\`). Namespace imports are forbidden because they expose every export including write helpers; use \`import { listEntries, type PortfolioEntry } from "@/governance/portfolioStore"\` instead.`,
      );
    }

    // (b) Default imports: `import foo from ".../portfolioStore"`.
    // The portfolio store has no default export, but a future
    // regression could add one, so we ban the form outright.
    if (
      new RegExp(
        `import\\s+\\w+(?:\\s*,\\s*\\{[^}]*\\})?\\s+from\\s*${PORTFOLIO_PATH_RE.source}`,
      ).test(contents)
    ) {
      throw new Error(
        `CTAD invariant violation (portfolio read-only): file "${path}" uses a default import from the portfolio store. Default imports are forbidden; use a named import restricted to ${PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS.join(", ")}.`,
      );
    }

    // (c) Side-effect imports: `import ".../portfolioStore"`. The
    // portfolio store has top-level side effects (localStorage
    // reads), so a side-effect-only import is meaningless from
    // CTAD's perspective and is most likely an attempt to defeat
    // the named-import scan.
    if (
      new RegExp(`import\\s+${PORTFOLIO_PATH_RE.source}`).test(contents)
    ) {
      throw new Error(
        `CTAD invariant violation (portfolio read-only): file "${path}" uses a side-effect-only import of the portfolio store. Side-effect imports are forbidden; use a named import restricted to ${PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS.join(", ")}.`,
      );
    }

    // (d) Dynamic imports: `import(".../portfolioStore")`. These
    // would bypass static analysis entirely and could reach any
    // export at runtime, so they are banned outright.
    if (
      new RegExp(`import\\s*\\(\\s*${PORTFOLIO_PATH_RE.source}`).test(
        contents,
      )
    ) {
      throw new Error(
        `CTAD invariant violation (portfolio read-only): file "${path}" uses a dynamic import of the portfolio store. Dynamic imports are forbidden because they bypass static analysis; use a named import restricted to ${PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS.join(", ")}.`,
      );
    }

    // (e) Permitted form: `import { ... } from ".../portfolioStore"`.
    // Verify every named binding is on the read-only allowlist.
    const portfolioImportMatches = contents.matchAll(
      new RegExp(
        `import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*${PORTFOLIO_PATH_RE.source}`,
        "g",
      ),
    );
    for (const m of portfolioImportMatches) {
      const namesBlock = m[1];
      const names = namesBlock
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          // Strip `type` modifier and `as alias` clauses; keep the
          // original identifier on the left of `as`.
          const noType = s.replace(/^type\s+/, "");
          const beforeAs = noType.split(/\s+as\s+/)[0];
          return beforeAs.trim();
        });
      for (const name of names) {
        if (!PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS.includes(name)) {
          throw new Error(
            `CTAD invariant violation (portfolio read-only): file "${path}" imports "${name}" from the portfolio store. CTAD may only use read symbols (${PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS.join(", ")}); write helpers like addOrUpdateEntry are forbidden.`,
          );
        }
      }
    }
  }
}

// Self-test: run the hardened scan over a fabricated set of bad
// CTAD source snippets and assert that each is rejected with the
// expected error class. This guards against future regressions to
// the regex patterns themselves (e.g. an inadvertent edit that
// would loosen the namespace/default/side-effect/dynamic bans).
function selfTestPortfolioReadOnlyScan(): void {
  const bad: ReadonlyArray<{ readonly label: string; readonly src: string }> = [
    {
      label: "namespace import",
      src: `import * as portfolio from "@/governance/portfolioStore";`,
    },
    {
      label: "default import",
      src: `import portfolio from "@/governance/portfolioStore";`,
    },
    {
      label: "default + named import",
      src: `import portfolio, { listEntries } from "@/governance/portfolioStore";`,
    },
    {
      label: "side-effect import",
      src: `import "@/governance/portfolioStore";`,
    },
    {
      label: "dynamic import",
      src: `const m = await import("@/governance/portfolioStore");`,
    },
    {
      label: "named import with write helper",
      src: `import { addOrUpdateEntry } from "@/governance/portfolioStore";`,
    },
  ];
  for (const { label, src } of bad) {
    let threw = false;
    try {
      assertNoForbiddenCtadImports({ "/src/ctad/__synthetic__.ts": src });
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        `CTAD isolation invariant self-test: scan failed to reject "${label}". The portfolio read-only enforcement is too lax.`,
      );
    }
  }
  // Positive control: an approved import shape must NOT throw.
  const ok = `import { listEntries, getEntry, type PortfolioEntry } from "@/governance/portfolioStore";`;
  try {
    assertNoForbiddenCtadImports({ "/src/ctad/__synthetic__.ts": ok });
  } catch (e) {
    throw new Error(
      `CTAD isolation invariant self-test: scan rejected the approved read-only import shape. Cause: ${(e as Error).message}`,
    );
  }
}
selfTestPortfolioReadOnlyScan();

assertNoForbiddenCtadImports(CTAD_SOURCES);

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
  // Storage-key scoping helper (Phase 2 onboarding). Pure
  // string-composition utility (`<orgId>:<workItemId>:<base>` or
  // `<orgId>:<base>`) with no decision-pipeline state of its own.
  // CTAD stores import `getScopedKey` so their localStorage
  // documents are partitioned by Organisation + Work Item.
  "@/governance/storageKeyUtils",
  // Phase 3 (server-backed tenant storage) — synchronous L1 cache
  // helpers (`readScoped` / `writeScoped` / `removeScoped`) that
  // wrap localStorage and an opaque write-through to the api-
  // server. Carries no decision-pipeline state. Required so the
  // CTAD stores can persist through the same path as every other
  // tenant-scoped store after the Phase-3 cutover.
  "@/governance/scopedStorageClient",
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
  // CTAD Phase 3 (Task #152) — Multi-Diagram Logical Design
  // dependencies. The CTAD logical design surface authors into the
  // ACW workspace (`acw.workspace.v1`) using validator-gated
  // mutations, reads grammar-shape constants for the promote-to-
  // EAStudio panel, and resolves dropdown sources via the
  // requirements and module catalog stores.
  //
  //   - `@/acw/acwStore`: full read + write surface. CTAD uses
  //     `getWorkspace` / `subscribe` for reading, and
  //     `createNode` / `updateNodeProperties` / `renameNode` /
  //     `updateNodePosition` / `reparentNode` for authoring.
  //     Phase 3's optional fields (`diagramType`, `diagramSubtype`,
  //     `boundRequirementIds`, `moduleId`, `logicalPosition`,
  //     `logicalParentId`, `logicalStyle`) are part of the same
  //     validator-gated mutator surface. The store is itself
  //     non-authoritative (no decision-pipeline coupling); CTAD
  //     authoring into it does not violate non-authority.
  //   - `@/acw/acwGrammar`: read-only grammar constants
  //     (`AcwElementType`, `permittedParentsFor`, etc.) used by
  //     the Promote-to-EAStudio panel to grey out infeasible
  //     domain quadrants. Pure constants, no state.
  //   - `@/acw/acwValidator`: read-only feasibility predicates
  //     used by the same panel to pre-screen a promote operation
  //     before issuing the validator-gated mutation. No state.
  "@/acw/acwStore",
  "@/acw/acwGrammar",
  "@/acw/acwValidator",
  // Read-only governance stores — CTAD reads these to populate
  // the requirement-binding multiselect and the module-binding
  // single select inside the logical-node Properties panel. The
  // named-import discipline below restricts CTAD to the read
  // symbols only; write helpers (`saveRequirement`,
  // `createModule`, etc.) are forbidden.
  "@/governance/requirementsStore",
  "@/governance/moduleCatalogStore",
];

// Read-only named-import allowlist for the portfolio store. CTAD
// may import these symbols and ONLY these symbols by name. Any
// other named import from the portfolio store fails the bundle.
const PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS: readonly string[] = [
  "listEntries",
  "getEntry",
  "PortfolioEntry",
];

// CTAD Phase 3 (Task #152) — read-only named-import allowlists
// for the requirements and module catalog stores. Symbols outside
// these lists (e.g. `saveRequirement`, `deleteRequirement`,
// `createModule`, `removeModule`) are write helpers and CTAD must
// not be able to reach them via any import shape.
const REQUIREMENTS_STORE_READ_ONLY_NAMED_IMPORTS: readonly string[] = [
  "listRequirements",
  "getRequirement",
  "Requirement",
  "RequirementType",
  "RequirementStatus",
  "RequirementUrgency",
];
const MODULE_CATALOG_STORE_READ_ONLY_NAMED_IMPORTS: readonly string[] = [
  "listModules",
  "getModule",
  "Module",
  "getModulesForCapability",
];

// Generic enforcement helper. Forbids namespace, default, side-
// effect, and dynamic imports against `pathRe` and verifies named
// imports are restricted to `allowlist`. Mirrors the inline
// portfolio-store enforcement that pre-dated Phase 3, factored out
// so the requirements + module catalog stores can adopt the exact
// same discipline by name.
function assertReadOnlyStoreNamedImports(
  storeLabel: string,
  pathRe: RegExp,
  allowlist: readonly string[],
  contents: string,
  filePath: string,
): void {
  // (a) Namespace imports.
  if (
    new RegExp(
      `import\\s*\\*\\s*as\\s+\\w+\\s+from\\s*${pathRe.source}`,
    ).test(contents)
  ) {
    throw new Error(
      `CTAD invariant violation (${storeLabel} read-only): file "${filePath}" uses a namespace import. Namespace imports are forbidden because they expose every export including write helpers; use a named import restricted to ${allowlist.join(", ")}.`,
    );
  }
  // (b) Default imports (also catches `default + named` form).
  if (
    new RegExp(
      `import\\s+\\w+(?:\\s*,\\s*\\{[^}]*\\})?\\s+from\\s*${pathRe.source}`,
    ).test(contents)
  ) {
    throw new Error(
      `CTAD invariant violation (${storeLabel} read-only): file "${filePath}" uses a default import. Default imports are forbidden; use a named import restricted to ${allowlist.join(", ")}.`,
    );
  }
  // (c) Side-effect imports.
  if (new RegExp(`import\\s+${pathRe.source}`).test(contents)) {
    throw new Error(
      `CTAD invariant violation (${storeLabel} read-only): file "${filePath}" uses a side-effect-only import. Side-effect imports are forbidden; use a named import restricted to ${allowlist.join(", ")}.`,
    );
  }
  // (d) Dynamic imports.
  if (new RegExp(`import\\s*\\(\\s*${pathRe.source}`).test(contents)) {
    throw new Error(
      `CTAD invariant violation (${storeLabel} read-only): file "${filePath}" uses a dynamic import. Dynamic imports are forbidden because they bypass static analysis; use a named import restricted to ${allowlist.join(", ")}.`,
    );
  }
  // (e) Permitted form: verify each named binding is allowlisted.
  const matches = contents.matchAll(
    new RegExp(
      `import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*${pathRe.source}`,
      "g",
    ),
  );
  for (const m of matches) {
    const namesBlock = m[1];
    const names = namesBlock
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const noType = s.replace(/^type\s+/, "");
        const beforeAs = noType.split(/\s+as\s+/)[0];
        return beforeAs.trim();
      });
    for (const name of names) {
      if (!allowlist.includes(name)) {
        throw new Error(
          `CTAD invariant violation (${storeLabel} read-only): file "${filePath}" imports "${name}". CTAD may only use read symbols (${allowlist.join(", ")}); write helpers are forbidden.`,
        );
      }
    }
  }
}

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

    // Read-only named-import enforcement for the three governance
    // stores CTAD is permitted to read. The path regex anchors on
    // the trailing store filename inside `governance/` so the scan
    // does not collide with same-named symbols imported from
    // unrelated modules.
    assertReadOnlyStoreNamedImports(
      "portfolio",
      /["'][^"']*governance\/portfolioStore["']/,
      PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS,
      contents,
      path,
    );
    assertReadOnlyStoreNamedImports(
      "requirements",
      /["'][^"']*governance\/requirementsStore["']/,
      REQUIREMENTS_STORE_READ_ONLY_NAMED_IMPORTS,
      contents,
      path,
    );
    assertReadOnlyStoreNamedImports(
      "moduleCatalog",
      /["'][^"']*governance\/moduleCatalogStore["']/,
      MODULE_CATALOG_STORE_READ_ONLY_NAMED_IMPORTS,
      contents,
      path,
    );
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

// CTAD Phase 3 (Task #152) — same self-test discipline for the
// requirements + module catalog stores. Mirrors the portfolio
// pattern so a future regex-loosening regression on either store
// fails the bundle here rather than at the next read.
function selfTestPhase3StoresReadOnlyScan(): void {
  const cases: ReadonlyArray<{
    readonly storeLabel: string;
    readonly storePath: string;
    readonly writeHelper: string;
    readonly approved: string;
  }> = [
    {
      storeLabel: "requirements",
      storePath: "@/governance/requirementsStore",
      writeHelper: "saveRequirement",
      approved:
        `import { listRequirements, getRequirement, type Requirement } from "@/governance/requirementsStore";`,
    },
    {
      storeLabel: "moduleCatalog",
      storePath: "@/governance/moduleCatalogStore",
      writeHelper: "createModule",
      approved:
        `import { listModules, getModule, type Module } from "@/governance/moduleCatalogStore";`,
    },
  ];
  for (const { storeLabel, storePath, writeHelper, approved } of cases) {
    const bad: ReadonlyArray<{ readonly label: string; readonly src: string }> = [
      { label: "namespace import", src: `import * as s from "${storePath}";` },
      { label: "default import", src: `import s from "${storePath}";` },
      {
        label: "default + named import",
        src: `import s, { listRequirements } from "${storePath}";`,
      },
      { label: "side-effect import", src: `import "${storePath}";` },
      {
        label: "dynamic import",
        src: `const m = await import("${storePath}");`,
      },
      {
        label: "named import with write helper",
        src: `import { ${writeHelper} } from "${storePath}";`,
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
          `CTAD isolation invariant self-test: ${storeLabel} scan failed to reject "${label}". The read-only enforcement is too lax.`,
        );
      }
    }
    // Positive control.
    try {
      assertNoForbiddenCtadImports({ "/src/ctad/__synthetic__.ts": approved });
    } catch (e) {
      throw new Error(
        `CTAD isolation invariant self-test: ${storeLabel} scan rejected the approved read-only import shape. Cause: ${(e as Error).message}`,
      );
    }
  }
}
selfTestPhase3StoresReadOnlyScan();

assertNoForbiddenCtadImports(CTAD_SOURCES);

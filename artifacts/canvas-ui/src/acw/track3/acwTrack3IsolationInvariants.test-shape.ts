// ACW Track 3 — build-time isolation invariant.
//
// Track 3 is a strictly read-only derived view of CTAD_STATE +
// ADC bounds. It must never import any module that would let it
// drive a decision (grammar engine, ADS / ECP builders, signals
// store, exposure / responsibility derivers, scenario reading,
// reentry, freeze / export pipeline, identity / hash) and must
// never import a write-form symbol from CTAD's store, the ACW
// authored workspace store, the ACW validator / grammar hooks /
// view-state, or any write-form helper of the portfolio store.
//
// Mechanism mirrors `ctadIsolationInvariants.test-shape.ts`:
// Vite's `import.meta.glob` with `?raw` loads every Track 3
// source file as a string at bundle time; we scan each file for
// forbidden import specifiers and forbidden named-imports from
// the read-only stores. A match throws at module load, failing
// the bundle.
//
// File suffix `.test-shape.ts` mirrors the established negative-
// shape pattern: removing this file plus its side-effect import
// in `App.tsx` restores pre-Track-3 behaviour with no other
// change.

const TRACK3_SOURCES = import.meta.glob<string>(
  [
    "/src/acw/track3/**/*.{ts,tsx}",
    "/src/pages/acw/track3/**/*.{ts,tsx}",
    "/src/components/acw/track3/**/*.{ts,tsx}",
  ],
  { eager: true, query: "?raw", import: "default" },
);

// Denylist: substrings that, if found inside a quoted import
// specifier, fail the bundle. Covers every decision-pipeline
// module Track 3 must remain decoupled from.
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
  "governance/togafContainment",
  "governance/export",
  "governance/hash",
  "governance/identity",
  "architecture-grammar",
  "/lib/architecture-grammar",
  "@workspace/architecture-grammar",
  // Authored ACW write surface: Track 3 never mutates the
  // authored workspace.
  "acw/acwValidator",
  "acw/acwGrammarHooks",
  "acw/acwStore",
  "acw/acwViewState",
];

// This file deliberately names the forbidden specifiers in order
// to ban them; self-exclude.
const SELF_FILENAMES: readonly string[] = [
  "acwTrack3IsolationInvariants.test-shape.ts",
  "acwTrack3StructureInvariants.test-shape.ts",
  "acwTrack3ForbiddenSemantics.test-shape.ts",
  "acwTrack3DerivationInvariants.test-shape.ts",
  "acwTrack3FocusIsolationInvariants.test-shape.ts",
  "acwTrack3ViewPrefsInvariants.test-shape.ts",
];

// Positive allowlist: Track 3 source files may import ONLY from
// this closed set of import-specifier prefixes. Adding a new
// permitted dependency means adding a line here and explaining
// why it is non-authoritative.
const ALLOWED_IMPORT_PREFIXES: readonly string[] = [
  "./",
  "../",
  "react",
  "react-dom",
  "wouter",
  "lucide-react",
  // R3F / Three for the 3D renderer.
  "@react-three/fiber",
  "@react-three/drei",
  "three",
  // Track 3 internal aliased imports.
  "@/acw/track3",
  "@/pages/acw/track3",
  "@/components/acw/track3",
  // Generic UI primitives (shadcn-style); render-only.
  "@/components/ui",
  // Top-level header nav reused across pages — read-only.
  "@/components/governance/GlobalNav",
  // Vocabulary guard — read-only assertion utility.
  "@/governance/staticTextGuard",
  // Read-only stores. The named-import scans below further
  // constrain Track 3 to the read-only surface of each.
  "@/governance/portfolioStore",
  "@/ctad/ctadStore",
  // ACW visibility helper and AcwNode/AcwEdge type-only imports.
  "@/acw/acwLensStructure",
  // The ACW store path is denied above; the structurally-
  // compatible types are re-exported from acwLensStructure for
  // Track 3's use.
];

// Read-only named-import allowlists per upstream store.
const PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS: readonly string[] = [
  "listEntries",
  "PortfolioEntry",
];
const CTAD_STORE_READ_ONLY_NAMED_IMPORTS: readonly string[] = [
  // Strictly the named-import allowlist mandated by the Track 3
  // task contract. Anything else (subscribe / getStoreVersion /
  // CtadBinding / write helpers) is rejected.
  "getCtadState",
  "exportCtadState",
  "CtadStateExport",
];
const ACW_LENS_STRUCTURE_NAMED_IMPORTS: readonly string[] = [
  "enumerateLensVisibility",
  "LensVisibility",
  "LensDrawable",
  "AcwNode",
  "AcwEdge",
];

function isAllowedSpecifier(specifier: string): boolean {
  for (const prefix of ALLOWED_IMPORT_PREFIXES) {
    if (specifier === prefix) return true;
    if (prefix.endsWith("/") && specifier.startsWith(prefix)) return true;
    if (!prefix.endsWith("/") && specifier.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

interface ReadOnlyStoreSpec {
  readonly label: string;
  readonly pathRe: RegExp;
  readonly allowedNames: readonly string[];
}

const READ_ONLY_STORES: readonly ReadOnlyStoreSpec[] = [
  {
    label: "portfolio store",
    pathRe: /["'][^"']*governance\/portfolioStore["']/,
    allowedNames: PORTFOLIO_STORE_READ_ONLY_NAMED_IMPORTS,
  },
  {
    label: "CTAD store",
    pathRe: /["'][^"']*ctad\/ctadStore["']/,
    allowedNames: CTAD_STORE_READ_ONLY_NAMED_IMPORTS,
  },
  {
    label: "ACW lens-structure helper",
    pathRe: /["'][^"']*acw\/acwLensStructure["']/,
    allowedNames: ACW_LENS_STRUCTURE_NAMED_IMPORTS,
  },
];

function checkReadOnlyStore(
  path: string,
  contents: string,
  spec: ReadOnlyStoreSpec,
): void {
  // (a) namespace imports
  if (
    new RegExp(`import\\s*\\*\\s*as\\s+\\w+\\s+from\\s*${spec.pathRe.source}`).test(
      contents,
    )
  ) {
    throw new Error(
      `ACW Track 3 isolation invariant: file "${path}" uses a namespace import of the ${spec.label}. Use a named import restricted to ${spec.allowedNames.join(", ")}.`,
    );
  }
  // (b) default imports
  if (
    new RegExp(
      `import\\s+\\w+(?:\\s*,\\s*\\{[^}]*\\})?\\s+from\\s*${spec.pathRe.source}`,
    ).test(contents)
  ) {
    throw new Error(
      `ACW Track 3 isolation invariant: file "${path}" uses a default import of the ${spec.label}. Default imports are forbidden; use a named import restricted to ${spec.allowedNames.join(", ")}.`,
    );
  }
  // (c) side-effect imports
  if (new RegExp(`import\\s+${spec.pathRe.source}`).test(contents)) {
    throw new Error(
      `ACW Track 3 isolation invariant: file "${path}" uses a side-effect import of the ${spec.label}. Side-effect imports are forbidden; use a named import restricted to ${spec.allowedNames.join(", ")}.`,
    );
  }
  // (d) dynamic imports
  if (new RegExp(`import\\s*\\(\\s*${spec.pathRe.source}`).test(contents)) {
    throw new Error(
      `ACW Track 3 isolation invariant: file "${path}" uses a dynamic import of the ${spec.label}. Dynamic imports are forbidden; use a named import restricted to ${spec.allowedNames.join(", ")}.`,
    );
  }
  // (e) named imports — check every binding is on the allowlist.
  const matches = contents.matchAll(
    new RegExp(
      `import\\s*(?:type\\s*)?\\{\\s*([^}]+)\\s*\\}\\s*from\\s*${spec.pathRe.source}`,
      "g",
    ),
  );
  for (const m of matches) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const noType = s.replace(/^type\s+/, "");
        const beforeAs = noType.split(/\s+as\s+/)[0];
        return beforeAs.trim();
      });
    for (const name of names) {
      if (!spec.allowedNames.includes(name)) {
        throw new Error(
          `ACW Track 3 isolation invariant: file "${path}" imports "${name}" from the ${spec.label}. Track 3 may only use the read-only surface (${spec.allowedNames.join(", ")}); write helpers like setCtadParam / addOrUpdateEntry are forbidden.`,
        );
      }
    }
  }
}

export function assertNoForbiddenTrack3Imports(
  sources: Record<string, string>,
): void {
  for (const [path, contents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;

    // Match `from "..."` and side-effect `import "..."` specifiers.
    const importMatches = contents.matchAll(/(?:from|import)\s+["']([^"']+)["']/g);
    // Match dynamic `import("...")` specifiers. Must be checked
    // against both denylist and allowlist so a dynamic import
    // cannot bypass the static-import scan above.
    const dynamicImportMatches = contents.matchAll(
      /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    );
    const allSpecifiers: Array<{ specifier: string; kind: "static" | "dynamic" }> = [];
    for (const m of importMatches) {
      allSpecifiers.push({ specifier: m[1], kind: "static" });
    }
    for (const m of dynamicImportMatches) {
      allSpecifiers.push({ specifier: m[1], kind: "dynamic" });
    }
    for (const { specifier, kind } of allSpecifiers) {
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        if (specifier.indexOf(forbidden) !== -1) {
          throw new Error(
            `ACW Track 3 isolation invariant (denylist, ${kind} import): file "${path}" imports from "${specifier}" which is on the Track 3 denylist (decision-pipeline or write-form module). Track 3 must remain a strictly read-only derivation.`,
          );
        }
      }
      if (!isAllowedSpecifier(specifier)) {
        throw new Error(
          `ACW Track 3 isolation invariant (allowlist, ${kind} import): file "${path}" imports from "${specifier}" which is not on the Track 3 allowlist. Edit ALLOWED_IMPORT_PREFIXES in acwTrack3IsolationInvariants.test-shape.ts and document why the new dependency is non-authoritative.`,
        );
      }
    }

    for (const spec of READ_ONLY_STORES) {
      checkReadOnlyStore(path, contents, spec);
    }
  }
}

// In-module self-test fixture: every forbidden import shape is
// exercised so a future regex-loosening fails synchronously.
function selfTest(): void {
  const bad: ReadonlyArray<{ readonly label: string; readonly src: string }> = [
    {
      label: "ctad namespace import",
      src: `import * as ctad from "@/ctad/ctadStore";`,
    },
    {
      label: "ctad default import",
      src: `import ctad from "@/ctad/ctadStore";`,
    },
    {
      label: "ctad side-effect import",
      src: `import "@/ctad/ctadStore";`,
    },
    {
      label: "ctad dynamic import",
      src: `const m = await import("@/ctad/ctadStore");`,
    },
    {
      label: "ctad write helper named import",
      src: `import { setCtadParam } from "@/ctad/ctadStore";`,
    },
    {
      label: "ctad clearCtadParam named import",
      src: `import { clearCtadParam } from "@/ctad/ctadStore";`,
    },
    {
      label: "ctad subscribe named import (off allowlist)",
      src: `import { subscribe } from "@/ctad/ctadStore";`,
    },
    {
      label: "ctad getStoreVersion named import (off allowlist)",
      src: `import { getStoreVersion } from "@/ctad/ctadStore";`,
    },
    {
      label: "ctad CtadBinding named type import (off allowlist)",
      src: `import { type CtadBinding } from "@/ctad/ctadStore";`,
    },
    {
      label: "portfolio write helper",
      src: `import { addOrUpdateEntry } from "@/governance/portfolioStore";`,
    },
    {
      label: "portfolio namespace",
      src: `import * as p from "@/governance/portfolioStore";`,
    },
    {
      label: "acwStore import",
      src: `import { createNode } from "@/acw/acwStore";`,
    },
    {
      label: "acwValidator import",
      src: `import { validateAcw } from "@/acw/acwValidator";`,
    },
    {
      label: "acwViewState write import",
      src: `import { setViewMode } from "@/acw/acwViewState";`,
    },
    {
      label: "decision-pipeline import",
      src: `import { freezeAds } from "@/governance/adsBuilder";`,
    },
    {
      label: "decision-pipeline dynamic import (denylist)",
      src: `const m = await import("@/governance/adsBuilder");`,
    },
    {
      label: "off-allowlist dynamic import",
      src: `const z = await import("zod");`,
    },
    {
      label: "architecture-grammar import",
      src: `import { evaluateOpinion } from "@workspace/architecture-grammar";`,
    },
    {
      label: "off-allowlist import",
      src: `import zod from "zod";`,
    },
    {
      label: "lens enumerator off-list import",
      src: `import { somethingElse } from "@/acw/acwLensStructure";`,
    },
  ];
  for (const { label, src } of bad) {
    let threw = false;
    try {
      assertNoForbiddenTrack3Imports({ "/src/acw/track3/__synthetic__.ts": src });
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        `ACW Track 3 isolation invariant self-test: scan failed to reject "${label}". Read-only enforcement is too lax.`,
      );
    }
  }
  // Positive controls — approved import shapes must NOT throw.
  const okSources = [
    `import { listEntries, type PortfolioEntry } from "@/governance/portfolioStore";`,
    `import { getCtadState, exportCtadState, type CtadStateExport } from "@/ctad/ctadStore";`,
    `import { enumerateLensVisibility, type AcwNode, type AcwEdge } from "@/acw/acwLensStructure";`,
  ];
  for (const ok of okSources) {
    try {
      assertNoForbiddenTrack3Imports({ "/src/acw/track3/__synthetic__.ts": ok });
    } catch (e) {
      throw new Error(
        `ACW Track 3 isolation invariant self-test: scan rejected approved import shape: ${(e as Error).message}`,
      );
    }
  }
}
selfTest();

assertNoForbiddenTrack3Imports(TRACK3_SOURCES);

// EAStudio Path B Phase 2 (LoS framework) — L3 carve-out isolation
// invariant.
//
// Files under `/src/acw/l3/` are the only ACW source tree that may
// import from the CTAD store. The parent
// `acwIsolationInvariants.test-shape.ts` excludes this directory so
// the two invariants do not contradict; this module enforces the
// stricter contract that applies inside the carve-out.
//
// Allowed reads from `@/ctad/ctadStore` are limited to:
//   - `exportArchitectureState`            — frozen per-arch snapshot
//   - `listArchitectures`                  — the architecture roster
//   - type CtadArchitectureDoc             — roster entry shape
//   - type CtadArchitectureStateExport     — snapshot shape
// Any other named import (write helper, mutator, internal state),
// any namespace import, default import, side-effect import, or
// dynamic import fails the bundle at load time.
//
// File suffix `.test-shape.ts` mirrors the established negative-
// shape pattern: removing this file plus its side-effect import in
// `App.tsx` restores the framework's pre-carve-out behaviour.
//
// Mechanism: Vite's `import.meta.glob` with `?raw` loads every L3
// source file as a string at bundle time; we scan for forbidden
// import shapes. A match throws synchronously.

const L3_SOURCES = import.meta.glob<string>(
  ["/src/acw/l3/**/*.{ts,tsx}"],
  { eager: true, query: "?raw", import: "default" },
);

// Denylist: substrings that, if found inside a quoted import
// specifier, fail the bundle. Mirrors the parent ACW denylist for
// decision-pipeline modules — the L3 carve-out widens CTAD
// permissions, not pipeline permissions.
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
  "governance/togafContainment",
  "governance/export",
  "governance/hash",
  "governance/identity",
  "architecture-grammar",
  "/lib/architecture-grammar",
  "@workspace/architecture-grammar",
];

const SELF_FILENAMES: readonly string[] = [
  "acwL3IsolationInvariants.test-shape.ts",
  "acwL3GeneratorInvariants.test-shape.ts",
];

const ALLOWED_IMPORT_PREFIXES: readonly string[] = [
  "./",
  "../",
  "react",
  "lucide-react",
  // ACW-internal aliased imports.
  "@/acw",
  // Generic UI primitives (shadcn-style); render-only.
  "@/components/ui",
  // Vocabulary guard — read-only assertion utility.
  "@/governance/staticTextGuard",
  // The L3 carve-out: read-only CTAD store. The named-import scan
  // below further constrains the carve-out to the four allowed
  // names + types.
  "@/ctad/ctadStore",
];

// Read-only named-import allowlist for the CTAD store. Spec
// strictly limits the carve-out to `exportArchitectureState`; the
// generator additionally needs `listArchitectures` so the Studio
// canvas can drive the projector across every architecture without
// the host needing an architectureId mapping the singleton store
// does not carry. The two matching read-only types are also
// admitted so the generator can declare its parameter shapes
// without re-asserting the structure inline.
const CTAD_STORE_ALLOWED_NAMED_IMPORTS: readonly string[] = [
  "exportArchitectureState",
  "listArchitectures",
  "CtadArchitectureDoc",
  "CtadArchitectureStateExport",
];

function isAllowedSpecifier(specifier: string): boolean {
  for (const prefix of ALLOWED_IMPORT_PREFIXES) {
    if (specifier === prefix) return true;
    if (prefix.endsWith("/") && specifier.startsWith(prefix)) return true;
    if (!prefix.endsWith("/") && specifier.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

const CTAD_STORE_PATH_RE = /["'][^"']*ctad\/ctadStore["']/;

function checkCtadStore(path: string, contents: string): void {
  const re = CTAD_STORE_PATH_RE.source;
  // (a) namespace imports
  if (new RegExp(`import\\s*\\*\\s*as\\s+\\w+\\s+from\\s*${re}`).test(contents)) {
    throw new Error(
      `ACW L3 isolation invariant: file "${path}" uses a namespace import of the CTAD store. Use a named import restricted to ${CTAD_STORE_ALLOWED_NAMED_IMPORTS.join(", ")}.`,
    );
  }
  // (b) default imports
  if (
    new RegExp(`import\\s+\\w+(?:\\s*,\\s*\\{[^}]*\\})?\\s+from\\s*${re}`).test(
      contents,
    )
  ) {
    throw new Error(
      `ACW L3 isolation invariant: file "${path}" uses a default import of the CTAD store. Default imports are forbidden; use a named import restricted to ${CTAD_STORE_ALLOWED_NAMED_IMPORTS.join(", ")}.`,
    );
  }
  // (c) side-effect imports
  if (new RegExp(`import\\s+${re}`).test(contents)) {
    throw new Error(
      `ACW L3 isolation invariant: file "${path}" uses a side-effect import of the CTAD store. Side-effect imports are forbidden; use a named import restricted to ${CTAD_STORE_ALLOWED_NAMED_IMPORTS.join(", ")}.`,
    );
  }
  // (d) dynamic imports
  if (new RegExp(`import\\s*\\(\\s*${re}`).test(contents)) {
    throw new Error(
      `ACW L3 isolation invariant: file "${path}" uses a dynamic import of the CTAD store. Dynamic imports are forbidden; use a named import restricted to ${CTAD_STORE_ALLOWED_NAMED_IMPORTS.join(", ")}.`,
    );
  }
  // (e) named imports — every binding must be on the allowlist.
  const matches = contents.matchAll(
    new RegExp(
      `import\\s*(?:type\\s*)?\\{\\s*([^}]+)\\s*\\}\\s*from\\s*${re}`,
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
      if (!CTAD_STORE_ALLOWED_NAMED_IMPORTS.includes(name)) {
        throw new Error(
          `ACW L3 isolation invariant: file "${path}" imports "${name}" from the CTAD store. The L3 carve-out only permits ${CTAD_STORE_ALLOWED_NAMED_IMPORTS.join(", ")}.`,
        );
      }
    }
  }
}

export function assertNoForbiddenL3Imports(
  sources: Record<string, string>,
): void {
  for (const [path, contents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;

    const importMatches = contents.matchAll(/(?:from|import)\s+["']([^"']+)["']/g);
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
            `ACW L3 isolation invariant (denylist, ${kind} import): file "${path}" imports from "${specifier}" which is on the L3 denylist (decision-pipeline module).`,
          );
        }
      }
      if (!isAllowedSpecifier(specifier)) {
        throw new Error(
          `ACW L3 isolation invariant (allowlist, ${kind} import): file "${path}" imports from "${specifier}" which is not on the L3 allowlist. Edit ALLOWED_IMPORT_PREFIXES in acwL3IsolationInvariants.test-shape.ts and document why the new dependency is non-authoritative.`,
        );
      }
    }
    checkCtadStore(path, contents);
  }
}

// In-module self-test fixture: every forbidden import shape is
// exercised so a future regex-loosening fails synchronously.
function selfTest(): void {
  const bad: ReadonlyArray<{ readonly label: string; readonly src: string }> = [
    { label: "ctad namespace import", src: `import * as c from "@/ctad/ctadStore";` },
    { label: "ctad default import", src: `import c from "@/ctad/ctadStore";` },
    { label: "ctad side-effect import", src: `import "@/ctad/ctadStore";` },
    {
      label: "ctad dynamic import",
      src: `const m = await import("@/ctad/ctadStore");`,
    },
    {
      label: "ctad write helper named import",
      src: `import { setCtadParam } from "@/ctad/ctadStore";`,
    },
    {
      label: "ctad off-allowlist named import",
      src: `import { getCtadState } from "@/ctad/ctadStore";`,
    },
    {
      label: "decision-pipeline import",
      src: `import { freezeAds } from "@/governance/adsBuilder";`,
    },
    {
      label: "portfolio store import",
      src: `import { listEntries } from "@/governance/portfolioStore";`,
    },
    {
      label: "off-allowlist import",
      src: `import zod from "zod";`,
    },
  ];
  for (const { label, src } of bad) {
    let threw = false;
    try {
      assertNoForbiddenL3Imports({ "/src/acw/l3/__synthetic__.ts": src });
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        `ACW L3 isolation invariant self-test: scan failed to reject "${label}". Read-only enforcement is too lax.`,
      );
    }
  }
  // Positive controls — approved import shapes must NOT throw.
  const okSources = [
    `import { exportArchitectureState, listArchitectures, type CtadArchitectureDoc, type CtadArchitectureStateExport } from "@/ctad/ctadStore";`,
    `import { createNode } from "../acwStore";`,
  ];
  for (const ok of okSources) {
    try {
      assertNoForbiddenL3Imports({ "/src/acw/l3/__synthetic__.ts": ok });
    } catch (e) {
      throw new Error(
        `ACW L3 isolation invariant self-test: scan rejected approved import shape: ${(e as Error).message}`,
      );
    }
  }
}
selfTest();

assertNoForbiddenL3Imports(L3_SOURCES);

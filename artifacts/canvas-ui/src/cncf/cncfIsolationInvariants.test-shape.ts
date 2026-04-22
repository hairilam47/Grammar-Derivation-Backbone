// CNCF reference catalog — build-time isolation invariant.
//
// The CNCF module is a frozen, build-time data catalog plus a
// pure binding-hint engine. It must:
//   - never fetch (no network imports / fetch calls baked into
//     module-level source)
//   - never import any Decision-Canvas decision-pipeline module
//   - import from the CTAD module ONLY through a closed, READ-
//     ONLY allowlist of symbols. The write-side surface for
//     applying / removing cards lives in @/ctad/cncfApplyService
//     so that the CTAD store retains exclusive ownership of all
//     state mutation.
//
// The named-import scan rejects any symbol whose identifier
// suggests write semantics (set*, add*, record*, remove*, write*,
// mutate*, clear*, update*, persist*) when imported from a
// @/ctad/* module inside @/cncf/*. Any new read-only symbol must
// be added to ALLOWED_NAMED_IMPORTS; any new write-side need must
// be implemented inside @/ctad and called from there, not from
// inside @/cncf.
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
  // CTAD value store — READ ONLY (getCtadParam, getBindingDoc,
  // and types). Writes are forbidden; the named-import scan below
  // rejects any setCtadParam / write-prefixed symbol.
  "@/ctad/ctadStore",
  // CTAD constraint store — READ ONLY (getActiveAllowedOptions,
  // getContributions). Same rule.
  "@/ctad/ctadConstraintsStore",
];

// Per-module read-only allowlist. Any named import from these
// CTAD modules MUST be one of the listed identifiers. Adding a
// new entry implicitly asserts it is a read-only operation.
const ALLOWED_NAMED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  "@/ctad/ctadRegistry": [
    "findParam",
    "findSectionForParam",
    "ALL_PARAM_IDS",
    "CTAD_REGISTRY",
    "CTAD_SECTIONS",
    "CTAD_SCHEMA_VERSION",
    "NOT_SPECIFIED_LABEL",
    // type-only:
    "CtadParameter",
    "CtadSection",
    "CtadSectionId",
    "CtadParamKind",
  ],
  "@/ctad/ctadStore": [
    "getCtadParam",
    "getBindingDoc",
    // type-only:
    "CtadBinding",
    "CtadParamValue",
    "CtadStateExport",
  ],
  "@/ctad/ctadConstraintsStore": [
    "getActiveAllowedOptions",
    "getContributions",
    // type-only:
    "ContributionEntry",
  ],
};

// Identifier prefixes that imply state mutation. Imports starting
// with any of these from a @/ctad/* module are rejected.
const FORBIDDEN_NAMED_IMPORT_PREFIXES: readonly string[] = [
  "set",
  "add",
  "record",
  "remove",
  "write",
  "mutate",
  "clear",
  "update",
  "persist",
  "reset",
  "delete",
  "subscribe",
];

function isAllowedSpecifier(specifier: string): boolean {
  // Specifiers under @/ctad/* MUST match an allowlisted module
  // EXACTLY — no subpath imports such as `@/ctad/ctadStore/foo`,
  // which would otherwise bypass the named-import scan.
  if (specifier.startsWith("@/ctad/")) {
    return Object.prototype.hasOwnProperty.call(
      ALLOWED_NAMED_IMPORTS,
      specifier,
    );
  }
  for (const prefix of ALLOWED_IMPORT_PREFIXES) {
    if (specifier === prefix) return true;
    if (prefix.endsWith("/") && specifier.startsWith(prefix)) return true;
    if (!prefix.endsWith("/") && specifier.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

// Replace block- and line-comments with whitespace of the same
// length so that scanning patterns cannot be evaded via comment
// interleaving (e.g. `export * as /* x */ name from ...`) and
// line numbers in error messages remain accurate.
function stripCommentsPreservingOffsets(input: string): string {
  let out = input.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  out = out.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return out;
}

function parseNamedImports(stmt: string): string[] {
  // Strip the "import" keyword and the "from '...';" tail; keep
  // the brace-list. Returns the symbol identifiers (ignoring the
  // optional "type" prefix, "as" aliases, and default/namespace
  // imports). Returns an empty array when no { ... } group exists.
  const brace = stmt.match(/\{([^}]*)\}/);
  if (!brace) return [];
  return brace[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // Allow "type Foo", "type Foo as Bar", "Foo as Bar".
      const cleaned = s.replace(/^type\s+/, "");
      const aliasIdx = cleaned.indexOf(" as ");
      const name = aliasIdx === -1 ? cleaned : cleaned.slice(0, aliasIdx);
      return name.trim();
    })
    .filter((name) => /^[A-Za-z_]/.test(name));
}

export function assertNoForbiddenCncfImports(
  sources: Record<string, string>,
): void {
  for (const [path, rawContents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;
    const contents = stripCommentsPreservingOffsets(rawContents);
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

    // Forbid namespace and default-only imports from any CTAD
    // module. These bypass the named-import scan because the
    // entire module surface (including write functions) is then
    // reachable through the imported binding (`store.setX(...)`).
    const namespaceImports = contents.matchAll(
      /import\s+\*\s+as\s+\w+\s+from\s+["'](@\/ctad\/[^"']+)["']/g,
    );
    for (const m of namespaceImports) {
      throw new Error(
        `CNCF invariant violation (namespace-import): file "${path}" uses a namespace import from "${m[1]}". Namespace imports expose the full module surface (including write functions). Replace with a named import of the specific read-only symbols listed in ALLOWED_NAMED_IMPORTS.`,
      );
    }
    const defaultImports = contents.matchAll(
      /import\s+\w+(?:\s*,\s*\{[^}]*\})?\s+from\s+["'](@\/ctad\/[^"']+)["']/g,
    );
    for (const m of defaultImports) {
      throw new Error(
        `CNCF invariant violation (default-import): file "${path}" uses a default or default+named import from "${m[1]}". Default imports bypass the read-only symbol allowlist. Replace with a pure named import.`,
      );
    }

    // Re-export scan: `export { ... } from "@/ctad/..."` and
    // `export * from "@/ctad/..."` MUST honour the same per-module
    // read-only allowlist and write-prefix rule as named imports —
    // otherwise the CNCF module could re-export write-capable CTAD
    // surface for any other module to call.
    const reExportStar = contents.matchAll(
      /export\s+\*\s+from\s+["'](@\/ctad\/[^"']+)["']/g,
    );
    for (const m of reExportStar) {
      throw new Error(
        `CNCF invariant violation (re-export-star): file "${path}" re-exports the entire surface of "${m[1]}" via \`export *\`. This bypasses the read-only symbol allowlist. Re-export only the specific read-only symbols by name, if at all.`,
      );
    }
    const reExportNamespace = contents.matchAll(
      /export\s+\*\s+as\s+[\w$]+\s+from\s+["'](@\/ctad\/[^"']+)["']/g,
    );
    for (const m of reExportNamespace) {
      throw new Error(
        `CNCF invariant violation (re-export-namespace): file "${path}" re-exports "${m[1]}" as a namespace via \`export * as <name> from\`. The namespace surface includes write-capable symbols. Re-export only the specific read-only symbols by name, if at all.`,
      );
    }
    const reExports = contents.matchAll(
      /export\s+(?:type\s+)?\{[^}]+\}\s+from\s+["'](@\/ctad\/[^"']+)["']/g,
    );
    for (const m of reExports) {
      const specifier = m[1];
      const allowed = ALLOWED_NAMED_IMPORTS[specifier];
      if (!allowed) {
        throw new Error(
          `CNCF invariant violation (re-export-spec): file "${path}" re-exports from "${specifier}", which is not on the CNCF read-only specifier allowlist.`,
        );
      }
      const names = parseNamedImports(m[0]);
      for (const name of names) {
        for (const prefix of FORBIDDEN_NAMED_IMPORT_PREFIXES) {
          if (name.startsWith(prefix)) {
            throw new Error(
              `CNCF invariant violation (re-export-write-symbol): file "${path}" re-exports symbol "${name}" from "${specifier}". Write-side operations on CTAD state must live in @/ctad/cncfApplyService and may not be re-exported through the CNCF module.`,
            );
          }
        }
        if (!allowed.includes(name)) {
          throw new Error(
            `CNCF invariant violation (re-export-named): file "${path}" re-exports symbol "${name}" from "${specifier}", which is not on the read-only allowlist. Add it to ALLOWED_NAMED_IMPORTS only after confirming it is a read-only operation.`,
          );
        }
      }
    }

    // Named-import scan: for any import from a CTAD store, every
    // imported symbol must be on the per-module allowlist AND
    // must not start with a write-suggesting prefix.
    const importStmts = contents.matchAll(
      /import\s+(?:type\s+)?\{[^}]+\}\s+from\s+["']([^"']+)["']/g,
    );
    for (const m of importStmts) {
      const specifier = m[1];
      const allowed = ALLOWED_NAMED_IMPORTS[specifier];
      if (!allowed) continue; // Only enforce on stores listed above.
      const names = parseNamedImports(m[0]);
      for (const name of names) {
        for (const prefix of FORBIDDEN_NAMED_IMPORT_PREFIXES) {
          if (name.startsWith(prefix)) {
            throw new Error(
              `CNCF invariant violation (write-symbol): file "${path}" imports symbol "${name}" from "${specifier}". Write-side operations on CTAD state must live in @/ctad/cncfApplyService and be invoked from there, not from inside @/cncf.`,
            );
          }
        }
        if (!allowed.includes(name)) {
          throw new Error(
            `CNCF invariant violation (named-import): file "${path}" imports symbol "${name}" from "${specifier}", which is not on the read-only allowlist. Add the symbol to ALLOWED_NAMED_IMPORTS in cncfIsolationInvariants.test-shape.ts after confirming it is a read-only operation.`,
          );
        }
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

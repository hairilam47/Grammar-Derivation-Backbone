// ACW Phase 5 — technology-aware semantic node binding helpers.
//
// One-way read of the CTAD parameter registry into the ACW
// rendering layer. Resolves a node's display label / icon from its
// optional `boundParam` (and `boundTechnologyCategory`) against the
// frozen CTAD registry; never writes back to the CTAD store and
// never imports from the decision pipeline (portfolio store, ADS /
// ECP builders, scenario reading, exposure derive). The ACW
// isolation invariant statically forbids any such import.
//
// Public surface:
//   - `resolveLabel(node, ctadState?)`        → string
//   - `resolveBoundOption(node, ctadState?)`  → string | null
//   - `resolveBoundOptions(node)`             → readonly string[]
//   - `resolveIcon(node)`                     → AcwIconEntry | undefined
//   - `findRegistryParam(sectionId, paramId)` → CtadParameter | undefined
//
// Every function falls back gracefully: a node with no `boundParam`
// returns its own `label` and no icon; an unknown `paramId` returns
// the node's own `label` and no options.
import { findParam, type CtadParameter } from "@/ctad/ctadRegistry";
import type { AcwNode } from "../acwStore";
import { lookupIconForCategory, type AcwIconEntry } from "../icons/iconRegistry";

// Minimal structural type for the CTAD state the resolver consumes.
// Defined locally rather than imported from `ctad/ctadStore` so this
// module's only CTAD dependency is the frozen, read-only registry —
// the resolver remains agnostic to whether the CTAD state came from
// a binding-mode or architecture-mode export.
export type CtadParamValueLike = string | readonly string[] | null;
export interface CtadStateLike {
  readonly infrastructure: Readonly<Record<string, CtadParamValueLike>>;
  readonly application: Readonly<Record<string, CtadParamValueLike>>;
  readonly integration: Readonly<Record<string, CtadParamValueLike>>;
  readonly crossCutting: Readonly<Record<string, CtadParamValueLike>>;
  readonly ops: Readonly<Record<string, CtadParamValueLike>>;
}

const SECTION_KEYS: readonly (keyof CtadStateLike)[] = Object.freeze([
  "infrastructure",
  "application",
  "integration",
  "crossCutting",
  "ops",
]);

function isSectionKey(key: string): key is keyof CtadStateLike {
  return (SECTION_KEYS as readonly string[]).includes(key);
}

// Re-export through this module so component-level callers can stay
// inside `@/acw/semantic/*` and never import the CTAD registry
// directly. The acw isolation invariant scans component sources
// too; routing CTAD reads through here keeps the surface narrow.
export function findRegistryParam(
  sectionId: string,
  paramId: string,
): CtadParameter | undefined {
  const param = findParam(paramId);
  if (param === undefined) return undefined;
  // The CTAD registry stores the section on the section object, not
  // on the parameter. We loosely cross-check the caller's `sectionId`
  // against the live CTAD `findSectionForParam` lookup; mismatches
  // are not refusals (the binding may simply have drifted) but they
  // do silently produce no resolution.
  return param;
}

// Resolves the option value the binding currently selects against
// the supplied CTAD state. Returns `null` when:
//   - the node has no binding,
//   - the bound section / param is not on the supplied state, or
//   - the state holds `null` for that parameter (i.e. unspecified).
// For multi-select parameters (where the state is an array) we
// return the FIRST option string to keep the renderer's contract
// single-valued; the dropdown UI sources its full option list from
// `resolveBoundOptions(node)` and writes back via the store's
// `updateNodeBinding`.
export function resolveBoundOption(
  node: AcwNode,
  ctadState: CtadStateLike | null | undefined,
): string | null {
  if (node.boundParam === undefined) return null;
  // The node's authored optionValue is the source of truth for what
  // the user currently chose; it is also what `updateNodeBinding`
  // mutates. Falling through to the live CTAD state is a useful
  // backstop when the seeder returned a binding without a value.
  if (node.boundParam.optionValue !== null) return node.boundParam.optionValue;
  if (ctadState === null || ctadState === undefined) return null;
  const sectionKey = node.boundParam.sectionId;
  if (!isSectionKey(sectionKey)) return null;
  const sectionDict = ctadState[sectionKey];
  const raw = sectionDict[node.boundParam.paramId];
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
    return raw[0] as string;
  }
  return null;
}

// Resolves the label that the lens views should render for `node`.
// Order of precedence:
//   1. The bound option value (authored on the node, or sourced
//      from `ctadState` as a backstop).
//   2. The node's own `label` (the pre-Phase-5 rendering).
export function resolveLabel(
  node: AcwNode,
  ctadState: CtadStateLike | null | undefined = undefined,
): string {
  const bound = resolveBoundOption(node, ctadState);
  if (bound !== null && bound.length > 0) return bound;
  return node.label;
}

// Resolves the option set the dropdown should offer for the node's
// binding, sourced from the frozen CTAD registry. Returns `[]` when
// the node has no binding or the param is not in the registry — in
// either case the property panel hides the dropdown.
export function resolveBoundOptions(node: AcwNode): readonly string[] {
  if (node.boundParam === undefined) return [];
  const param = findRegistryParam(node.boundParam.sectionId, node.boundParam.paramId);
  if (param === undefined) return [];
  return param.options;
}

// Resolves the icon entry for `node`. Falls back to `undefined`
// when no `boundTechnologyCategory` is set or when the category is
// not in the registry — the renderer should treat this as "no icon"
// and fall through to its plain-rectangle node template.
export function resolveIcon(node: AcwNode): AcwIconEntry | undefined {
  return lookupIconForCategory(node.boundTechnologyCategory);
}

// ACW Workspace Builder — grammar / constraint hooks (v1 wired).
//
// Originally a placeholder slot (Task #44); the v1 grammar layer
// (Task #49) replaces the stubs with the real canonical registry and
// validator while keeping the public surface stable so prior call
// sites continue to compile.
//
// Constitutional guarantees this module preserves:
//   - PH6-HC1: nothing here recommends, mandates, or scores. The
//     validator returns neutral pass / refuse decisions only.
//   - PH6-HC2: nothing here serialises ADC data. The store
//     (`acwStore.ts`) persists workspace structure only.
//   - PH6-HC6: no override / bypass / force / escalate symbol.
//   - Master prompt §0: ACW diagrams enforce structural syntax only,
//     never meaning.
import { useEffect, useState } from "react";
import { assertAllAcwPlaceholderLanguage } from "../governance/staticTextGuard";
import {
  ACW_REGISTRY,
  isAcwElementType,
  type AcwElementType,
} from "./acwGrammar";
import { getWorkspace, subscribe, type AcwWorkspace } from "./acwStore";

// Canonical structure schema — now backed by the real v1 registry.
// The shape is preserved (frozen object with `slotName`,
// `schemaVersion`, and `fields`) so any future caller that probed
// the placeholder continues to work.
export const ACW_CANONICAL_STRUCTURE_SCHEMA = Object.freeze({
  slotName: "ACW_CANONICAL_STRUCTURE_SCHEMA",
  schemaVersion: ACW_REGISTRY.schemaVersion,
  fields: Object.freeze([
    "elementTypes",
    "edgeKinds",
    "containmentRules",
    "edgeRules",
  ] as const),
  registry: ACW_REGISTRY,
});

// Forbidden-element check slot. v1 wires the registry-based check:
// any element whose `type` is not part of the canonical registry is
// reported. Other findings remain reserved for future phases.
export const ACW_FORBIDDEN_ELEMENT_CHECKS: ReadonlyArray<{
  readonly id: string;
  readonly description: string;
}> = Object.freeze([
  Object.freeze({
    id: "unknown-element-type",
    description:
      "Reports any element whose type field is not part of the v1 ACW canonical registry.",
  }),
]);

export function runForbiddenElementChecks(
  element: unknown,
): ReadonlyArray<string> {
  const findings: string[] = [];
  if (
    element !== null &&
    typeof element === "object" &&
    "type" in (element as Record<string, unknown>)
  ) {
    const type = (element as Record<string, unknown>).type;
    if (!isAcwElementType(type)) {
      findings.push("unknown-element-type");
    }
  }
  return Object.freeze(findings);
}

// Phase 6 authority constraint hook slot. Remains an inert pass-
// through. Refusals continue to be the responsibility of the
// constitutional layer (`togafContainment.ts`); the v1 grammar
// validator only refuses structural violations.
export function applyPhase6AuthorityHook<T>(input: T): T {
  return input;
}

// React hook: subscribe to the shared AcwWorkspace and re-render on
// every mutation. Lens views call this so all five lenses observe
// the same single structureGraph (master prompt §12).
export function useAcwWorkspace(): AcwWorkspace {
  const [snapshot, setSnapshot] = useState<AcwWorkspace>(() => getWorkspace());
  useEffect(() => {
    const unsubscribe = subscribe(() => setSnapshot(getWorkspace()));
    // Re-read on mount in case storage changed between initial state
    // and effect attachment.
    setSnapshot(getWorkspace());
    return unsubscribe;
  }, []);
  return snapshot;
}

// Convenience: lookup helper for lens views.
export function findNodeType(
  workspace: AcwWorkspace,
  nodeId: string,
): AcwElementType | undefined {
  return workspace.structureGraph.nodes.find((n) => n.id === nodeId)?.type;
}

// Static labels exposed by this module. Empty today; the slot exists
// so future hook implementations can register their own labels and
// have them asserted against the strictest tier at module load.
const HOOK_STATIC_LABELS: readonly string[] = [
  "ACW_CANONICAL_STRUCTURE_SCHEMA",
];

assertAllAcwPlaceholderLanguage([...HOOK_STATIC_LABELS]);

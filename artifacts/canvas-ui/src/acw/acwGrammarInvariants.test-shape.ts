// ACW v1 — build-time grammar invariants.
//
// Module-load assertions that fail the bundle if the v1 grammar
// drifts from its constitutional shape. Mirrors the Phase 6
// negative-shape pattern (`.test-shape.ts` suffix): exports are
// predicates, not feature surface. Removing this file plus its
// side-effect import in `App.tsx` (and `WorkspaceShell.tsx`)
// restores pre-v1 behaviour with no other change required.
//
// What this module guards (per master prompt §13: silent rule drift
// forbidden):
//   1. Schema version is locked to "acw-1.0".
//   2. Every element type has at least one containment rule.
//   3. Every explicit edge kind has at least one permitted pair.
//   4. The validator returns refusals (not exceptions) for the
//      well-known refusal cases the master prompt enumerates.
//   5. The validator's refusal reasons pass the strictest
//      vocabulary tier (asserted indirectly: `acwValidator.ts`
//      asserts every reason string at module load, so importing
//      the validator here forces the assertion to run).
//
// Diagnostics: assertions throw with explanatory messages prefixed
// "ACW v1 grammar invariant violation".
import {
  ACW_REGISTRY,
  ACW_ELEMENT_TYPES,
  ACW_EXPLICIT_EDGE_KINDS,
  ACW_CONTAINMENT_RULES,
  ACW_EDGE_RULES,
  type AcwElementType,
} from "./acwGrammar";
import { canCreateNode, canCreateEdge, type ValidatorWorkspaceView } from "./acwValidator";
import { ACW_SCHEMA_VERSION, __acwStoreInternals } from "./acwStore";

const PREFIX = "ACW v1 grammar invariant violation";

// (1) Schema version locked.
if (ACW_REGISTRY.schemaVersion !== ACW_SCHEMA_VERSION) {
  throw new Error(
    `${PREFIX}: ACW_REGISTRY.schemaVersion (${ACW_REGISTRY.schemaVersion}) and ACW_SCHEMA_VERSION (${ACW_SCHEMA_VERSION}) disagree.`,
  );
}
if (ACW_SCHEMA_VERSION !== "acw-1.0") {
  throw new Error(
    `${PREFIX}: schemaVersion drift detected. v1 must remain "acw-1.0"; future structural changes require an explicit "acw-2.0".`,
  );
}

// (2) Every element type has at least one containment rule.
for (const type of ACW_ELEMENT_TYPES) {
  const rule = ACW_CONTAINMENT_RULES.find((r) => r.child === type);
  if (rule === undefined) {
    throw new Error(
      `${PREFIX}: element type "${type}" has no containment rule. Every element type must declare its permitted parents (use [null] for root-only).`,
    );
  }
  if (rule.permittedParents.length === 0) {
    throw new Error(
      `${PREFIX}: element type "${type}" has an empty permittedParents list. Use [null] for root-only or list at least one parent type.`,
    );
  }
}

// (3) Every explicit edge kind has at least one permitted pair.
for (const kind of ACW_EXPLICIT_EDGE_KINDS) {
  const rule = ACW_EDGE_RULES.find((r) => r.kind === kind);
  if (rule === undefined) {
    throw new Error(
      `${PREFIX}: explicit edge kind "${kind}" has no edge rule.`,
    );
  }
  if (rule.permittedPairs.length === 0) {
    throw new Error(
      `${PREFIX}: explicit edge kind "${kind}" has an empty permittedPairs list.`,
    );
  }
}

// (4) Validator refuses well-known bad operations against a
// fabricated workspace. We probe the four refusal categories the
// master prompt enumerates: unknown type, parent-required-but-null,
// parent-type-not-permitted, and non-permitted edge pair.
const empty = __acwStoreInternals.emptyWorkspace();
const emptyView: ValidatorWorkspaceView = __acwStoreInternals.viewFor(empty);

// Each negative probe asserts both the refusal AND a distinguishing
// substring of the refusal reason. This catches semantic drift where
// the validator collapses multiple refusal classes onto a single
// generic message (the master prompt's "silent rule drift" failure
// mode at the reason-classification layer).
function expectRefusal(
  label: string,
  result: ReturnType<typeof canCreateNode> | ReturnType<typeof canCreateEdge>,
  expectedReasonSubstring: string,
): void {
  if (result.ok !== false) {
    throw new Error(`${PREFIX}: validator did not refuse ${label}.`);
  }
  if (!result.reason.toLowerCase().includes(expectedReasonSubstring.toLowerCase())) {
    throw new Error(
      `${PREFIX}: refusal reason for ${label} drifted. Expected substring "${expectedReasonSubstring}", got "${result.reason}".`,
    );
  }
}

// 4a. Unknown element type → refusal classified as grammar-membership.
expectRefusal(
  "an unknown element type",
  canCreateNode("UnknownType", null, emptyView),
  "grammar",
);

// 4b. Component cannot exist at the workspace root → root-only class.
expectRefusal(
  "a Component at the workspace root",
  canCreateNode("Component", null, emptyView),
  "workspace root",
);

// 4c. Component cannot be the child of a Zone → parent-type mismatch.
{
  const fakeView: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "fake-zone" ? ("Zone" as AcwElementType) : undefined,
  };
  expectRefusal(
    "Component as child of Zone",
    canCreateNode("Component", "fake-zone", fakeView),
    "permitted inside",
  );
}

// 4d. INTERFACES_WITH between a Zone and a System → edge-pair class.
{
  const fakeView: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "z" ? ("Zone" as AcwElementType) : id === "s" ? ("System" as AcwElementType) : undefined,
  };
  expectRefusal(
    "INTERFACES_WITH between Zone and System",
    canCreateEdge("INTERFACES_WITH", "z", "s", fakeView),
    "permitted between",
  );
}

// 4e. Self-edge → self-loop class.
{
  const fakeView: ValidatorWorkspaceView = {
    getNodeType: (id: string) => (id === "s" ? ("System" as AcwElementType) : undefined),
  };
  expectRefusal(
    "a self-loop edge",
    canCreateEdge("CONNECTS", "s", "s", fakeView),
    "itself",
  );
}

// 4f. Read-validation rejects tampered persisted documents that have
// orphan parent references. This guards the constitutional read-path
// hardening added to acwStore.assertAllowedFields.
{
  const tampered = {
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: {
      nodes: [
        {
          id: "n1",
          type: "Component" as AcwElementType,
          parentId: "missing-parent",
          label: "orphan",
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    },
  };
  if (__acwStoreInternals.isValidWorkspace(tampered)) {
    throw new Error(
      `${PREFIX}: read-validator accepted a persisted document with an orphan parent reference.`,
    );
  }
}

// (5) Positive sanity: at least one well-formed operation passes.
{
  const r = canCreateNode("Zone", null, emptyView);
  if (r.ok !== true) {
    throw new Error(
      `${PREFIX}: validator unexpectedly refused a Zone at the workspace root: ${r.ok === false ? r.reason : "unknown reason"}.`,
    );
  }
}

// Exported predicate so future callers (or a follow-up test
// harness) can re-run the assertions on demand. Calling it after
// module load is a no-op for the live registry.
export function assertAcwV1GrammarInvariants(): void {
  // Re-importing the registry here would re-trigger the same checks
  // via static initialisation; the side-effect block above already
  // ran them once. This thunk exists to make the assertion surface
  // discoverable from test harnesses.
  if (ACW_REGISTRY.schemaVersion !== "acw-1.0") {
    throw new Error(`${PREFIX}: schemaVersion drift detected at runtime.`);
  }
}

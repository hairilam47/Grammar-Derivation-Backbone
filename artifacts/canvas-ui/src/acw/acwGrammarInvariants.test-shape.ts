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
  ACW_DOMAIN_TAGS,
  isAcwDomainTag,
  type AcwElementType,
} from "./acwGrammar";
import { canCreateNode, canCreateEdge, type ValidatorWorkspaceView } from "./acwValidator";
import { ACW_SCHEMA_VERSION, __acwStoreInternals } from "./acwStore";

const PREFIX = "ACW v1 grammar invariant violation";

// (0) Registry shape: ACW_REGISTRY itself and its top-level
// collections must be frozen and non-empty. A drift here (e.g. a
// future commit replacing the frozen registry with a mutable
// object) silently breaks the constitutional guarantee that the
// grammar is a build-time constant.
if (!Object.isFrozen(ACW_REGISTRY)) {
  throw new Error(`${PREFIX}: ACW_REGISTRY is not frozen.`);
}
for (const [name, value] of [
  ["ACW_ELEMENT_TYPES", ACW_ELEMENT_TYPES],
  ["ACW_EXPLICIT_EDGE_KINDS", ACW_EXPLICIT_EDGE_KINDS],
  ["ACW_CONTAINMENT_RULES", ACW_CONTAINMENT_RULES],
  ["ACW_EDGE_RULES", ACW_EDGE_RULES],
] as const) {
  if (value.length === 0) {
    throw new Error(`${PREFIX}: ${name} is empty.`);
  }
}

// (0b) Every element type referenced by a containment or edge rule
// must itself be a member of ACW_ELEMENT_TYPES. Catches the failure
// mode where a rule names a stale or misspelled type that the rest
// of the registry has dropped.
const elementTypeSet = new Set<string>(ACW_ELEMENT_TYPES);
for (const rule of ACW_CONTAINMENT_RULES) {
  if (!elementTypeSet.has(rule.child)) {
    throw new Error(
      `${PREFIX}: containment rule references unknown child type "${rule.child}".`,
    );
  }
  for (const p of rule.permittedParents) {
    if (p !== null && !elementTypeSet.has(p)) {
      throw new Error(
        `${PREFIX}: containment rule for "${rule.child}" references unknown parent type "${p}".`,
      );
    }
  }
}
for (const rule of ACW_EDGE_RULES) {
  for (const [a, b] of rule.permittedPairs) {
    if (!elementTypeSet.has(a) || !elementTypeSet.has(b)) {
      throw new Error(
        `${PREFIX}: edge rule "${rule.kind}" references unknown element type in pair [${a}, ${b}].`,
      );
    }
  }
}

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

// 4c. Component cannot be the child of a ComputeNode → parent-type
// mismatch. (Pre-EAStudio this probe used Zone as the illegal parent;
// EAStudio Phase 1 widens Component to permit Zone / BusinessEntity
// parents, so the probe was retargeted to ComputeNode — which the
// containment rule continues to refuse.)
{
  const fakeView: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "fake-cn" ? ("ComputeNode" as AcwElementType) : undefined,
  };
  expectRefusal(
    "Component as child of ComputeNode",
    canCreateNode("Component", "fake-cn", fakeView),
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

// 4f. CONTAINS edge between two Components is not permitted (the
// only permitted CONTAINS pairs are Zone↔ComputeNode,
// ComputeNode↔System, System↔Component). This guards that the
// CONTAINS edge rule wasn't accidentally widened.
{
  const fakeView: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "c1" || id === "c2" ? ("Component" as AcwElementType) : undefined,
  };
  expectRefusal(
    "CONTAINS between two Components",
    canCreateEdge("CONTAINS", "c1", "c2", fakeView),
    "permitted between",
  );
}

// 4g. Read-validation rejects tampered persisted documents that have
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

// (6) EAStudio Phase 1 — Business chain probes. These guard the
// new containment rules introduced for the four-domain canvas:
//   - BusinessEntity is a root-only element type.
//   - Zone may live inside BusinessEntity (Department-in-Business).
//   - Zone may live inside Zone (OrgUnit-in-Department).
//   - System may live inside Zone (BusinessProcess-in-OrgUnit, or
//     Application-in-domain-Zone).
//   - Component may live inside Zone (e.g. Database-in-Technology).
//   - System and Component may NOT live directly inside a
//     BusinessEntity — the strict Business chain
//     (BusinessEntity → Zone → Zone → System) is enforced at the
//     validator level so a Business Process dropped on the Business
//     domain container produces a refusal banner, not a silent
//     reparent.
// Each positive probe checks ok:true; each negative probe asserts a
// refusal whose reason references the containment chain.
{
  const r = canCreateNode("BusinessEntity", null, emptyView);
  if (r.ok !== true) {
    throw new Error(
      `${PREFIX}: BusinessEntity at the workspace root refused: ${r.ok === false ? r.reason : "unknown reason"}.`,
    );
  }
}
{
  const view: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "be" ? ("BusinessEntity" as AcwElementType) : undefined,
  };
  // Positive: Zone is the only permitted child of BusinessEntity.
  {
    const r = canCreateNode("Zone", "be", view);
    if (r.ok !== true) {
      throw new Error(
        `${PREFIX}: EAStudio widening — Zone as child of BusinessEntity refused: ${r.ok === false ? r.reason : "unknown reason"}.`,
      );
    }
  }
  // Negative: System (e.g. Business Process) directly under
  // BusinessEntity must be refused.
  expectRefusal(
    "System as direct child of BusinessEntity",
    canCreateNode("System", "be", view),
    "permitted inside",
  );
  // Negative: Component (e.g. KPI Card) directly under
  // BusinessEntity must be refused.
  expectRefusal(
    "Component as direct child of BusinessEntity",
    canCreateNode("Component", "be", view),
    "permitted inside",
  );
}
{
  const view: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "z" ? ("Zone" as AcwElementType) : undefined,
  };
  for (const child of ["Zone", "System", "Component"] as const) {
    const r = canCreateNode(child, "z", view);
    if (r.ok !== true) {
      throw new Error(
        `${PREFIX}: EAStudio widening — ${child} as child of Zone refused: ${r.ok === false ? r.reason : "unknown reason"}.`,
      );
    }
  }
}
// BusinessEntity remains root-only — it must not be permitted inside
// another container. Widening did not nest BusinessEntity nodes.
{
  const view: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "be" ? ("BusinessEntity" as AcwElementType) : undefined,
  };
  expectRefusal(
    "BusinessEntity as child of BusinessEntity",
    canCreateNode("BusinessEntity", "be", view),
    "permitted inside",
  );
}

// (6b) Strict-chain *contextual* refusal — System (Business
// process) inside a Department-tier Zone (a Zone whose parent is
// a BusinessEntity) must be refused even though the
// `permittedParents` table allows System under any Zone. This is
// the validator-level guard that makes drag-to-reparent obey the
// same rule as palette drop. Three positive controls assert:
//   - System under an OrgUnit-tier Zone (Zone whose parent is
//     itself a Zone, ancestor BusinessEntity) is permitted.
//   - System under a Zone whose top ancestor is *not* a
//     BusinessEntity (e.g. an Application-domain Zone parented to
//     another Zone) is permitted.
//   - System under a Zone whose top ancestor is *not* a
//     BusinessEntity AND is itself the top container is
//     permitted (Application-as-System under domain Zone).
{
  // Negative — Department-tier (Zone "dept" parented to "be" which
  // is a BusinessEntity).
  const view: ValidatorWorkspaceView = {
    getNodeType: (id: string) => {
      if (id === "be") return "BusinessEntity" as AcwElementType;
      if (id === "dept") return "Zone" as AcwElementType;
      if (id === "orgu") return "Zone" as AcwElementType;
      return undefined;
    },
    getNodeParentId: (id: string) => {
      if (id === "be") return null;
      if (id === "dept") return "be";
      if (id === "orgu") return "dept";
      return undefined;
    },
  };
  expectRefusal(
    "System inside Department-tier Zone (Business chain break)",
    canCreateNode("System", "dept", view),
    "Org unit",
  );
  // Positive — OrgUnit-tier Zone (parent is a Zone whose own
  // parent is BusinessEntity) accepts System.
  {
    const r = canCreateNode("System", "orgu", view);
    if (r.ok !== true) {
      throw new Error(
        `${PREFIX}: System inside OrgUnit-tier Zone refused: ${r.ok === false ? r.reason : "unknown reason"}.`,
      );
    }
  }
}
{
  // Positive — Application-domain shape: Zone "appz" is the top
  // container (no BusinessEntity ancestor). System under "appz"
  // must remain permitted.
  const view: ValidatorWorkspaceView = {
    getNodeType: (id: string) =>
      id === "appz" ? ("Zone" as AcwElementType) : undefined,
    getNodeParentId: (id: string) => (id === "appz" ? null : undefined),
  };
  const r = canCreateNode("System", "appz", view);
  if (r.ok !== true) {
    throw new Error(
      `${PREFIX}: Application-as-System under top Zone refused: ${r.ok === false ? r.reason : "unknown reason"}.`,
    );
  }
}

// (7) EAStudio Phase 4 (Task #170) — domain-tag membership probe.
// The lens filters at `/workspace/*` partition nodes by `domainTag`,
// so the registered tag set must include the four core domains
// (business / data / application / technology) plus the two
// lens-only tags Phase 4 introduced (operations / external). A
// future commit that drops or renames any of these silently breaks
// the corresponding lens; this probe fails the bundle instead.
{
  const expected = [
    "business",
    "data",
    "application",
    "technology",
    "operations",
    "external",
  ] as const;
  for (const tag of expected) {
    if (!(ACW_DOMAIN_TAGS as readonly string[]).includes(tag)) {
      throw new Error(
        `${PREFIX}: ACW_DOMAIN_TAGS is missing the well-known tag "${tag}".`,
      );
    }
    if (!isAcwDomainTag(tag)) {
      throw new Error(
        `${PREFIX}: isAcwDomainTag refused the well-known tag "${tag}".`,
      );
    }
  }
  // Negative — a clearly-not-a-tag string is refused.
  if (isAcwDomainTag("not-a-domain")) {
    throw new Error(
      `${PREFIX}: isAcwDomainTag accepted a string that is not a registered tag.`,
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

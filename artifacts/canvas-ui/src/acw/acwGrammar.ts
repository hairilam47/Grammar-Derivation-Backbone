// ACW v1 — canonical element registry + grammar predicates.
//
// This module owns the constitutional grammar of the Architecture
// Composition Workspace (ACW) in its v1 form. It enumerates the
// element types, the relationship kinds, and the containment /
// connectivity rules. The validator (acwValidator.ts) consumes this
// registry and produces neutral refusal reasons; nothing in this
// module renders, mutates, or persists state.
//
// Constitutional guarantees this module preserves:
//   - Master prompt §0: ACW diagrams enforce structural syntax only,
//     never meaning. Nothing here scores, ranks, recommends, or
//     prioritises.
//   - PH6-HC1 / PH6-HC2 / PH6-HC6: no decision-pipeline coupling,
//     no override / bypass / force / escalate symbol.
//   - Vocabulary: every static label below is asserted against
//     ACW_PLACEHOLDER_FORBIDDEN at module load.
//
// Language carve-out documented up front: the master prompt's
// suggested refusal sentence ("This connection is not allowed")
// contains the substring "low" inside "allowed", which is banned by
// the responsibility-lens tier the ACW vocabulary transitively
// inherits. We use the synonymous neutral phrasing "is not
// permitted" throughout. The semantic meaning is unchanged.
import { assertAllAcwPlaceholderLanguage } from "../governance/staticTextGuard";

// ---------------------------------------------------------------------------
// Element types
// ---------------------------------------------------------------------------
//
// Derived directly from the master prompt: the chain it names for v3
// zoom-through is Zone → ComputeNode → System → Component. Those four
// types are sufficient for every relationship the prompt enumerates;
// no additional types are introduced in v1.
export const ACW_ELEMENT_TYPES = [
  "Zone",
  "ComputeNode",
  "System",
  "Component",
  // EAStudio Phase 1 — additive widening. `BusinessEntity` is the
  // type of the immutable Business domain container at the workspace
  // root. Modelling it as its own type (rather than reusing `Zone`)
  // lets the grammar enforce that the Business domain hierarchy
  // (Department → OrgUnit → BusinessProcess) is rooted at a
  // BusinessEntity, while the other three domain containers
  // (data / application / technology) remain plain `Zone` nodes.
  "BusinessEntity",
] as const;
export type AcwElementType = (typeof ACW_ELEMENT_TYPES)[number];

// EAStudio Phase 1 — domain markers carried as optional metadata on
// every node. Pure UI categorisation; the validator has no opinion
// about a node's `domainTag`. The four-domain partition (Business /
// Data / Application / Technology) mirrors the four immutable
// domain container nodes the EAStudio canvas seeds at workspace
// initialisation.
export const ACW_DOMAIN_TAGS = [
  "business",
  "data",
  "application",
  "technology",
] as const;
export type AcwDomainTag = (typeof ACW_DOMAIN_TAGS)[number];

export function isAcwDomainTag(value: unknown): value is AcwDomainTag {
  return (
    typeof value === "string" &&
    (ACW_DOMAIN_TAGS as readonly string[]).includes(value)
  );
}

export function isAcwElementType(value: unknown): value is AcwElementType {
  return (
    typeof value === "string" &&
    (ACW_ELEMENT_TYPES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Relationship (edge) kinds
// ---------------------------------------------------------------------------
//
// The four kinds the master prompt names. CONTAINS is materialised as
// a parent reference on the contained node rather than as an edge
// record (see CONTAINMENT NOTE below); the other three are stored as
// explicit edges.
export const ACW_EDGE_KINDS = [
  "CONTAINS",
  "CONNECTS",
  "INTERFACES_WITH",
  "DATA_FLOW",
] as const;
export type AcwEdgeKind = (typeof ACW_EDGE_KINDS)[number];

export function isAcwEdgeKind(value: unknown): value is AcwEdgeKind {
  return (
    typeof value === "string" &&
    (ACW_EDGE_KINDS as readonly string[]).includes(value)
  );
}

// Edge kinds that may be created via the explicit "create edge"
// affordance. CONTAINS is also authorable as an explicit edge for
// users who prefer to express containment as a relationship between
// two existing nodes; it is additionally materialised on the child's
// `parentId` at node-creation time (see CONTAINMENT NOTE), so a
// CONTAINS edge record is a redundant-but-permitted second
// representation of the same structural fact.
export const ACW_EXPLICIT_EDGE_KINDS = [
  "CONTAINS",
  "CONNECTS",
  "INTERFACES_WITH",
  "DATA_FLOW",
] as const;
export type AcwExplicitEdgeKind = (typeof ACW_EXPLICIT_EDGE_KINDS)[number];

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------
//
// Every label in this map renders into the DOM via the lens views and
// the authoring toolbar. They are asserted against
// ACW_PLACEHOLDER_FORBIDDEN at module load. The label for DATA_FLOW
// is "Data exchange" because the literal word "flow" embeds "low",
// which is banned by the responsibility-lens tier the ACW vocabulary
// transitively inherits.
export const ACW_ELEMENT_TYPE_LABEL: Readonly<Record<AcwElementType, string>> =
  Object.freeze({
    Zone: "Zone",
    ComputeNode: "Compute node",
    System: "System",
    Component: "Component",
    BusinessEntity: "Business entity",
  });

export const ACW_EDGE_KIND_LABEL: Readonly<Record<AcwEdgeKind, string>> =
  Object.freeze({
    CONTAINS: "Contains",
    CONNECTS: "Connects",
    INTERFACES_WITH: "Interfaces with",
    DATA_FLOW: "Data exchange",
  });

// ---------------------------------------------------------------------------
// Containment grammar
// ---------------------------------------------------------------------------
//
// CONTAINMENT NOTE. Containment is the v3 zoom-through chain:
// Zone → ComputeNode → System → Component. v1 stores a node's
// container as `parentId`; the validator enforces the chain at node
// creation, so the structural invariant holds without an explicit
// CONTAINS edge record. The CONTAINS edge kind remains in
// ACW_EDGE_KINDS so the grammar registry is complete on its own
// terms; v2 will materialise grouping operations through it.
//
// `null` parent is permitted exactly when an element type may exist
// at the workspace root (Zone, or System without a containing
// ComputeNode for the lightweight case).
export interface ContainmentRule {
  readonly child: AcwElementType;
  readonly permittedParents: readonly (AcwElementType | null)[];
}

export const ACW_CONTAINMENT_RULES: readonly ContainmentRule[] = Object.freeze([
  Object.freeze({
    child: "Zone",
    // EAStudio Phase 1 widening: a Zone may sit at the workspace root
    // (the three non-Business domain containers and any pre-Phase-1
    // top-level Zone), inside a `BusinessEntity` (e.g. a Department
    // Zone inside the Business domain container), or inside another
    // Zone (e.g. an OrgUnit Zone inside a Department Zone, or a
    // Network Layer Zone inside a Cloud Region Zone). The root option
    // remains permitted, so every pre-widening graph stays valid.
    permittedParents: Object.freeze([null, "BusinessEntity", "Zone"] as const),
  }),
  Object.freeze({
    child: "ComputeNode",
    // ComputeNode is permitted at the workspace root OR inside a
    // Zone. The root option is a v2-introduced widening: the 2D
    // canvas needs a place where a user can drop a fresh
    // ComputeNode before grouping it (or others) into a Zone, and
    // requiring a Zone first defeats the manual-grouping flow.
    // The widening is additive — every v1-valid graph remains
    // valid, and downstream lenses still treat root-level
    // ComputeNodes as part of the Technology layer.
    permittedParents: Object.freeze([null, "Zone"] as const),
  }),
  Object.freeze({
    child: "System",
    // EAStudio Phase 1 widening: a System may also live inside a
    // Zone (e.g. an Application System inside the Application domain
    // Zone, or a BusinessProcess System inside an OrgUnit Zone).
    // Root and ComputeNode remain permitted. `BusinessEntity` is
    // intentionally NOT a permitted parent for System: the spec
    // requires the strict Business chain
    // (BusinessEntity → Zone → Zone → System), so a Business
    // Process dropped directly into the Business domain container
    // is refused by the validator and surfaces a refusal banner.
    permittedParents: Object.freeze(
      [null, "ComputeNode", "Zone"] as const,
    ),
  }),
  Object.freeze({
    child: "Component",
    // EAStudio Phase 1 widening: a Component may also live inside a
    // Zone (e.g. a Database Component inside the Technology domain
    // Zone). The legacy `System` parent is preserved. `BusinessEntity`
    // is intentionally NOT a permitted parent for Component: the
    // strict Business chain forbids Components from sitting directly
    // under the Business domain container; KPI Cards must live
    // inside an OrgUnit / Department Zone.
    permittedParents: Object.freeze(
      ["System", "Zone"] as const,
    ),
  }),
  Object.freeze({
    child: "BusinessEntity",
    // BusinessEntity is reserved for the immutable Business domain
    // container. It is rooted at the workspace root and never nested
    // inside another container.
    permittedParents: Object.freeze([null] as const),
  }),
]);

export function permittedParentsFor(
  child: AcwElementType,
): readonly (AcwElementType | null)[] {
  for (const rule of ACW_CONTAINMENT_RULES) {
    if (rule.child === child) return rule.permittedParents;
  }
  return Object.freeze([] as const);
}

// ---------------------------------------------------------------------------
// Edge grammar (explicit edges only — CONTAINS handled via parentId)
// ---------------------------------------------------------------------------
//
// The matrix below states, for every (kind, fromType, toType) triple,
// whether the relationship is structurally well-formed. "Same type"
// is the conservative default for peer relationships; cross-type
// peer relationships are added explicitly per kind.
export interface EdgeRule {
  readonly kind: AcwExplicitEdgeKind;
  // Each entry [fromType, toType] is an unordered pair: edges are
  // direction-agnostic for the v1 grammar. Authoring still records a
  // direction (fromId → toId) so v2 can render direction visually
  // without changing the grammar.
  readonly permittedPairs: readonly (readonly [AcwElementType, AcwElementType])[];
}

export const ACW_EDGE_RULES: readonly EdgeRule[] = Object.freeze([
  Object.freeze({
    kind: "CONTAINS",
    // CONTAINS is the structural-containment chain stated as an edge:
    // each pair below mirrors the containment rule for the child
    // type, including the EAStudio Phase 1 widening (Zone-in-Zone,
    // System-in-Zone, Component-in-Zone, and BusinessEntity → Zone).
    // BusinessEntity → System and BusinessEntity → Component are
    // intentionally absent: the strict Business chain refuses a
    // Business Process (System) or KPI Card (Component) parented
    // directly under the Business domain container. Edges are
    // direction-agnostic at the rule level; the store records the
    // authored direction (fromId → toId) so v2 can render it
    // visually without changing the grammar.
    permittedPairs: Object.freeze([
      Object.freeze(["Zone", "ComputeNode"] as const),
      Object.freeze(["ComputeNode", "System"] as const),
      Object.freeze(["System", "Component"] as const),
      Object.freeze(["Zone", "Zone"] as const),
      Object.freeze(["Zone", "System"] as const),
      Object.freeze(["Zone", "Component"] as const),
      Object.freeze(["BusinessEntity", "Zone"] as const),
    ] as const),
  }),
  Object.freeze({
    kind: "CONNECTS",
    // Peer connectivity. EAStudio Phase 2 (Task #91) widens this set
    // additively so the Studio author can draw peer relationships in
    // every domain quadrant — Business uses Zone-typed nodes
    // (Department / OrgUnit) end-to-end, Application / Technology mix
    // System and Component, and the legacy ComputeNode ↔ ComputeNode
    // pair is preserved for the original infrastructure-tier flow.
    // BusinessEntity is intentionally excluded: the four sealed
    // domain containers are not legal CONNECTS endpoints (the store
    // refuses them anyway via the sealed-container guard, but
    // omitting them at the grammar level documents the contract).
    // CONTAINS-typed cross-tier pairs (e.g., Zone ↔ System) remain
    // intentionally absent so containment never aliases as
    // connectivity.
    permittedPairs: Object.freeze([
      Object.freeze(["ComputeNode", "ComputeNode"] as const),
      Object.freeze(["System", "System"] as const),
      Object.freeze(["Zone", "Zone"] as const),
      Object.freeze(["Component", "Component"] as const),
    ] as const),
  }),
  Object.freeze({
    kind: "INTERFACES_WITH",
    // Application-level interface relation: between two Systems.
    permittedPairs: Object.freeze([
      Object.freeze(["System", "System"] as const),
    ] as const),
  }),
  Object.freeze({
    kind: "DATA_FLOW",
    // Data movement: between two Systems or between two Components.
    permittedPairs: Object.freeze([
      Object.freeze(["System", "System"] as const),
      Object.freeze(["Component", "Component"] as const),
    ] as const),
  }),
]);

export function isPermittedEdge(
  kind: AcwExplicitEdgeKind,
  fromType: AcwElementType,
  toType: AcwElementType,
): boolean {
  for (const rule of ACW_EDGE_RULES) {
    if (rule.kind !== kind) continue;
    for (const [a, b] of rule.permittedPairs) {
      if ((a === fromType && b === toType) || (a === toType && b === fromType)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Phase 5 — Technology-aware semantic node binding
// ---------------------------------------------------------------------------
//
// A node may carry an optional binding to a CTAD parameter so its
// rendered label / icon can be resolved from the live CTAD state
// (one-way read of CTAD into ACW). The grammar declares only the
// shape; resolution is done in `acw/semantic/techNodeBinding.ts`.
// All three fields are plain strings — no decision-pipeline shape
// is admitted into the ACW document.
export interface AcwBoundParam {
  readonly sectionId: string;
  readonly paramId: string;
  // The CTAD option currently selected for this binding. `null`
  // mirrors the CTAD "Not specified" state and renders the node
  // with the node's own `label` fallback.
  readonly optionValue: string | null;
}

export function isAcwBoundParamShape(value: unknown): value is AcwBoundParam {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  for (const k of keys) {
    if (k !== "sectionId" && k !== "paramId" && k !== "optionValue") return false;
  }
  if (typeof v.sectionId !== "string" || v.sectionId.length === 0) return false;
  if (typeof v.paramId !== "string" || v.paramId.length === 0) return false;
  if (v.optionValue !== null && typeof v.optionValue !== "string") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Level of Specification (LoS) — Phase 2 helpers
// ---------------------------------------------------------------------------
//
// EAStudio Phase 2 introduces three Levels of Specification:
//   L1 — Business     coarse business view
//   L2 — Application  the existing 2D EAStudio canvas
//   L3 — Technology   full-screen 3D structural canvas + L3 children
//
// The grammar's role is to declare the SHAPE of a node's optional
// `lodRange` field and the visibility predicate the lens filter
// uses. The framework is intentionally additive: pre-Phase-2
// nodes have no `lodRange` and are visible at every level, so
// every existing graph reads cleanly.
//
// The shape predicate sits in the grammar (not the store) so the
// store, the read-validator, and the L3 generator all consult a
// single canonical shape check.
export const ACW_LOD_LEVELS = [1, 2, 3] as const;
export type AcwLodLevel = (typeof ACW_LOD_LEVELS)[number];

export function isAcwLodLevel(value: unknown): value is AcwLodLevel {
  return value === 1 || value === 2 || value === 3;
}

export function isAcwLodRangeShape(
  value: unknown,
): value is readonly [AcwLodLevel, AcwLodLevel] {
  if (!Array.isArray(value)) return false;
  if (value.length !== 2) return false;
  const [a, b] = value;
  if (!isAcwLodLevel(a)) return false;
  if (!isAcwLodLevel(b)) return false;
  if (a > b) return false;
  return true;
}

// `isVisibleAtLod` is the single predicate every consumer uses to
// decide whether a given node participates in a given LoS view.
// Absent `lodRange` is the documented default (visible everywhere).
//
// Imported by the lens visibility filter and the L3 generator
// (via re-export through `acwLensStructure`); the store does not
// need it because the validator only checks the shape, not the
// per-level visibility.
export function isVisibleAtLod(
  node: { readonly lodRange?: readonly [number, number] },
  level: AcwLodLevel,
): boolean {
  const range = node.lodRange;
  if (range === undefined) return true;
  return level >= range[0] && level <= range[1];
}

// ---------------------------------------------------------------------------
// Registry summary (what the rest of the app reads)
// ---------------------------------------------------------------------------
//
// One frozen object surfaced to the rest of the codebase. Replaces
// the empty `ACW_CANONICAL_STRUCTURE_SCHEMA` placeholder slot.
export const ACW_REGISTRY = Object.freeze({
  schemaVersion: "acw-1.0" as const,
  elementTypes: ACW_ELEMENT_TYPES,
  edgeKinds: ACW_EDGE_KINDS,
  explicitEdgeKinds: ACW_EXPLICIT_EDGE_KINDS,
  containmentRules: ACW_CONTAINMENT_RULES,
  edgeRules: ACW_EDGE_RULES,
  elementTypeLabel: ACW_ELEMENT_TYPE_LABEL,
  edgeKindLabel: ACW_EDGE_KIND_LABEL,
});

// ---------------------------------------------------------------------------
// Static-label assertion (module load)
// ---------------------------------------------------------------------------
//
// Every string above that may render into the DOM is asserted
// against the strictest vocabulary tier. Element / edge identifiers
// (e.g. "ComputeNode", "DATA_FLOW") are NOT rendered directly; only
// the *label* maps reach the DOM. We assert the labels here so any
// future drift fails the bundle at module load.
assertAllAcwPlaceholderLanguage([
  ...Object.values(ACW_ELEMENT_TYPE_LABEL),
  ...Object.values(ACW_EDGE_KIND_LABEL),
]);

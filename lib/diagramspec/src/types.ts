// DiagramSpec — strict intermediate representation contract.
//
// Every diagram in the system originates from a DiagramSpec
// produced by `compileDiagramSpec(ctadState, request)`. Renderers
// (Track 3, future Track 4) consume positioned variants laid out
// by `@workspace/diagram-layout`. The spec itself is renderer-
// and layout-agnostic — only structure, identity, and semantics.
//
// A spec carries EXACTLY one viewType (C4 view kind) and EXACTLY
// one stratum (architectural perspective). The pairing is
// constrained by `viewRules.ts` and enforced by the validator.

export const DIAGRAMSPEC_SCHEMA_VERSION = "diagramspec-1.0" as const;

// C4 view types. The four canonical levels of the C4 model.
export type DiagramViewType =
  | "context"
  | "container"
  | "component"
  | "deployment";

export const DIAGRAM_VIEW_TYPES: readonly DiagramViewType[] = Object.freeze([
  "context",
  "container",
  "component",
  "deployment",
]);

// Strata are NEW and INDEPENDENT of the existing five CTAD
// sections (infrastructure / application / integration /
// crossCutting / ops). A diagram presents the architecture from
// exactly one stratum-perspective; the compiler decides which
// CTAD sections feed each stratum (see `stratumMapping.ts`).
export type DiagramStratum =
  | "organization"
  | "strategy"
  | "business"
  | "application"
  | "technology";

export const DIAGRAM_STRATA: readonly DiagramStratum[] = Object.freeze([
  "organization",
  "strategy",
  "business",
  "application",
  "technology",
]);

// Stable z-index per stratum, used by the layout engine for the
// Z axis (stratum depth). Lowest stratum index = closest to the
// viewer; highest = furthest. Order is fixed for layout stability.
export const STRATUM_INDEX: Readonly<Record<DiagramStratum, number>> =
  Object.freeze({
    organization: 0,
    strategy: 1,
    business: 2,
    application: 3,
    technology: 4,
  });

// Edge relations are a closed enumeration. The validator rejects
// any unknown relation. New relations must be added here AND in
// the runtime validator's allow-set.
export type DiagramRelation =
  | "depends-on"
  | "communicates-with"
  | "contains"
  | "hosts"
  | "connects-to";

export const DIAGRAM_RELATIONS: readonly DiagramRelation[] = Object.freeze([
  "depends-on",
  "communicates-with",
  "contains",
  "hosts",
  "connects-to",
]);

// Node kinds are deliberately small. The compiler emits one of:
//   - "actor"        : context-view external actor / org unit
//   - "system"       : context / container-view system boundary
//   - "container"    : container-view deployable unit
//   - "component"    : component-view internal element
//   - "environment"  : deployment-view environment grouping
//   - "node"         : deployment-view runtime node (host class)
export type DiagramNodeKind =
  | "actor"
  | "system"
  | "container"
  | "component"
  | "environment"
  | "node";

export const DIAGRAM_NODE_KINDS: readonly DiagramNodeKind[] = Object.freeze([
  "actor",
  "system",
  "container",
  "component",
  "environment",
  "node",
]);

// CTAD reference: every node carries a back-pointer to the CTAD
// element that justified its existence. This makes the compiler
// auditable and lets a future overlay highlight provenance.
export interface DiagramCtadRef {
  // CTAD section id ("infrastructure", "application", ...) or
  // the literal "synthesized" when the node was synthesized
  // (e.g. deployment-view environments derived from
  // deploymentTopology + hostingModel until envs become a
  // first-class CTAD section).
  readonly section: string;
  // Param id (registry id) or null when the node represents a
  // section-level container rather than a single param value.
  readonly paramId: string | null;
  // Selected option string, or null when the node is a section /
  // synthesized grouping.
  readonly option: string | null;
}

export interface DiagramNode {
  readonly id: string;
  readonly kind: DiagramNodeKind;
  readonly label: string;
  // Parent node id for nested nodes (deployment view: env hosts
  // node). null for top-level nodes.
  readonly parentId: string | null;
  readonly ctadRef: DiagramCtadRef;
}

export interface DiagramEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: DiagramRelation;
}

export interface DiagramSpec {
  readonly schemaVersion: typeof DIAGRAMSPEC_SCHEMA_VERSION;
  readonly viewType: DiagramViewType;
  readonly stratum: DiagramStratum;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

// Compiler input: the caller declares which view they want.
// A request that violates the viewType × stratum pairing rules
// is reported by the validator after the compiler runs (the
// compiler itself is total and returns an empty spec for an
// invalid request only when CTAD has nothing to say; the
// validator is the authority on legality).
export interface DiagramRequest {
  readonly viewType: DiagramViewType;
  readonly stratum: DiagramStratum;
}

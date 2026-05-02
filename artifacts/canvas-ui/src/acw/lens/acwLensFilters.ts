// EAStudio Phase 4 (Task #170) — shared lens-filter predicates.
//
// Each lens page at `/workspace/*` partitions the workspace via a
// pair of predicates (`nodeFilter`, `edgeFilter`) handed to
// `LensCanvas` / `LiveStructurePanel`. Defining them once here
// keeps the five lens pages and the lens-filter test-shape in
// agreement on what each lens surfaces.
//
// Constitutional discipline:
//   - Pure functions over the v1 ACW node / edge shape. No store
//     access, no React, no side effects.
//   - The grammar is the legality authority — these predicates are
//     pure UI scope. They never reject a malformed graph; they
//     only narrow what the lens decides to show.
//   - No domain tag is required for a node to surface (a lens
//     accepts the tag-aware match AND the legacy type-aware match
//     so existing graphs continue to render). When a node carries
//     `domainTag`, that takes precedence over its element type.
//   - Edge filters are computed against the visible-node id set so
//     a lens never renders an edge whose endpoints it has hidden.
import type { AcwEdge, AcwNode } from "../acwStore";

// ---------------------------------------------------------------------------
// Context & Domain — TOGAF Business.
// ---------------------------------------------------------------------------
//
// Surfaces the Business chain the EAStudio grammar carved out at
// Phase 1: BusinessEntity at the workspace root, Zone tiers under
// it (Department / OrgUnit), plus any node the user has tagged
// `business`. Components / Systems / ComputeNodes that are not
// `business`-tagged belong to other lenses.
//
// Tag precedence rule (mirrors every other lens predicate in this
// module): when `domainTag` is present, it is the authoritative
// answer — a `BusinessEntity` deliberately tagged `application` is
// rejected here so Application / Technology / Business stay
// disjoint on tagged graphs (the lens-filter invariant test-shape
// asserts the disjointness directly).
export function isContextDomainNode(n: AcwNode): boolean {
  if (n.domainTag === "business") return true;
  if (
    n.domainTag === "application" ||
    n.domainTag === "technology" ||
    n.domainTag === "external" ||
    n.domainTag === "operations"
  ) {
    return false;
  }
  if (n.type === "BusinessEntity") return true;
  // Untagged Zone at the workspace root counts as a business
  // domain container (legacy graphs that pre-date the `domainTag`
  // field).
  if (n.type === "Zone" && n.parentId === null && n.domainTag === undefined) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// System Landscape — TOGAF Application.
// ---------------------------------------------------------------------------
//
// Surfaces the Application layer: Systems and Components, plus any
// node the user has tagged `application`. Excludes nodes tagged
// `technology` / `external` / `operations` because those belong to
// their own lenses.
export function isSystemLandscapeNode(n: AcwNode): boolean {
  if (n.domainTag === "application") return true;
  if (
    n.domainTag === "technology" ||
    n.domainTag === "external" ||
    n.domainTag === "operations" ||
    n.domainTag === "business"
  ) {
    return false;
  }
  return n.type === "System" || n.type === "Component";
}

// ---------------------------------------------------------------------------
// Integration — Application + Data + cross-boundary.
// ---------------------------------------------------------------------------
//
// Surfaces nodes that participate in interface / data-exchange
// edges, plus the External boundary nodes the user has tagged
// `external`. The page narrows further to the endpoints actually
// touched by INTERFACES_WITH / DATA_FLOW / cross-domain CONNECTS
// edges; this base predicate is the union of admissible types.
export function isIntegrationNode(n: AcwNode): boolean {
  if (n.domainTag === "external") return true;
  if (n.domainTag === "data" || n.domainTag === "application") return true;
  if (n.domainTag === "business" || n.domainTag === "operations") return false;
  // Legacy graphs without domain tags: Systems and Components are
  // the natural integration endpoints.
  if (n.domainTag === undefined) {
    return n.type === "System" || n.type === "Component";
  }
  return false;
}

// Edge predicate for the Integration lens. INTERFACES_WITH and
// DATA_FLOW always count; CONNECTS counts when the two endpoints
// straddle different domain tags (cross-boundary connection).
export function isIntegrationEdge(
  e: AcwEdge,
  fromTag: AcwNode["domainTag"],
  toTag: AcwNode["domainTag"],
): boolean {
  if (e.kind === "INTERFACES_WITH" || e.kind === "DATA_FLOW") return true;
  if (e.kind === "CONNECTS") {
    // Both endpoints tagged and on different sides of a domain
    // boundary — that's the definition of an integration link.
    if (
      fromTag !== undefined &&
      toTag !== undefined &&
      fromTag !== toTag
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Deployment & Infrastructure — TOGAF Technology.
// ---------------------------------------------------------------------------
//
// Surfaces Zones / ComputeNodes plus any Technology-tagged node.
// Bare-root Systems still belong to the Application lens, so a
// System at the workspace root with no parent is filtered out
// here; a System nested inside a ComputeNode (Application placed
// onto infrastructure) is kept.
export function isDeploymentNode(n: AcwNode): boolean {
  if (n.domainTag === "technology") return true;
  if (
    n.domainTag === "business" ||
    n.domainTag === "application" ||
    n.domainTag === "external" ||
    n.domainTag === "operations"
  ) {
    return false;
  }
  if (n.type === "Zone" || n.type === "ComputeNode") return true;
  // System nested inside a ComputeNode is admissible.
  if (n.type === "System" && n.parentId !== null) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Operations & Continuity — cross-layer.
// ---------------------------------------------------------------------------
//
// Surfaces every Operations-tagged node alongside the Technology
// elements they depend on. Untagged graphs fall through to the
// Technology shape so legacy documents still render meaningfully.
export function isOperationsContinuityNode(n: AcwNode): boolean {
  if (n.domainTag === "operations") return true;
  if (n.domainTag === "technology") return true;
  if (
    n.domainTag === "business" ||
    n.domainTag === "application" ||
    n.domainTag === "external"
  ) {
    return false;
  }
  // Legacy: keep Zones / ComputeNodes / nested Systems so the
  // overview lens still has something to render on a pre-Phase-4
  // graph.
  if (n.type === "Zone" || n.type === "ComputeNode") return true;
  if (n.type === "System" && n.parentId !== null) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Restrict an edge collection to those whose endpoints both appear
 * in the given visible-id set. Used by every lens page so the canvas
 * never tries to draw a line to an off-screen node.
 */
export function edgesWithinVisibleNodes(
  edges: readonly AcwEdge[],
  visibleIds: ReadonlySet<string>,
): readonly AcwEdge[] {
  return edges.filter(
    (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId),
  );
}

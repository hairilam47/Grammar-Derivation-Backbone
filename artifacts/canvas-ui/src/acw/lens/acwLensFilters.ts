// EAStudio Phase 4 (Task #170) — shared lens-filter predicates.
//
// Each lens page at `/workspace/*` filters the EAStudio workspace
// via a node predicate handed to `LensCanvas` /
// `LiveStructurePanel` (Integration adds an edge predicate). The
// five viewpoints are deliberately **not** disjoint — a single
// node can legitimately surface in more than one lens (a
// `BusinessEntity` retagged `application` shows up in both Context
// & Domain and System Landscape because each lens reflects a
// different concern over the shared workspace document).
//
// Constitutional discipline:
//   - Pure functions over the v1 ACW node / edge shape. No store
//     access, no React, no side effects.
//   - The grammar is the legality authority — these predicates are
//     pure UI scope. They never reject a malformed graph; they
//     only narrow what the lens decides to show.
//   - No domain tag is required for a node to surface (a lens
//     accepts the tag-aware match AND the legacy type-aware match
//     so existing graphs continue to render).
//   - Edge filters are computed against the visible-node id set so
//     a lens never renders an edge whose endpoints it has hidden,
//     except where a lens explicitly opts into a wider edge scope
//     (Operations & Continuity admits any edge with at least one
//     endpoint visible).
import type { AcwEdge, AcwNode } from "../acwStore";

// ---------------------------------------------------------------------------
// Context & Domain — TOGAF Business.
// ---------------------------------------------------------------------------
//
// Per Phase 4 spec (Step 4): admit
//   - any node with `domainTag === 'business'`;
//   - business-shaped types regardless of tag (BusinessEntity, plus
//     Zones, since the EAStudio palette places Department / OrgUnit
//     / StrategyMap / Capability / ValueStream as Zone shapes under
//     the BusinessEntity root);
//   - data-tagged top-level System nodes (high-level data concepts
//     anchor the business view).
// Everything else is excluded.
export function isContextDomainNode(n: AcwNode): boolean {
  if (n.domainTag === "business") return true;
  if (n.type === "BusinessEntity") return true;
  if (n.type === "Zone") return true;
  if (
    n.domainTag === "data" &&
    n.type === "System" &&
    n.parentId === null
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// System Landscape — TOGAF Application.
// ---------------------------------------------------------------------------
//
// Per Phase 4 spec (Step 5): admit
//   - any node with `domainTag === 'application'`;
//   - any `System` / `Component` whose `boundTechnologyCategory`
//     is one of the application-shaped categories below (a Phase 5
//     binding can pull a technology-tagged node into the
//     application view because its technology binding is part of
//     the application stack — frontend / backend / gateway /
//     message-queue / integration);
//   - untagged `System` / `Component` nodes (legacy graphs predate
//     the `domainTag` field and have no other natural home).
const APPLICATION_TECHNOLOGY_CATEGORIES: ReadonlySet<string> = new Set([
  "frontend",
  "backend",
  "gateway",
  "message-queue",
  "integration",
]);

export function isSystemLandscapeNode(n: AcwNode): boolean {
  if (n.domainTag === "application") return true;
  if (
    (n.type === "System" || n.type === "Component") &&
    n.boundTechnologyCategory !== undefined &&
    APPLICATION_TECHNOLOGY_CATEGORIES.has(n.boundTechnologyCategory)
  ) {
    return true;
  }
  if (
    (n.type === "System" || n.type === "Component") &&
    n.domainTag === undefined
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Integration — Application + Data + cross-boundary.
// ---------------------------------------------------------------------------
//
// Per Phase 4 spec (Step 6): the Integration lens surfaces nodes
// touched by **cross-domain `CONNECTS` edges** (different
// `domainTag` on each end, including `external`) plus every
// `domainTag: 'external'` node, plus those cross-domain edges.
// This base predicate covers the always-admitted slice (external
// nodes); the page additionally walks the edges to add any node
// that participates in a cross-domain CONNECTS edge.
export function isIntegrationNode(n: AcwNode): boolean {
  return n.domainTag === "external";
}

// Edge predicate for the Integration lens. CONNECTS counts when
// the two endpoints straddle different domain tags
// (cross-boundary connection — including the external boundary).
// All other edge kinds are out of scope for this lens.
export function isIntegrationEdge(
  e: AcwEdge,
  fromTag: AcwNode["domainTag"],
  toTag: AcwNode["domainTag"],
): boolean {
  if (e.kind !== "CONNECTS") return false;
  if (fromTag === undefined || toTag === undefined) return false;
  return fromTag !== toTag;
}

// ---------------------------------------------------------------------------
// Deployment & Infrastructure — TOGAF Technology.
// ---------------------------------------------------------------------------
//
// Per Phase 4 spec (Step 7): admit any node with
// `domainTag === 'technology'`, plus the technology-shaped types
// the v1 grammar carved out — ComputeNode (always) and Zone
// (which the palette also uses as the container for technology
// zones). The spec mentions `Container` and `Database` as future
// technology-acting types; those are not part of `AcwElementType`
// today (the v1 grammar is `Zone | ComputeNode | System |
// Component | BusinessEntity`), so admission falls through the
// type-aware branch when those types are introduced via a future
// grammar widening — no schema-shape assertions are made here.
//
// A System nested inside a ComputeNode is admitted (Application
// placed onto infrastructure remains visible in this lens). A
// bare-root System belongs to the Application lens and is
// excluded.
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
  if (n.type === "ComputeNode") return true;
  if (n.type === "Zone") return true;
  if (n.type === "System" && n.parentId !== null) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Operations & Continuity — cross-layer.
// ---------------------------------------------------------------------------
//
// Per Phase 4 spec (Step 8): admit every `operations`-tagged node
// alongside every `technology`-tagged node (so operational
// policies can be linked to the infrastructure they govern).
// Untagged ComputeNodes also surface so pre-Phase-4 documents
// have meaningful infrastructure to render against.
export function isOperationsContinuityNode(n: AcwNode): boolean {
  if (n.domainTag === "operations") return true;
  if (n.domainTag === "technology") return true;
  if (n.domainTag === undefined && n.type === "ComputeNode") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Restrict an edge collection to those whose endpoints both appear
 * in the given visible-id set. Used by lens pages whose edge scope
 * is "edges between visible nodes" (System Landscape, Deployment,
 * Context & Domain). Pages with a wider edge scope (e.g.
 * Operations & Continuity, which admits edges with **at least
 * one** visible endpoint) compute their edge set directly.
 */
export function edgesWithinVisibleNodes(
  edges: readonly AcwEdge[],
  visibleIds: ReadonlySet<string>,
): readonly AcwEdge[] {
  return edges.filter(
    (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId),
  );
}

/**
 * Edge collection for lenses (like Operations & Continuity) whose
 * spec admits any edge with **at least one** endpoint passing the
 * lens's node predicate. Returns a tuple of:
 *   - `edges`: the edges that pass the at-least-one rule;
 *   - `expandedIds`: the union of the original visible-id set and
 *     the off-lens endpoints those edges drag into view, so the
 *     canvas always has a node to anchor each edge against.
 */
export function edgesTouchingVisibleNodes(
  edges: readonly AcwEdge[],
  visibleIds: ReadonlySet<string>,
): { edges: readonly AcwEdge[]; expandedIds: ReadonlySet<string> } {
  const kept: AcwEdge[] = [];
  const expanded = new Set<string>(visibleIds);
  for (const e of edges) {
    const fromIn = visibleIds.has(e.fromId);
    const toIn = visibleIds.has(e.toId);
    if (fromIn || toIn) {
      kept.push(e);
      expanded.add(e.fromId);
      expanded.add(e.toId);
    }
  }
  return { edges: kept, expandedIds: expanded };
}

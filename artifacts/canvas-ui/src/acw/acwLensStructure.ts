// ACW v3 — single source of truth for lens-scoped structural visibility.
//
// Master-prompt §0 / v3 brief: 3D and 2D must render the SAME
// structure. The only legitimate way to guarantee that at build
// time is to have a single pure function compute the visible
// structure for a lens, and have both renderers consume it. Any
// future regression that bypasses this helper (e.g. a 3D-only
// primitive that fabricates nodes the 2D canvas never shows)
// fails the structural-identity invariant
// (`acw3DStructureInvariants.test-shape.ts`).
//
// What "visible structure at a depth" means here:
//   1. Direct siblings of the focused parent — these are the
//      nodes the lens currently surfaces as the top tier.
//   2. For each direct sibling that has children AND is not
//      collapsed in this lens: the direct children too.
//   3. Edges whose endpoints are both in (1) ∪ (2).
//
// This module is pure. It performs no IO, owns no state, and
// imports nothing besides the workspace types — so it can be
// invoked from invariants without touching React, the store, or
// localStorage.
import type { AcwNode, AcwEdge } from "./acwStore";

// Re-export the structurally-relevant types so downstream readers
// (notably ACW Track 3, which is forbidden from importing the
// authored ACW store) can obtain the AcwNode / AcwEdge type
// shapes through a single read-only entry point.
export type { AcwNode, AcwEdge } from "./acwStore";

export interface LensDrawable {
  readonly node: AcwNode;
  /** True iff this direct sibling has at least one child in `nodes`. */
  readonly isContainer: boolean;
  /** True iff this direct sibling is collapsed in the current lens. */
  readonly isCollapsedHere: boolean;
  /**
   * Direct children of this sibling that are visible at this depth.
   * Empty when `isCollapsedHere` is true OR when there are no
   * children. Order matches the `nodes` array.
   */
  readonly childRefs: readonly AcwNode[];
}

export interface LensVisibility {
  /** Direct siblings of the focused parent. */
  readonly directSiblings: readonly AcwNode[];
  /** Per-sibling drawable record (containment + collapse state). */
  readonly drawables: readonly LensDrawable[];
  /** Stable, deduplicated set of node ids the lens renders at this depth. */
  readonly visibleNodeIds: readonly string[];
  /**
   * Edges whose `fromId` AND `toId` are both visible at this depth.
   * Order preserved from the input.
   */
  readonly visibleEdges: readonly AcwEdge[];
}

export function enumerateLensVisibility(
  nodes: readonly AcwNode[],
  edges: readonly AcwEdge[],
  focusedParentId: string | null,
  collapsedIds: ReadonlySet<string>,
): LensVisibility {
  const directSiblings = nodes.filter((n) => n.parentId === focusedParentId);

  // Pre-compute children-by-parent for O(n) container detection.
  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentId !== null) {
      childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
    }
  }

  const drawables: LensDrawable[] = directSiblings.map((sib) => {
    const hasChildren = (childCount.get(sib.id) ?? 0) > 0;
    const collapsedHere = collapsedIds.has(sib.id);
    const childRefs =
      hasChildren && !collapsedHere
        ? nodes.filter((n) => n.parentId === sib.id)
        : [];
    return {
      node: sib,
      isContainer: hasChildren,
      isCollapsedHere: collapsedHere,
      childRefs,
    };
  });

  const visibleSet = new Set<string>();
  for (const d of drawables) {
    visibleSet.add(d.node.id);
    for (const c of d.childRefs) visibleSet.add(c.id);
  }
  const visibleNodeIds = Array.from(visibleSet);
  const visibleEdges = edges.filter(
    (e) => visibleSet.has(e.fromId) && visibleSet.has(e.toId),
  );

  return Object.freeze({
    directSiblings,
    drawables: Object.freeze(drawables),
    visibleNodeIds: Object.freeze(visibleNodeIds),
    visibleEdges,
  });
}

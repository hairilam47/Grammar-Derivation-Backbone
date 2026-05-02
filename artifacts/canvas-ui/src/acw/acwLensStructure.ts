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
import { isVisibleAtLod, type AcwLodLevel } from "./acwGrammar";

// Re-export the structurally-relevant types so downstream readers
// (notably ACW Track 3, which is forbidden from importing the
// authored ACW store) can obtain the AcwNode / AcwEdge type
// shapes through a single read-only entry point.
export type { AcwNode, AcwEdge } from "./acwStore";
// Re-export the LoS level type so downstream lenses (and probes)
// can refer to a single canonical type without crossing into the
// grammar module directly.
export type { AcwLodLevel } from "./acwGrammar";

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
  // EAStudio Phase 2 (LoS framework) — when supplied, nodes whose
  // optional `lodRange` excludes the level are filtered out of the
  // result. Edges are kept only when both endpoints survive — the
  // same predicate the collapse-filter already uses below. Absent
  // (the v3 default) preserves pre-Phase-2 behaviour exactly.
  currentLodLevel?: AcwLodLevel,
  // Canvas Enhancements — when supplied, nodes that carry at least
  // one layer id AND have no overlap with this set are filtered out.
  // Nodes with no `layerIds` (or an empty array) are always shown,
  // matching the "unassigned = always visible" contract. Absent
  // (no layers defined on the lens) preserves prior behaviour.
  activeLayerIds?: ReadonlySet<string>,
): LensVisibility {
  const lodFilter = (n: AcwNode): boolean =>
    currentLodLevel === undefined ? true : isVisibleAtLod(n, currentLodLevel);
  // Canvas Enhancements — layer membership filter. A node with a
  // non-empty layerIds array must intersect the active set;
  // absence / empty-array means "always visible".
  const layerFilter = (n: AcwNode): boolean => {
    if (activeLayerIds === undefined) return true;
    if (!n.layerIds || n.layerIds.length === 0) return true;
    return n.layerIds.some((id) => activeLayerIds.has(id));
  };
  // Standard window: nodes whose parent is the focused parent.
  const baseSiblings = nodes
    .filter((n) => n.parentId === focusedParentId)
    .filter(lodFilter)
    .filter(layerFilter);
  // EAStudio Phase 2 (LoS framework) — at L3 the structural depth
  // window is widened to surface every L3-only node (lodRange
  // starting at 3) regardless of its depth from the focus, because
  // the L3 generator parents children to their L2 origin (which is
  // typically a grandchild of the root domain container) and would
  // otherwise sit outside the standard one-tier visibility window
  // when the L3 fullscreen surface focuses on `null`. Pre-Phase-2
  // nodes never carry `lodRange` and so are unaffected; nodes
  // whose `lodRange` does not start at the active level are still
  // filtered out by `lodFilter` (so an L1-only or L2-only node is
  // not promoted to an L3 sibling). When the active level is not
  // 3 this branch is a no-op — `baseSiblings` is returned as-is,
  // preserving pre-Phase-2 behaviour byte-for-byte.
  const directSiblings: readonly AcwNode[] =
    currentLodLevel === 3
      ? (() => {
          const seen = new Set(baseSiblings.map((n) => n.id));
          const extra: AcwNode[] = [];
          for (const n of nodes) {
            if (seen.has(n.id)) continue;
            if (n.lodRange === undefined) continue;
            if (n.lodRange[0] !== 3) continue;
            if (!lodFilter(n)) continue;
            extra.push(n);
            seen.add(n.id);
          }
          return [...baseSiblings, ...extra];
        })()
      : baseSiblings;

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
        ? nodes
            .filter((n) => n.parentId === sib.id)
            .filter(lodFilter)
            .filter(layerFilter)
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

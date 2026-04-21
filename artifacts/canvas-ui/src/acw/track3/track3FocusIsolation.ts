// ACW Track 3 — focus / isolate computation.
//
// Pure transformation: given the full structure and a clicked
// node id, return the subset that should remain visible while
// focus is active. Semantics:
//
//   - selectedNodeId === null  → return the input unchanged.
//   - selectedNodeId is a layer-root (parentId === null) → keep
//       the layer root, all of its direct children, and the
//       edges among them. Cross-layer children attached via
//       adjacency edges are also kept so the user sees what the
//       layer connects to.
//   - selectedNodeId is a leaf (parentId !== null) → keep the
//       leaf, every adjacency neighbour of the leaf, and the
//       parent layer-root of every kept node so containment
//       context is preserved. Edges between any two kept nodes
//       are retained.
//
// The function is total: as long as `selectedNodeId` exists in
// `nodes`, the result is non-empty (the selected node itself is
// always kept), so a click can never leave the canvas blank for
// a connected node. This property is asserted at module load by
// `acwTrack3FocusIsolationInvariants.test-shape.ts`.
import type { AcwNode, AcwEdge } from "@/acw/acwLensStructure";

export interface IsolationResult {
  readonly nodes: readonly AcwNode[];
  readonly edges: readonly AcwEdge[];
}

export function isolateAroundNode(
  nodes: readonly AcwNode[],
  edges: readonly AcwEdge[],
  selectedNodeId: string | null,
): IsolationResult {
  if (selectedNodeId === null) {
    return { nodes, edges };
  }
  const byId = new Map<string, AcwNode>();
  for (const n of nodes) byId.set(n.id, n);
  const selected = byId.get(selectedNodeId);
  if (selected === undefined) {
    // Stale selection (e.g. CTAD edit removed the node). Behave
    // as if no focus were set rather than render an empty canvas.
    return { nodes, edges };
  }

  const kept = new Set<string>();
  kept.add(selected.id);

  if (selected.parentId === null) {
    // Layer-root selection: keep the layer + all its children.
    for (const n of nodes) {
      if (n.parentId === selected.id) kept.add(n.id);
    }
    // Plus any node connected to a kept node via an edge.
    for (const e of edges) {
      if (kept.has(e.fromId)) kept.add(e.toId);
      if (kept.has(e.toId)) kept.add(e.fromId);
    }
  } else {
    // Leaf selection: keep the selected leaf plus every
    // adjacency neighbour reached in one hop.
    for (const e of edges) {
      if (e.fromId === selected.id) kept.add(e.toId);
      if (e.toId === selected.id) kept.add(e.fromId);
    }
  }

  // Always preserve the parent layer-root of every kept leaf so
  // containment context is visible.
  const finalKept = new Set<string>(kept);
  for (const id of kept) {
    const n = byId.get(id);
    if (n && n.parentId !== null && byId.has(n.parentId)) {
      finalKept.add(n.parentId);
    }
  }

  const keptNodes = nodes.filter((n) => finalKept.has(n.id));
  const keptEdges = edges.filter(
    (e) => finalKept.has(e.fromId) && finalKept.has(e.toId),
  );
  return { nodes: keptNodes, edges: keptEdges };
}

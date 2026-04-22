// diagram-layout — pure ELK wrapper.
//
// Single public function: `layoutDiagram(spec)`. Builds a
// hierarchical ELK graph (parent nodes nest their children) and
// returns positioned nodes/edges. Determinism: ELK's `layered`
// algorithm is deterministic given the same input + options; we
// pin a fixed `randomSeed` so successive calls on the same spec
// yield byte-identical positions.
//
// This module is the ONLY place in the system permitted to import
// `elkjs`. The diagramspec isolation invariant rejects any elkjs
// import from `lib/diagramspec/src`.

import ELK from "elkjs/lib/elk.bundled.js";
import {
  STRATUM_INDEX,
  type DiagramSpec,
  type DiagramNode,
  type DiagramEdge,
} from "@workspace/diagramspec";
import type {
  PositionedDiagram,
  PositionedEdge,
  PositionedNode,
} from "./types";

interface ElkGraphNode {
  id: string;
  width?: number;
  height?: number;
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
  layoutOptions?: Record<string, string>;
  x?: number;
  y?: number;
  labels?: { text: string }[];
}

interface ElkGraphEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: ReadonlyArray<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: ReadonlyArray<{ x: number; y: number }>;
  }>;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;

const SHARED_LAYOUT_OPTIONS: Readonly<Record<string, string>> = Object.freeze({
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.spacing.nodeNode": "40",
  "elk.padding": "[top=20,left=20,bottom=20,right=20]",
  "elk.randomSeed": "1",
  // Required so edges may cross hierarchy levels (deployment view
  // emits env --hosts--> child-node edges).
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
});

function buildElkGraph(spec: DiagramSpec): ElkGraphNode {
  // Build a parent-id → children index. Top-level children have
  // parentId === null. Hierarchical layout for the deployment
  // view falls out of this naturally because the compiler emits
  // env nodes with `parentId === null` and host nodes with
  // `parentId === <envId>`.
  const childrenByParent = new Map<string | null, DiagramNode[]>();
  for (const n of spec.nodes) {
    const arr = childrenByParent.get(n.parentId) ?? [];
    arr.push(n);
    childrenByParent.set(n.parentId, arr);
  }

  const buildNode = (n: DiagramNode): ElkGraphNode => {
    const kids = childrenByParent.get(n.id) ?? [];
    const elkNode: ElkGraphNode = {
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      labels: [{ text: n.label }],
    };
    if (kids.length > 0) {
      elkNode.children = kids.map(buildNode);
      elkNode.layoutOptions = { ...SHARED_LAYOUT_OPTIONS };
    }
    return elkNode;
  };

  const topLevel = (childrenByParent.get(null) ?? []).map(buildNode);

  // Edges go on the root graph; ELK handles cross-hierarchy edges.
  const edges: ElkGraphEdge[] = spec.edges.map((e: DiagramEdge) => ({
    id: e.id,
    sources: [e.from],
    targets: [e.to],
  }));

  return {
    id: "root",
    children: topLevel,
    edges,
    layoutOptions: { ...SHARED_LAYOUT_OPTIONS },
  };
}

function computeStratumZ(spec: DiagramSpec): number {
  return STRATUM_INDEX[spec.stratum];
}

function flattenPositioned(
  node: ElkGraphNode,
  parentAbsX: number,
  parentAbsY: number,
  parentId: string | null,
  z: number,
  out: PositionedNode[],
  spec: DiagramSpec,
): void {
  // Skip the synthetic root.
  const isRoot = node.id === "root";
  let absX = parentAbsX;
  let absY = parentAbsY;
  if (!isRoot) {
    absX = parentAbsX + (node.x ?? 0);
    absY = parentAbsY + (node.y ?? 0);
    out.push(
      Object.freeze({
        id: node.id,
        parentId,
        label: node.labels?.[0]?.text ?? node.id,
        x: absX,
        y: absY,
        z,
        width: node.width ?? NODE_WIDTH,
        height: node.height ?? NODE_HEIGHT,
      }),
    );
  }
  if (node.children) {
    for (const c of node.children) {
      flattenPositioned(c, absX, absY, isRoot ? null : node.id, z, out, spec);
    }
  }
}

function flattenEdges(
  node: ElkGraphNode,
  spec: DiagramSpec,
  out: PositionedEdge[],
  relationById: ReadonlyMap<string, string>,
): void {
  if (node.edges) {
    for (const e of node.edges) {
      const section = e.sections?.[0];
      const waypoints = section
        ? Object.freeze([
            Object.freeze({ x: section.startPoint.x, y: section.startPoint.y }),
            ...(section.bendPoints ?? []).map((p) =>
              Object.freeze({ x: p.x, y: p.y }),
            ),
            Object.freeze({ x: section.endPoint.x, y: section.endPoint.y }),
          ])
        : Object.freeze([] as { x: number; y: number }[]);
      out.push(
        Object.freeze({
          id: e.id,
          from: e.sources[0],
          to: e.targets[0],
          relation: relationById.get(e.id) ?? "depends-on",
          waypoints,
        }),
      );
    }
  }
  if (node.children) {
    for (const c of node.children) {
      flattenEdges(c, spec, out, relationById);
    }
  }
}

export async function layoutDiagram(
  spec: DiagramSpec,
): Promise<PositionedDiagram> {
  // Empty spec → empty positioned diagram (no ELK call at all).
  if (spec.nodes.length === 0) {
    return Object.freeze({
      viewType: spec.viewType,
      stratum: spec.stratum,
      nodes: Object.freeze([] as PositionedNode[]),
      edges: Object.freeze([] as PositionedEdge[]),
      width: 0,
      height: 0,
    });
  }
  const elk = new ELK();
  const graph = buildElkGraph(spec);
  const laid = (await elk.layout(graph as never)) as ElkGraphNode;
  const z = computeStratumZ(spec);
  const positionedNodes: PositionedNode[] = [];
  flattenPositioned(laid, 0, 0, null, z, positionedNodes, spec);
  const relationById = new Map(spec.edges.map((e) => [e.id, e.relation]));
  const positionedEdges: PositionedEdge[] = [];
  flattenEdges(laid, spec, positionedEdges, relationById);
  return Object.freeze({
    viewType: spec.viewType,
    stratum: spec.stratum,
    nodes: Object.freeze(positionedNodes),
    edges: Object.freeze(positionedEdges),
    width: laid.width ?? 0,
    height: laid.height ?? 0,
  });
}

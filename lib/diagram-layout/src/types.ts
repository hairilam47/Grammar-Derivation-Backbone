// diagram-layout — positioned-diagram contract.
//
// Axis meaning (fixed, documented):
//   X = interaction / flow direction (ELK layered: left → right).
//   Y = containment / C4 depth (parent above child).
//   Z = stratum index (organization=0 … technology=4).
//
// Renderers MUST honour this convention. The layout engine is the
// single source of geometric truth; renderers may translate /
// scale uniformly but never reinterpret an axis.

import type {
  DiagramSpec,
  DiagramStratum,
  DiagramViewType,
} from "@workspace/diagramspec";

export interface PositionedNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
}

export interface PositionedEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  // Polyline waypoints in the X/Y plane (Z inherits the source
  // node's z). Empty array = straight segment from source to
  // target centre.
  readonly waypoints: readonly { readonly x: number; readonly y: number }[];
}

export interface PositionedDiagram {
  readonly viewType: DiagramViewType;
  readonly stratum: DiagramStratum;
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
  readonly width: number;
  readonly height: number;
}

export type LayoutDiagram = (spec: DiagramSpec) => Promise<PositionedDiagram>;

// ACW Track 3 — focus / isolate invariant.
//
// Constitutional contract: clicking a node in the derived
// diagram must not leave the canvas blank for a connected node.
// `isolateAroundNode(nodes, edges, selectedNodeId)` is a total,
// pure transformation; this module-load invariant asserts:
//
//   (a) selectedNodeId === null returns input unchanged.
//   (b) selectedNodeId pointing to a layer-root keeps the root
//       and at least its direct children.
//   (c) selectedNodeId pointing to a leaf with at least one
//       adjacency edge keeps the leaf, the neighbour, and the
//       layer-root parent of each kept leaf.
//   (d) selectedNodeId pointing to a leaf with NO adjacency
//       edges still keeps the leaf and its layer-root (never
//       returns an empty result for a node that exists).
//   (e) the result is stable: same input → same output.
import { isolateAroundNode } from "./track3FocusIsolation";
import type { AcwNode, AcwEdge } from "@/acw/acwLensStructure";

const NODES: readonly AcwNode[] = Object.freeze([
  Object.freeze({
    id: "node:layer:infrastructure",
    type: "Zone" as const,
    parentId: null,
    label: "Infrastructure",
    x: 0,
    y: 0,
  }),
  Object.freeze({
    id: "node:layer:application",
    type: "Zone" as const,
    parentId: null,
    label: "Application",
    x: 0,
    y: 220,
  }),
  Object.freeze({
    id: "node:param:infrastructure:hostingModel:public",
    type: "Component" as const,
    parentId: "node:layer:infrastructure",
    label: "Public hosting",
    x: 0,
    y: 90,
  }),
  Object.freeze({
    id: "node:param:application:runtimeCategory:managed",
    type: "Component" as const,
    parentId: "node:layer:application",
    label: "Managed runtime",
    x: 0,
    y: 310,
  }),
  Object.freeze({
    id: "node:param:application:applicationStyle:microservices",
    type: "Component" as const,
    parentId: "node:layer:application",
    label: "Microservices",
    x: 140,
    y: 310,
  }),
]);

const EDGES: readonly AcwEdge[] = Object.freeze([
  Object.freeze({
    id: "edge:run-host",
    kind: "CONNECTS" as const,
    fromId: "node:param:application:runtimeCategory:managed",
    toId: "node:param:infrastructure:hostingModel:public",
  }),
]);

function assertNullPassthrough(): void {
  const r = isolateAroundNode(NODES, EDGES, null);
  if (r.nodes.length !== NODES.length || r.edges.length !== EDGES.length) {
    throw new Error(
      "ACW Track 3 focus invariant: null selection must return input unchanged.",
    );
  }
}

function assertLayerRootKeepsChildren(): void {
  const r = isolateAroundNode(NODES, EDGES, "node:layer:infrastructure");
  const ids = new Set(r.nodes.map((n) => n.id));
  if (!ids.has("node:layer:infrastructure")) {
    throw new Error(
      "ACW Track 3 focus invariant: selecting a layer root must keep the layer root.",
    );
  }
  if (!ids.has("node:param:infrastructure:hostingModel:public")) {
    throw new Error(
      "ACW Track 3 focus invariant: selecting a layer root must keep its direct children.",
    );
  }
}

function assertLeafKeepsNeighbourAndParent(): void {
  const r = isolateAroundNode(
    NODES,
    EDGES,
    "node:param:application:runtimeCategory:managed",
  );
  const ids = new Set(r.nodes.map((n) => n.id));
  if (!ids.has("node:param:application:runtimeCategory:managed")) {
    throw new Error(
      "ACW Track 3 focus invariant: leaf selection must keep the selected leaf.",
    );
  }
  if (!ids.has("node:param:infrastructure:hostingModel:public")) {
    throw new Error(
      "ACW Track 3 focus invariant: leaf selection must keep one-hop adjacency neighbours.",
    );
  }
  if (
    !ids.has("node:layer:infrastructure") ||
    !ids.has("node:layer:application")
  ) {
    throw new Error(
      "ACW Track 3 focus invariant: leaf selection must keep the layer-root parent of every kept node.",
    );
  }
}

function assertDisconnectedLeafStillRenders(): void {
  // microservices has no edges in this fixture.
  const r = isolateAroundNode(
    NODES,
    EDGES,
    "node:param:application:applicationStyle:microservices",
  );
  const ids = new Set(r.nodes.map((n) => n.id));
  if (r.nodes.length === 0) {
    throw new Error(
      "ACW Track 3 focus invariant: clicking a disconnected leaf must NOT produce an empty canvas.",
    );
  }
  if (!ids.has("node:param:application:applicationStyle:microservices")) {
    throw new Error(
      "ACW Track 3 focus invariant: disconnected-leaf selection must still keep the selected leaf.",
    );
  }
  if (!ids.has("node:layer:application")) {
    throw new Error(
      "ACW Track 3 focus invariant: disconnected-leaf selection must still keep its parent layer root.",
    );
  }
}

function assertDeterministic(): void {
  const a = isolateAroundNode(
    NODES,
    EDGES,
    "node:param:application:runtimeCategory:managed",
  );
  const b = isolateAroundNode(
    NODES,
    EDGES,
    "node:param:application:runtimeCategory:managed",
  );
  if (
    a.nodes.length !== b.nodes.length ||
    a.edges.length !== b.edges.length
  ) {
    throw new Error(
      "ACW Track 3 focus invariant: isolateAroundNode is non-deterministic.",
    );
  }
  for (let i = 0; i < a.nodes.length; i++) {
    if (a.nodes[i].id !== b.nodes[i].id) {
      throw new Error(
        "ACW Track 3 focus invariant: isolateAroundNode produced different node order on repeat.",
      );
    }
  }
}

assertNullPassthrough();
assertLayerRootKeepsChildren();
assertLeafKeepsNeighbourAndParent();
assertDisconnectedLeafStillRenders();
assertDeterministic();

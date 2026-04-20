// ACW v3 — structural-identity invariants for the 3D renderer.
//
// Constitutional guarantee: the 3D canvas renders the SAME nodes
// and edges as the 2D canvas at every lens depth. The mechanism is
// a single shared enumerator (`enumerateLensVisibility`) that both
// renderers consume. This module proves at bundle load:
//
//   (A) The enumerator behaves correctly: it returns only nodes
//       reachable from the focused parent under the lens's
//       collapse rules, and only edges between visible endpoints.
//
//   (B) Both renderers actually consume the enumerator. We
//       source-scan `InteractiveCanvas2D.tsx` and
//       `Canvas3DStructural.tsx` and assert each imports the
//       helper. A future regression that bypasses the helper
//       fails the build immediately.
//
//   (C) Neither renderer reads the canonical workspace directly.
//       Their structural surface is the props passed by their
//       host lens (or by `LensCanvas`) — they do not call
//       `useAcwWorkspace()` themselves. This guarantees that the
//       LensCanvas wrapper hands the same `(nodes, edges,
//       focusedParentId)` triple to each branch.
//
// File suffix `.test-shape.ts` follows the established
// negative-shape convention. Importing this module runs the
// assertions; removing the import (and this file) restores the
// pre-v3 behaviour with no other change required.
import {
  enumerateLensVisibility,
  type LensVisibility,
} from "./acwLensStructure";
import type { AcwNode, AcwEdge } from "./acwStore";

const PREFIX = "ACW v3 structural identity invariant violation";

const RENDERER_SOURCES = import.meta.glob<string>(
  [
    "/src/components/acw/InteractiveCanvas2D.tsx",
    "/src/components/acw/Canvas3DStructural.tsx",
  ],
  { eager: true, query: "?raw", import: "default" },
);

// (A) Enumerator behavioural probe. Build a small Zone > ComputeNode
// > System > Component fixture and assert visibility at each depth.
function n(
  id: string,
  type: AcwNode["type"],
  parentId: string | null,
  x = 0,
  y = 0,
): AcwNode {
  return Object.freeze({ id, type, parentId, label: id, x, y });
}
function e(id: string, fromId: string, toId: string): AcwEdge {
  return Object.freeze({ id, kind: "CONNECTS", fromId, toId });
}
const nodes: readonly AcwNode[] = Object.freeze([
  n("z1", "Zone", null),
  n("cn1", "ComputeNode", "z1"),
  n("cn2", "ComputeNode", "z1"),
  n("sys1", "System", "cn1"),
  n("comp1", "Component", "sys1"),
]);
const edges: readonly AcwEdge[] = Object.freeze([
  e("e1", "cn1", "cn2"),
  // dangling endpoint must NOT be returned at any depth
  e("e2", "cn1", "ghost"),
]);

function assertEq<T>(actual: T, expected: T, what: string): void {
  const a = JSON.stringify(actual);
  const ex = JSON.stringify(expected);
  if (a !== ex) {
    throw new Error(`${PREFIX}: ${what}: expected ${ex}, got ${a}.`);
  }
}

function ids(v: LensVisibility): string[] {
  return [...v.visibleNodeIds].sort();
}

{
  // Root depth, nothing collapsed: only the Zone is a direct sibling.
  // Its child ComputeNodes appear because the Zone is uncollapsed.
  const v = enumerateLensVisibility(nodes, edges, null, new Set());
  assertEq(ids(v), ["cn1", "cn2", "z1"], "root depth visible ids");
  assertEq(
    v.visibleEdges.map((x) => x.id),
    ["e1"],
    "root depth visible edges (dangling dropped)",
  );
}
{
  // Root depth, Zone collapsed: only Zone is visible; its children
  // are hidden, so the cn1↔cn2 edge is also dropped.
  const v = enumerateLensVisibility(nodes, edges, null, new Set(["z1"]));
  assertEq(ids(v), ["z1"], "collapsed root visible ids");
  assertEq(v.visibleEdges.length, 0, "collapsed root visible edges");
}
{
  // Drill into the Zone: ComputeNodes at focus, System visible
  // because cn1 is uncollapsed.
  const v = enumerateLensVisibility(nodes, edges, "z1", new Set());
  assertEq(ids(v), ["cn1", "cn2", "sys1"], "zone-focus visible ids");
}
{
  // Drill into ComputeNode: System at focus, Component visible.
  const v = enumerateLensVisibility(nodes, edges, "cn1", new Set());
  assertEq(ids(v), ["comp1", "sys1"], "computenode-focus visible ids");
}
{
  // Drill into System: Component at focus, no further depth.
  const v = enumerateLensVisibility(nodes, edges, "sys1", new Set());
  assertEq(ids(v), ["comp1"], "system-focus visible ids");
}

// Strip block comments and line comments so documentation that
// merely NAMES the required identifiers (or the forbidden one)
// cannot satisfy — or trip — the source-scan gates. The line
// comment regex preserves URL fragments like `https://` by
// requiring the preceding character to be either start-of-string
// or non-colon.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// (B) Both renderers must import the shared helper AND actually
// call the enumerator at least once. Comments are stripped first
// so banner documentation (which deliberately names the helper)
// cannot satisfy the gate by accident.
const REQUIRED_IMPORT_SUBSTRING = "acwLensStructure";
const REQUIRED_CALL_SUBSTRING = "enumerateLensVisibility(";
for (const [path, rawSource] of Object.entries(RENDERER_SOURCES)) {
  const source = stripComments(rawSource);
  if (!source.includes(REQUIRED_IMPORT_SUBSTRING)) {
    throw new Error(
      `${PREFIX}: renderer "${path}" does not import the shared structural enumerator (${REQUIRED_IMPORT_SUBSTRING}) outside comments. Both 2D and 3D renderers must consume the same source so they cannot diverge.`,
    );
  }
  // The trailing "(" guarantees an actual call site rather than a
  // re-export, type alias, or comment reference.
  if (!source.includes(REQUIRED_CALL_SUBSTRING)) {
    throw new Error(
      `${PREFIX}: renderer "${path}" imports the helper module but never calls ${REQUIRED_CALL_SUBSTRING.slice(0, -1)}() outside comments. The structural-identity guarantee requires actual consumption, not documentation.`,
    );
  }
}

// (C) Neither renderer may read the canonical workspace directly.
// Their structural surface is the props handed in by the host lens.
// Match the call site, not a mention; comments stripped first.
const FORBIDDEN_DIRECT_READ = "useAcwWorkspace(";
for (const [path, rawSource] of Object.entries(RENDERER_SOURCES)) {
  const source = stripComments(rawSource);
  if (source.includes(FORBIDDEN_DIRECT_READ)) {
    throw new Error(
      `${PREFIX}: renderer "${path}" reads the workspace directly via ${FORBIDDEN_DIRECT_READ.slice(0, -1)}(). Structural input must arrive as props so the LensCanvas wrapper can guarantee both renderers see the same data.`,
    );
  }
}

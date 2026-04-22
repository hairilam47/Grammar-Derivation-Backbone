// Pure lifecycle helper for the Track3 3D renderer.
//
// Encapsulates the (flat.nodes, prevTargets, exitingIds) →
// (renderEntries, nextPrevTargets, mutated exitingIds) transform
// so it can be unit-tested without mounting react-three-fiber.
//
// Lifecycle:
//   - A node present in `flat.nodes` becomes an "active" entry.
//   - A node previously rendered (prevTargets has it) but now
//     missing from `flat.nodes` becomes an "exiting" entry. It
//     keeps its last-known target with targetOpacity = 0 until
//     the caller invokes `dropExiting` after its mesh has faded
//     out.
//   - A node that returns to `flat.nodes` is removed from the
//     exiting set.
import type { DiagramStratum } from "@workspace/diagramspec";

// Minimal node shape this lifecycle depends on. The renderer's
// concrete FlatNode is structurally compatible.
export interface LifecycleNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly stratum: DiagramStratum;
}

export interface LifecycleEntry<N extends LifecycleNode = LifecycleNode> {
  readonly id: string;
  readonly node: N;
  readonly stratum: DiagramStratum;
  readonly target: readonly [number, number, number];
  readonly previous: readonly [number, number, number] | null;
  readonly targetOpacity: number;
  readonly exiting: boolean;
}

export interface LifecycleResult<N extends LifecycleNode = LifecycleNode> {
  readonly entries: readonly LifecycleEntry<N>[];
  // Caller assigns this to its prevTargets ref.
  readonly nextPrevTargets: ReadonlyMap<string, readonly [number, number, number]>;
}

export interface LifecycleInput<N extends LifecycleNode = LifecycleNode> {
  readonly flatNodes: readonly N[];
  readonly center: { readonly x: number; readonly y: number };
  readonly scale: number;
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly prevTargets: ReadonlyMap<string, readonly [number, number, number]>;
  // MUTATED in place: ids removed from flatNodes are added,
  // ids re-added to flatNodes are removed.
  readonly exitingIds: Set<string>;
  readonly snapshots: Map<string, N>;
}

export function computeRenderEntries<N extends LifecycleNode>(
  input: LifecycleInput<N>,
): LifecycleResult<N> {
  const {
    flatNodes,
    center,
    scale,
    visibleNodeIds,
    prevTargets,
    exitingIds,
    snapshots,
  } = input;

  const flatById = new Map<string, LifecycleNode>(flatNodes.map((n) => [n.id, n]));

  // Step 1: detect removals BEFORE we rewrite prevTargets.
  for (const id of prevTargets.keys()) {
    if (!flatById.has(id)) exitingIds.add(id);
  }
  for (const n of flatNodes) exitingIds.delete(n.id);

  const out: LifecycleEntry<N>[] = [];

  // Step 2: active entries.
  for (const n of flatNodes) {
    const x = (n.x - center.x) * scale;
    const y = -(n.y - center.y) * scale;
    const target: [number, number, number] = [x, y, 0];
    const previous = prevTargets.get(n.id) ?? null;
    out.push({
      id: n.id,
      node: n,
      stratum: n.stratum,
      target,
      previous,
      targetOpacity: visibleNodeIds.has(n.id) ? 1 : 0,
      exiting: false,
    });
  }

  // Step 3: exiting entries.
  for (const id of exitingIds) {
    const lastTarget = prevTargets.get(id);
    const snapshot = snapshots.get(id);
    if (!lastTarget || !snapshot) continue;
    out.push({
      id,
      node: snapshot,
      stratum: snapshot.stratum,
      target: lastTarget,
      previous: lastTarget,
      targetOpacity: 0,
      exiting: true,
    });
  }

  // Step 4: snapshot targets + node geometry.
  const nextPrevTargets = new Map<string, readonly [number, number, number]>();
  for (const e of out) nextPrevTargets.set(e.id, e.target);
  for (const n of flatNodes) snapshots.set(n.id, n);

  return { entries: out, nextPrevTargets };
}

// Drops an exiting id from all lifecycle structures. The caller
// is expected to invoke this from MeshAnimator's onFadedOut
// handler once the mesh's opacity has fallen below the fade-out
// threshold.
export function dropExiting(
  id: string,
  exitingIds: Set<string>,
  prevTargets: Map<string, readonly [number, number, number]>,
  snapshots: Map<string, LifecycleNode>,
): boolean {
  if (!exitingIds.has(id)) return false;
  exitingIds.delete(id);
  prevTargets.delete(id);
  snapshots.delete(id);
  return true;
}

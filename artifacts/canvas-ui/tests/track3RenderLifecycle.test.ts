// Regression test for the Track3 3D renderer's entry-lifecycle.
//
// Documents and pins the exact sequence:
//   present → removed → fades below threshold → onFadedOut →
//   next render no entry for that id.
//
// This is the bug Architect REJECT-2 identified: removed-node
// fade-out was broken because removal detection ran AFTER
// prevTargetsRef was overwritten. The pure helper now detects
// removals before the snapshot rewrite, and `dropExiting`
// guarantees garbage collection on next pass.
import { describe, expect, it } from "vitest";
import {
  computeRenderEntries,
  dropExiting,
  type LifecycleNode,
} from "@/acw/track3/track3RenderLifecycle";

interface TestNode extends LifecycleNode {
  readonly label: string;
}

const A: TestNode = {
  id: "a",
  x: 0,
  y: 0,
  stratum: "application",
  label: "A",
};
const B: TestNode = {
  id: "b",
  x: 10,
  y: 0,
  stratum: "application",
  label: "B",
};
const VISIBLE = new Set<string>(["a", "b"]);

describe("track3RenderLifecycle — fade-out lifecycle", () => {
  it("present → removed → faded → next render drops the entry", () => {
    const prev = new Map<string, readonly [number, number, number]>();
    const exiting = new Set<string>();
    const snapshots = new Map<string, TestNode>();

    // Pass 1: A and B both present → both active.
    const r1 = computeRenderEntries({
      flatNodes: [A, B],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: VISIBLE,
      prevTargets: prev,
      exitingIds: exiting,
      snapshots,
    });
    // Caller would assign nextPrevTargets to the ref.
    const prev2 = new Map(r1.nextPrevTargets);
    expect(r1.entries.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(r1.entries.every((e) => !e.exiting)).toBe(true);
    expect(exiting.size).toBe(0);

    // Pass 2: B disappears from flat.nodes → B becomes exiting,
    // emitted with targetOpacity = 0.
    const r2 = computeRenderEntries({
      flatNodes: [A],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: VISIBLE,
      prevTargets: prev2,
      exitingIds: exiting,
      snapshots,
    });
    const prev3 = new Map(r2.nextPrevTargets);
    expect(r2.entries.map((e) => e.id).sort()).toEqual(["a", "b"]);
    const bEntry = r2.entries.find((e) => e.id === "b");
    expect(bEntry?.exiting).toBe(true);
    expect(bEntry?.targetOpacity).toBe(0);
    expect(exiting.has("b")).toBe(true);

    // Pass 3 (re-run before fade completes): B is still exiting.
    const r3 = computeRenderEntries({
      flatNodes: [A],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: VISIBLE,
      prevTargets: prev3,
      exitingIds: exiting,
      snapshots,
    });
    const prev4 = new Map(r3.nextPrevTargets);
    expect(r3.entries.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(exiting.has("b")).toBe(true);

    // Mesh fully fades out → MeshAnimator fires onFadedOut("b").
    const dropped = dropExiting("b", exiting, prev4, snapshots);
    expect(dropped).toBe(true);
    expect(exiting.has("b")).toBe(false);
    expect(prev4.has("b")).toBe(false);
    expect(snapshots.has("b")).toBe(false);

    // Pass 4: B is no longer emitted.
    const r4 = computeRenderEntries({
      flatNodes: [A],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: VISIBLE,
      prevTargets: prev4,
      exitingIds: exiting,
      snapshots,
    });
    expect(r4.entries.map((e) => e.id)).toEqual(["a"]);
    expect(exiting.size).toBe(0);
  });

  it("re-adding a node before fade completes cancels the exit", () => {
    const prev = new Map<string, readonly [number, number, number]>();
    const exiting = new Set<string>();
    const snapshots = new Map<string, TestNode>();

    // Present.
    const r1 = computeRenderEntries({
      flatNodes: [A, B],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: VISIBLE,
      prevTargets: prev,
      exitingIds: exiting,
      snapshots,
    });
    const p2 = new Map(r1.nextPrevTargets);

    // Removed.
    const r2 = computeRenderEntries({
      flatNodes: [A],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: VISIBLE,
      prevTargets: p2,
      exitingIds: exiting,
      snapshots,
    });
    const p3 = new Map(r2.nextPrevTargets);
    expect(exiting.has("b")).toBe(true);

    // Re-added before fade completes.
    const r3 = computeRenderEntries({
      flatNodes: [A, B],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: VISIBLE,
      prevTargets: p3,
      exitingIds: exiting,
      snapshots,
    });
    expect(exiting.has("b")).toBe(false);
    const bEntry = r3.entries.find((e) => e.id === "b");
    expect(bEntry?.exiting).toBe(false);
    expect(bEntry?.targetOpacity).toBe(1);
  });

  it("last node in stratum removed → exiting entry retains its stratum so the renderer can keep its group alive", () => {
    const prev = new Map<string, readonly [number, number, number]>();
    const exiting = new Set<string>();
    const snapshots = new Map<string, TestNode>();
    const SOLO: TestNode = {
      id: "solo",
      x: 0,
      y: 0,
      stratum: "technology",
      label: "Solo",
    };

    // Pass 1: solo present in technology stratum.
    const r1 = computeRenderEntries({
      flatNodes: [SOLO],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: new Set<string>(["solo"]),
      prevTargets: prev,
      exitingIds: exiting,
      snapshots,
    });
    const p2 = new Map(r1.nextPrevTargets);

    // Pass 2: technology stratum disappears entirely (no nodes).
    // The exiting entry MUST retain its original stratum so the
    // renderer can derive the union of strata and keep the
    // technology-stratum group alive for fade-out.
    const r2 = computeRenderEntries({
      flatNodes: [],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: new Set<string>(),
      prevTargets: p2,
      exitingIds: exiting,
      snapshots,
    });
    const exitingEntry = r2.entries.find((e) => e.id === "solo");
    expect(exitingEntry?.exiting).toBe(true);
    expect(exitingEntry?.stratum).toBe("technology");
    expect(exitingEntry?.targetOpacity).toBe(0);
  });

  it("hidden-but-still-present node has targetOpacity=0 without becoming exiting", () => {
    const prev = new Map<string, readonly [number, number, number]>();
    const exiting = new Set<string>();
    const snapshots = new Map<string, TestNode>();
    const onlyA = new Set<string>(["a"]); // B hidden by visibility filter

    const r = computeRenderEntries({
      flatNodes: [A, B],
      center: { x: 0, y: 0 },
      scale: 1,
      visibleNodeIds: onlyA,
      prevTargets: prev,
      exitingIds: exiting,
      snapshots,
    });
    const bEntry = r.entries.find((e) => e.id === "b");
    expect(bEntry?.exiting).toBe(false);
    expect(bEntry?.targetOpacity).toBe(0);
    // Layer toggle must NEVER drag a node into the exiting set.
    expect(exiting.size).toBe(0);
  });
});

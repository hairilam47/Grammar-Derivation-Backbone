// ACW Phase 5 — bound-binding rendering coverage.
//
// Two complementary checks:
//
//   1. A static-source probe over `InteractiveCanvas2D.tsx` that
//      asserts the renderer reads `resolveLabel` and `resolveIcon`
//      from the semantic helpers (i.e. node visuals are NOT
//      hard-bound to `n.label` any more). This catches a future
//      refactor that accidentally re-introduces `n.label` as the
//      sole label source.
//
//   2. A behavioural check that the data flow exercised by the
//      AuthoringPanel dropdown — `updateNodeBinding` followed by
//      `resolveLabel(node)` — actually swaps the displayed label.
//      This is the "swap effect" the architect asked us to cover.
//
// The probes never touch CTAD state, so we use a registry param
// known to exist (`containerOrchestration` lives in the `ops`
// section), select two of its options, and assert the resolved
// label flips accordingly.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  clearWorkspace,
  createNode,
  getWorkspace,
  updateNodeBinding,
} from "../src/acw/acwStore";
import { resolveLabel, resolveIcon } from "../src/acw/semantic/techNodeBinding";
import { findParam } from "../src/ctad/ctadRegistry";

const CANVAS_2D_SRC = resolve(
  import.meta.dirname,
  "..",
  "src",
  "components",
  "acw",
  "InteractiveCanvas2D.tsx",
);

describe("ACW Phase 5 — canvas renderer reads semantic helpers", () => {
  it("InteractiveCanvas2D.tsx imports and calls resolveLabel + resolveIcon", () => {
    const src = readFileSync(CANVAS_2D_SRC, "utf-8");
    expect(src).toMatch(
      /from\s+["']@\/acw\/semantic\/techNodeBinding["']/,
    );
    // The renderer must call BOTH helpers; resolveLabel for the
    // node text, resolveIcon for the small corner glyph.
    expect(src).toMatch(/resolveLabel\s*\(/);
    expect(src).toMatch(/resolveIcon\s*\(/);
    // And the renderer must NOT contain the pre-Phase-5 line that
    // hard-bound the lower text node to `n.label`. We check for
    // the exact prior literal so a deliberate use of `.label` as
    // a fallback inside the helper layer is unaffected.
    expect(src).not.toMatch(/^\s*\{n\.label\}\s*$/m);
  });
});

describe("ACW Phase 5 — bound option swap updates resolveLabel", () => {
  it("updateNodeBinding(optionValue) flips what resolveLabel returns", () => {
    // Confirm the registry param we rely on still exists with at
    // least two options; otherwise the probe is meaningless.
    const param = findParam("containerOrchestration");
    expect(param).toBeDefined();
    expect((param!.options as readonly string[]).length).toBeGreaterThanOrEqual(2);
    const [optA, optB] = param!.options;

    clearWorkspace();
    const created = createNode({
      type: "Zone",
      parentId: null,
      label: "fallback-label",
      x: 0,
      y: 0,
      boundParam: { sectionId: "ops", paramId: "containerOrchestration", optionValue: optA },
      boundTechnologyCategory: "Container orchestrator",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const nodeId = created.id;

    // Initial render: bound option A, so the resolved label is A
    // (NOT the node's plain `label`).
    const ws1 = getWorkspace();
    const n1 = ws1.structureGraph.nodes.find((n) => n.id === nodeId)!;
    expect(resolveLabel(n1)).toBe(optA);
    // Icon resolves from the technology category — it must exist
    // for a recognised category.
    expect(resolveIcon(n1)).toBeDefined();

    // Swap: change the bound option to B via the public mutator.
    const upd = updateNodeBinding(nodeId, {
      boundParam: { sectionId: "ops", paramId: "containerOrchestration", optionValue: optB },
    });
    expect(upd.ok).toBe(true);

    const ws2 = getWorkspace();
    const n2 = ws2.structureGraph.nodes.find((n) => n.id === nodeId)!;
    expect(resolveLabel(n2)).toBe(optB);

    // Clear: optionValue: null falls back to the node's own label.
    const cleared = updateNodeBinding(nodeId, {
      boundParam: { sectionId: "ops", paramId: "containerOrchestration", optionValue: null },
    });
    expect(cleared.ok).toBe(true);
    const ws3 = getWorkspace();
    const n3 = ws3.structureGraph.nodes.find((n) => n.id === nodeId)!;
    expect(resolveLabel(n3)).toBe("fallback-label");
  });
});

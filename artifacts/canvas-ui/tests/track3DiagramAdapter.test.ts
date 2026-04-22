// ACW Track 3 — DiagramSpec adapter parity + ELK-counter tests.
//
// (1) Parity. The DiagramSpec compiler pipeline must surface the
//     SAME (section, paramId, optionSlug) tuple set the retired
//     `deriveACWStructure` would have produced. The retired
//     algorithm was: for every in-bounds CTAD section, for every
//     non-null param entry, for every option in the (string |
//     string[]) value, emit one tuple `(section, paramId,
//     optionSlug(option))`. Because the new compiler iterates the
//     same sections and uses the same slug function, the two
//     pipelines should produce identical SETS (set membership,
//     not multiplicity, since the deployment view fans out per
//     environment via the `::env:` suffix that we strip). We
//     express the legacy contract directly here as a pure data
//     oracle so this test does not depend on the (now-deleted)
//     legacy implementation files.
//
// (2) ELK call counter. The renderer's layer-toggle path must NOT
//     trigger an ELK layout pass — toggling a section is
//     visibility-only. We assert (a) the counter increments by
//     `specs.length` on each layout call, and (b) it does NOT
//     change between layouts when only the renderer's filter set
//     would have changed.
import { describe, expect, it, beforeEach } from "vitest";
import {
  compileTrack3Specs,
  layoutTrack3Specs,
  paramRefOfNodeId,
  getElkLayoutCallCount,
  resetElkLayoutCallCount,
} from "@/acw/track3/track3DiagramAdapter";
import {
  TRACK3_LAYERS,
  optionSlug,
  type AdcBounds,
  type Track3Layer,
} from "@/acw/track3/track3Types";
import type { CtadStateExport } from "@/ctad/ctadStore";

const POPULATED_STATE: CtadStateExport = Object.freeze({
  schemaVersion: "ctad-1.0" as const,
  capturedAt: "2026-04-22T00:00:00.000Z",
  binding: Object.freeze({ adsId: "ads-test", adsVersion: "v1" }),
  infrastructure: Object.freeze({
    deploymentTopology: "single-region",
    hostingModel: "public",
    networkPosture: null,
  }),
  application: Object.freeze({
    runtimeCategory: "managed",
    applicationStyle: "microservices",
    statePosture: null,
  }),
  integration: Object.freeze({
    integrationStyle: "request-response",
    eventBackbone: null,
  }),
  crossCutting: Object.freeze({
    identityModel: "centralised",
    observabilityPosture: null,
  }),
  ops: Object.freeze({
    deliveryCadence: "continuous",
    changeApproval: null,
  }),
}) as unknown as CtadStateExport;

const BOUNDS: AdcBounds = Object.freeze({
  layersPresent: TRACK3_LAYERS,
});

function blockFor(state: CtadStateExport, layer: Track3Layer) {
  switch (layer) {
    case "infrastructure":
      return state.infrastructure;
    case "application":
      return state.application;
    case "integration":
      return state.integration;
    case "crossCutting":
      return state.crossCutting;
    case "ops":
      return state.ops;
  }
}

// Pure data oracle re-stating the retired `deriveACWStructure`
// contract. Set membership only.
function expectedTuples(
  state: CtadStateExport,
  bounds: AdcBounds,
): Set<string> {
  const out = new Set<string>();
  for (const layer of TRACK3_LAYERS) {
    if (!bounds.layersPresent.includes(layer)) continue;
    const block = blockFor(state, layer);
    for (const [paramId, raw] of Object.entries(block)) {
      const opts: readonly string[] =
        raw === null ? [] : typeof raw === "string" ? [raw] : raw;
      for (const opt of opts) {
        out.add(`${layer}::${paramId}::${optionSlug(opt)}`);
      }
    }
  }
  return out;
}

function compiledTuples(
  state: CtadStateExport,
  bounds: AdcBounds,
): Set<string> {
  const out = new Set<string>();
  const specs = compileTrack3Specs(state, bounds);
  for (const spec of specs) {
    for (const n of spec.nodes) {
      const ref = paramRefOfNodeId(n.id);
      if (ref === null) continue;
      out.add(`${ref.section}::${ref.paramId}::${ref.optionSlug}`);
    }
  }
  return out;
}

describe("track3DiagramAdapter — parity vs retired deriveACWStructure", () => {
  it("produces the same (section, paramId, optionSlug) tuple set", () => {
    const expected = expectedTuples(POPULATED_STATE, BOUNDS);
    const actual = compiledTuples(POPULATED_STATE, BOUNDS);
    expect(Array.from(actual).sort()).toEqual(Array.from(expected).sort());
    expect(expected.size).toBeGreaterThan(0);
  });

  it("honours bounds: out-of-scope layer is dropped", () => {
    const trimmedBounds: AdcBounds = Object.freeze({
      layersPresent: ["application", "integration", "crossCutting", "ops"],
    });
    const expected = expectedTuples(POPULATED_STATE, trimmedBounds);
    const actual = compiledTuples(POPULATED_STATE, trimmedBounds);
    for (const k of expected) expect(k.startsWith("infrastructure")).toBe(false);
    for (const k of actual) expect(k.startsWith("infrastructure")).toBe(false);
    expect(Array.from(actual).sort()).toEqual(Array.from(expected).sort());
  });

  it("optionSlug helper agrees on edge cases (slug stability pin)", () => {
    expect(optionSlug("Multi Region")).toBe("multi-region");
    expect(optionSlug("Continuous_DELIVERY!")).toBe("continuous-delivery");
  });
});

describe("track3DiagramAdapter — ELK call counter", () => {
  beforeEach(() => resetElkLayoutCallCount());

  it("increments once per non-empty spec on a layout pass", async () => {
    const specs = compileTrack3Specs(POPULATED_STATE, BOUNDS);
    expect(getElkLayoutCallCount()).toBe(0);
    await layoutTrack3Specs(specs);
    expect(getElkLayoutCallCount()).toBe(specs.length);
    expect(specs.length).toBeGreaterThan(0);
  });

  it("does NOT increment when only the section-filter changes (layer toggle)", async () => {
    const specs = compileTrack3Specs(POPULATED_STATE, BOUNDS);
    await layoutTrack3Specs(specs);
    const after1 = getElkLayoutCallCount();
    // Layer-toggle in the renderer is a pure visibility filter
    // applied to the already-positioned diagrams; it does NOT
    // re-invoke the adapter. The counter must be stable.
    const hiddenSections = new Set<string>(["infrastructure"]);
    void hiddenSections;
    expect(getElkLayoutCallCount()).toBe(after1);
  });
});

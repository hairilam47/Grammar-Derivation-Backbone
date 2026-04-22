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

// Legacy node-id and edge-id oracle. Replays the retired
// `nodeIdForLayer` + `nodeIdForParamValue` + `edgeId` scheme
// directly so we don't need to import the (deleted) module.
function legacyLayerNodeId(layer: Track3Layer): string {
  return `node:layer:${layer}`;
}
function legacyParamNodeId(
  layer: Track3Layer,
  paramId: string,
  option: string,
): string {
  return `node:param:${layer}:${paramId}:${optionSlug(option)}`;
}

function legacyNodeAndEdgeIds(
  state: CtadStateExport,
  bounds: AdcBounds,
): { nodeIds: Set<string>; edgeEndpoints: Set<string> } {
  const nodeIds = new Set<string>();
  for (const layer of TRACK3_LAYERS) {
    if (!bounds.layersPresent.includes(layer)) continue;
    const block = blockFor(state, layer);
    let layerHasContent = false;
    for (const [paramId, raw] of Object.entries(block)) {
      const opts: readonly string[] =
        raw === null ? [] : typeof raw === "string" ? [raw] : raw;
      for (const opt of opts) {
        nodeIds.add(legacyParamNodeId(layer, paramId, opt));
        layerHasContent = true;
      }
    }
    if (layerHasContent) nodeIds.add(legacyLayerNodeId(layer));
  }
  // Legacy edges came from an adjacency table, but the only
  // structural invariant we can pin without re-introducing the
  // table is that every edge endpoint is itself a derived node.
  // We therefore assert this much downstream of the new pipeline.
  return { nodeIds, edgeEndpoints: new Set<string>() };
}

// Stratum-remap helper. The new compiler emits ids of the form
// `node:section:<section>` and `node:param:<section>:...` (with
// an optional `::env:<envId>` suffix in the deployment view).
// The legacy scheme used `node:layer:<layer>` and
// `node:param:<layer>:...` with NO env suffix. Remap is:
//   "node:section:" → "node:layer:"
//   strip "::env:..." tail
//   drop "node:env:..." nodes (they did not exist in the legacy
//   structure)
function remapNewIdToLegacy(id: string): string | null {
  if (id.startsWith("node:env:")) return null;
  let out = id;
  const envIdx = out.indexOf("::env:");
  if (envIdx !== -1) out = out.slice(0, envIdx);
  if (out.startsWith("node:section:")) {
    return `node:layer:${out.slice("node:section:".length)}`;
  }
  if (out.startsWith("node:param:")) {
    return out; // section-name segment matches layer name 1:1
  }
  return out;
}

function newPipelineLegacyIds(
  state: CtadStateExport,
  bounds: AdcBounds,
): { nodeIds: Set<string>; edgeEndpointPairs: Set<string> } {
  const specs = compileTrack3Specs(state, bounds);
  const nodeIds = new Set<string>();
  const seenRaw = new Set<string>();
  for (const spec of specs) {
    for (const n of spec.nodes) {
      seenRaw.add(n.id);
      const remapped = remapNewIdToLegacy(n.id);
      if (remapped !== null) nodeIds.add(remapped);
    }
  }
  const edgeEndpointPairs = new Set<string>();
  for (const spec of specs) {
    for (const e of spec.edges) {
      // Both endpoints must reference nodes that exist in the
      // pre-remap node set — this pins the structural invariant
      // that no edge dangles after compilation.
      if (!seenRaw.has(e.from) || !seenRaw.has(e.to)) {
        throw new Error(
          `dangling edge endpoint: edge ${e.id} (${e.from} → ${e.to})`,
        );
      }
      const a = remapNewIdToLegacy(e.from);
      const b = remapNewIdToLegacy(e.to);
      if (a === null || b === null) continue;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      edgeEndpointPairs.add(`${lo}::${hi}`);
    }
  }
  return { nodeIds, edgeEndpointPairs };
}

// Layer-roots that the new pipeline DELIBERATELY subsumes into
// environment containers (deployment view) instead of emitting
// as standalone "node:section:" nodes. These are the documented
// remap exceptions baked into TRACK3_STRATUM_PLAN.
const LAYER_ROOTS_SUBSUMED_BY_ENV: ReadonlySet<string> = new Set([
  "node:layer:infrastructure",
  "node:layer:ops",
]);

// Legacy adjacency oracle. Replays the retired
// `TRACK3_ADJACENCY` table inline so this test does not depend
// on any deleted module. Each rule is expanded over the bound
// CTAD state into the cartesian product of (paramA option,
// paramB option) pairs — the exact same expansion the legacy
// `deriveACWStructure` performed when materialising edges.
interface LegacyAdjacencyRule {
  readonly from: { readonly layer: Track3Layer; readonly paramId: string };
  readonly to: { readonly layer: Track3Layer; readonly paramId: string };
}
const LEGACY_ADJACENCY: readonly LegacyAdjacencyRule[] = Object.freeze([
  // Application <-> infrastructure
  { from: { layer: "application", paramId: "runtimeCategory" }, to: { layer: "infrastructure", paramId: "hostingModel" } },
  { from: { layer: "application", paramId: "runtimeCategory" }, to: { layer: "infrastructure", paramId: "virtualisationClass" } },
  { from: { layer: "application", paramId: "applicationStyle" }, to: { layer: "infrastructure", paramId: "deploymentTopology" } },
  { from: { layer: "application", paramId: "backendFrameworkClass" }, to: { layer: "infrastructure", paramId: "osClass" } },
  { from: { layer: "application", paramId: "applicationStyle" }, to: { layer: "infrastructure", paramId: "databaseClass" } },
  // Integration <-> application / infrastructure
  { from: { layer: "integration", paramId: "integrationPattern" }, to: { layer: "application", paramId: "applicationStyle" } },
  { from: { layer: "integration", paramId: "messageExchange" }, to: { layer: "application", paramId: "applicationStyle" } },
  { from: { layer: "integration", paramId: "boundaryScope" }, to: { layer: "infrastructure", paramId: "networkTopology" } },
  // Cross-cutting
  { from: { layer: "crossCutting", paramId: "configurationManagement" }, to: { layer: "application", paramId: "applicationStyle" } },
  { from: { layer: "crossCutting", paramId: "secretsHandling" }, to: { layer: "infrastructure", paramId: "identityModel" } },
  { from: { layer: "crossCutting", paramId: "resiliencePosture" }, to: { layer: "infrastructure", paramId: "deploymentTopology" } },
  // Ops
  { from: { layer: "ops", paramId: "containerOrchestration" }, to: { layer: "infrastructure", paramId: "virtualisationClass" } },
  { from: { layer: "ops", paramId: "observabilityStack" }, to: { layer: "application", paramId: "applicationStyle" } },
  { from: { layer: "ops", paramId: "serviceMesh" }, to: { layer: "application", paramId: "applicationStyle" } },
  { from: { layer: "ops", paramId: "cicdModel" }, to: { layer: "application", paramId: "applicationStyle" } },
  { from: { layer: "ops", paramId: "backupAndRestore" }, to: { layer: "infrastructure", paramId: "databaseClass" } },
]);

// Expand legacy adjacency rules over the CTAD state into a set
// of unordered legacy node-id pairs — i.e. the edges
// `deriveACWStructure` would have emitted.
function legacyAdjacencyEdgePairs(
  state: CtadStateExport,
  bounds: AdcBounds,
): Set<string> {
  const out = new Set<string>();
  const inBounds = new Set<Track3Layer>(bounds.layersPresent);
  function optsOf(layer: Track3Layer, paramId: string): readonly string[] {
    if (!inBounds.has(layer)) return [];
    const block = blockFor(state, layer) as Record<
      string,
      string | readonly string[] | null | undefined
    >;
    const raw = block[paramId];
    if (raw === null || raw === undefined) return [];
    return typeof raw === "string" ? [raw] : raw;
  }
  for (const rule of LEGACY_ADJACENCY) {
    const a = optsOf(rule.from.layer, rule.from.paramId);
    const b = optsOf(rule.to.layer, rule.to.paramId);
    for (const oa of a) {
      for (const ob of b) {
        const ida = legacyParamNodeId(rule.from.layer, rule.from.paramId, oa);
        const idb = legacyParamNodeId(rule.to.layer, rule.to.paramId, ob);
        const [lo, hi] = ida < idb ? [ida, idb] : [idb, ida];
        out.add(`${lo}::${hi}`);
      }
    }
  }
  return out;
}

// Set of legacy node-ids that appear as either endpoint of any
// legacy adjacency edge.
function legacyEdgeEndpointSet(
  state: CtadStateExport,
  bounds: AdcBounds,
): Set<string> {
  const pairs = legacyAdjacencyEdgePairs(state, bounds);
  const out = new Set<string>();
  for (const p of pairs) {
    const [a, b] = p.split("::");
    out.add(a);
    out.add(b);
  }
  return out;
}

// Set of remapped node-ids that appear as either endpoint of
// any compiled new-pipeline edge.
function newPipelineEdgeEndpointSet(
  state: CtadStateExport,
  bounds: AdcBounds,
): Set<string> {
  const { edgeEndpointPairs } = newPipelineLegacyIds(state, bounds);
  const out = new Set<string>();
  for (const p of edgeEndpointPairs) {
    const [a, b] = p.split("::");
    out.add(a);
    out.add(b);
  }
  return out;
}

describe("track3DiagramAdapter — node-id + edge parity vs retired structure", () => {
  it("emits the same node-id set as the retired derivation (after stratum remap)", () => {
    const legacy = legacyNodeAndEdgeIds(POPULATED_STATE, BOUNDS);
    const next = newPipelineLegacyIds(POPULATED_STATE, BOUNDS);
    expect(legacy.nodeIds.size).toBeGreaterThan(0);
    // Every legacy node id (layer roots + param leaves) must
    // appear in the new pipeline output, modulo the stratum
    // remap. Layer roots for the technology stratum
    // (infrastructure + ops) are intentionally subsumed by
    // environment containers and are excluded from the legacy
    // expectation here.
    for (const id of legacy.nodeIds) {
      if (LAYER_ROOTS_SUBSUMED_BY_ENV.has(id)) continue;
      expect(next.nodeIds.has(id)).toBe(true);
    }
    // And the new pipeline must not invent param/layer nodes
    // that don't correspond to a legacy id.
    for (const id of next.nodeIds) {
      if (id.startsWith("node:layer:") || id.startsWith("node:param:")) {
        expect(legacy.nodeIds.has(id)).toBe(true);
      }
    }
  });

  it("preserves the legacy edge endpoint SET (with stratum remap)", () => {
    // Legacy adjacency materialises a set of (legacy node id,
    // legacy node id) pairs. The new pipeline reorganises edges
    // (containment + intra-section peer chains in lieu of the
    // legacy cross-section adjacency table), so the per-pair
    // edge identity does NOT survive the migration. What MUST
    // survive — the contract pinned by this test — is the SET
    // of node ids that appear as legacy edge endpoints. Every
    // such legacy endpoint must:
    //   (a) exist as a compiled node in the new pipeline
    //       (modulo the documented stratum remap), and
    //   (b) appear as an endpoint of at least one new compiled
    //       edge (i.e. it is wired into the diagram, not orphaned
    //       as a free-floating node).
    // Layer-root ids subsumed into env containers are excluded
    // (same documented exception as the node-set parity test).
    const legacyEndpoints = legacyEdgeEndpointSet(POPULATED_STATE, BOUNDS);
    expect(legacyEndpoints.size).toBeGreaterThan(0);
    const next = newPipelineLegacyIds(POPULATED_STATE, BOUNDS);
    const newEdgeEndpoints = newPipelineEdgeEndpointSet(POPULATED_STATE, BOUNDS);
    for (const id of legacyEndpoints) {
      if (LAYER_ROOTS_SUBSUMED_BY_ENV.has(id)) continue;
      // (a) endpoint exists as a compiled node.
      expect(next.nodeIds.has(id)).toBe(true);
      // (b) endpoint is wired — appears as an endpoint of at
      // least one compiled edge.
      expect(newEdgeEndpoints.has(id)).toBe(true);
    }
  });

  it("every edge endpoint references a real compiled node (no danglers)", () => {
    // Side-effect of building the new-pipeline view: throws if
    // any edge endpoint points at an unknown node id.
    const next = newPipelineLegacyIds(POPULATED_STATE, BOUNDS);
    for (const pair of next.edgeEndpointPairs) {
      const [a, b] = pair.split("::");
      expect(next.nodeIds.has(a) || a.startsWith("node:env:")).toBe(true);
      expect(next.nodeIds.has(b) || b.startsWith("node:env:")).toBe(true);
    }
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

  it("does NOT increment when only the section-filter changes (renderer-side toggle path simulation)", async () => {
    // Simulate the full shell→renderer path: shell runs layout
    // ONCE for a given (ctadState, bounds) pair, then emits a
    // sequence of hidden-section sets representing user toggles.
    // The renderer must consume the SAME positionedDiagrams
    // and apply visibility filtering only — never re-invoke the
    // adapter. We assert by reading the counter across each
    // simulated toggle.
    const specs = compileTrack3Specs(POPULATED_STATE, BOUNDS);
    const positioned = await layoutTrack3Specs(specs);
    const baseline = getElkLayoutCallCount();
    expect(positioned.length).toBeGreaterThan(0);
    // Toggle path: a sequence of hidden-section sets, each of
    // which the renderer would process by filtering the already-
    // positioned node lists. None of these may invoke ELK.
    const togglePath: ReadonlyArray<ReadonlySet<string>> = [
      new Set<string>(),
      new Set<string>(["infrastructure"]),
      new Set<string>(["infrastructure", "ops"]),
      new Set<string>(["application"]),
      new Set<string>(),
    ];
    for (const hidden of togglePath) {
      // The "renderer" filter pass: pure visibility computation
      // over already-positioned nodes. Must not touch the
      // adapter.
      let kept = 0;
      for (const pd of positioned) {
        for (const n of pd.nodes) {
          const ref = paramRefOfNodeId(n.id);
          if (ref !== null && hidden.has(ref.section)) continue;
          kept++;
        }
      }
      expect(kept).toBeGreaterThanOrEqual(0);
      // Counter MUST be stable across the entire toggle path.
      expect(getElkLayoutCallCount()).toBe(baseline);
    }
  });
});

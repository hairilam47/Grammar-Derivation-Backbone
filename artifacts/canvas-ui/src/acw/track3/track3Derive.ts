// ACW Track 3 — pure derivation: CTAD_STATE + AdcBounds → AcwTrack3Structure.
//
// Constitutional contract:
//   - Pure, total: same (ctadState, bounds) ALWAYS yields the same
//     output. No Date.now, no Math.random, no closure over mutable
//     module state. Verified by `acwTrack3DerivationInvariants`.
//   - Empty in → empty out: a CTAD_STATE whose every parameter is
//     null produces zero nodes and zero edges (no synthesised
//     defaults). Verified by the same invariant.
//   - Non-vendor labels only: every label written into a node
//     comes from `track3LabelRegistry.ts`, whose label table is
//     module-load-asserted against the vendor denylist and the
//     ACW_TRACK3_FORBIDDEN vocabulary tier.
//   - Stable, documented ids: see `track3Types.ts` for the scheme.
import type { CtadStateExport } from "@/ctad/ctadStore";
import {
  TRACK3_LAYERS,
  type Track3Layer,
  type Track3Node,
  type Track3Edge,
  type AcwTrack3Structure,
  type AdcBounds,
  nodeIdForLayer,
  nodeIdForParamValue,
  edgeId,
} from "./track3Types";
import {
  TRACK3_LAYER_LABEL,
  labelForOption,
} from "./track3LabelRegistry";
import { TRACK3_ADJACENCY } from "./track3Adjacency";

// Map Track3Layer → CtadStateExport key. The key set is fixed
// and the order matches `TRACK3_LAYERS` exactly.
function selectionsFor(
  state: CtadStateExport,
  layer: Track3Layer,
): Readonly<Record<string, string | readonly string[] | null>> {
  switch (layer) {
    case "infrastructure":
      return state.infrastructure;
    case "application":
      return state.application;
    case "integration":
      return state.integration;
    case "crossCutting":
      return state.crossCutting;
  }
}

// A non-null param value is either a string (single-select) or a
// readonly string[] (multi-select). Normalise to an array of
// option strings, preserving registry order (CTAD already
// guarantees registry order on multi-flag arrays).
function valueOptions(
  v: string | readonly string[] | null,
): readonly string[] {
  if (v === null) return [];
  if (typeof v === "string") return [v];
  return v;
}

// Layout constants. Deterministic grid only — no randomness, no
// time-based offset.
const LAYER_Y_GAP = 220;
const LAYER_ROOT_X = 0;
const PARAM_X_GAP = 140;
const PARAM_Y_OFFSET = 90;
const PARAM_Y_GAP = 70;
const PARAMS_PER_ROW = 4;

export function deriveACWStructure(
  ctadState: CtadStateExport,
  _bounds: AdcBounds,
): AcwTrack3Structure {
  // _bounds is currently informational only — layer presence
  // surfaces in the binding panel of the shell, not in derivation
  // (CTAD is the authority for technology selections; an unbound
  // selection still derives so the user sees the structural
  // implication of the choice). Keeping the parameter in the
  // signature documents the contract Track 4 will rely on.
  const nodes: Track3Node[] = [];
  const edges: Track3Edge[] = [];
  // First pass: collect non-null selections per layer in
  // deterministic registry order.
  const selectionsByLayer = new Map<
    Track3Layer,
    Array<{ paramId: string; option: string }>
  >();
  let layerHasContent = false;
  for (const layer of TRACK3_LAYERS) {
    const block = selectionsFor(ctadState, layer);
    const flat: Array<{ paramId: string; option: string }> = [];
    for (const [paramId, raw] of Object.entries(block)) {
      for (const opt of valueOptions(raw)) {
        flat.push({ paramId, option: opt });
      }
    }
    if (flat.length > 0) layerHasContent = true;
    selectionsByLayer.set(layer, flat);
  }
  // Empty CTAD_STATE → empty structure (constitutional contract).
  if (!layerHasContent) {
    return Object.freeze({
      nodes: Object.freeze([] as Track3Node[]),
      edges: Object.freeze([] as Track3Edge[]),
    });
  }
  // Second pass: emit layer roots and param-value nodes.
  let layerIndex = 0;
  for (const layer of TRACK3_LAYERS) {
    const flat = selectionsByLayer.get(layer) ?? [];
    if (flat.length === 0) {
      // Layer with no selections is omitted entirely so the
      // empty case above remains a special case of the general
      // case.
      continue;
    }
    const layerY = layerIndex * LAYER_Y_GAP;
    const layerNodeId = nodeIdForLayer(layer);
    nodes.push(
      Object.freeze({
        id: layerNodeId,
        type: "Zone",
        parentId: null,
        label: TRACK3_LAYER_LABEL[layer],
        x: LAYER_ROOT_X,
        y: layerY,
      }),
    );
    let i = 0;
    for (const { paramId, option } of flat) {
      const col = i % PARAMS_PER_ROW;
      const row = Math.floor(i / PARAMS_PER_ROW);
      const x = col * PARAM_X_GAP;
      const y = layerY + PARAM_Y_OFFSET + row * PARAM_Y_GAP;
      nodes.push(
        Object.freeze({
          id: nodeIdForParamValue(layer, paramId, option),
          type: "Component",
          parentId: layerNodeId,
          label: labelForOption(paramId, option),
          x,
          y,
        }),
      );
      i++;
    }
    layerIndex++;
  }
  // Third pass: derive edges per the adjacency table. Pair-based:
  // when both endpoints have one or more non-null options, every
  // pair (a, b) materialises a "CONNECTS"-kind edge.
  const seenEdge = new Set<string>();
  for (const rule of TRACK3_ADJACENCY) {
    const fromOpts = (selectionsByLayer.get(rule.from.layer) ?? []).filter(
      (s) => s.paramId === rule.from.paramId,
    );
    const toOpts = (selectionsByLayer.get(rule.to.layer) ?? []).filter(
      (s) => s.paramId === rule.to.paramId,
    );
    if (fromOpts.length === 0 || toOpts.length === 0) continue;
    for (const f of fromOpts) {
      for (const t of toOpts) {
        const fromId = nodeIdForParamValue(
          rule.from.layer,
          f.paramId,
          f.option,
        );
        const toId = nodeIdForParamValue(rule.to.layer, t.paramId, t.option);
        // Edges are direction-agnostic at the rule level; canonicalise
        // by sorting the endpoints so (a,b) and (b,a) collapse.
        const [aId, bId] = fromId < toId ? [fromId, toId] : [toId, fromId];
        const id = edgeId(aId, bId);
        if (seenEdge.has(id)) continue;
        seenEdge.add(id);
        edges.push(
          Object.freeze({
            id,
            kind: "CONNECTS",
            fromId: aId,
            toId: bId,
          }),
        );
      }
    }
  }
  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}

// ACW Track 3 — derived structural visualisation: type contracts.
//
// Track 3 derives a structural diagram mechanically from a CTAD
// state export (from either an ADC binding or a standalone
// architecture). Phase 3 (Task #80) decoupled Track 3 from ADC
// bounds: the derivation is a pure function of the CTAD state
// alone. This module declares the value shapes that flow through
// it.
//
// Track 3 nodes/edges intentionally use the same field shape as
// the authored ACW workspace's `AcwNode` / `AcwEdge` so the
// existing visibility helper (`enumerateLensVisibility` from
// `acwLensStructure.ts`) applies unchanged. This is a *structural*
// reuse: Track 3 imports the helper and the AcwNode/AcwEdge
// *types* only; it never reads or writes the authored workspace
// store.
import type { AcwNode, AcwEdge } from "../acwLensStructure";

// Layer identifiers map 1:1 to CTAD_STATE section ids; one extra
// alias is permitted ("crossCutting" is rendered as "Cross-Cutting"
// in the label registry but the identifier stays in camelCase).
export type Track3Layer =
  | "infrastructure"
  | "application"
  | "integration"
  | "crossCutting"
  | "ops";

export const TRACK3_LAYERS: readonly Track3Layer[] = Object.freeze([
  "infrastructure",
  "application",
  "integration",
  "crossCutting",
  "ops",
]);

// Perspectives are pure visual focus: which layer's nodes (and
// their immediate cross-layer neighbours) are highlighted in the
// surface. Perspectives never alter derivation output — they are a
// rendering filter only.
export type Track3Perspective =
  | "all"
  | "infraCentric"
  | "appCentric"
  | "integrationCentric";

export const TRACK3_PERSPECTIVES: readonly Track3Perspective[] = Object.freeze(
  ["all", "infraCentric", "appCentric", "integrationCentric"],
);

// Phase 3 (Task #80): the AdcBounds projection has been removed.
// Track 3 derives purely from a CTAD state export — see
// `track3DiagramAdapter.compileTrack3Specs(state)`.

// Derived nodes/edges are structurally compatible with AcwNode /
// AcwEdge so the existing enumerator applies. We model them as
// the same interfaces; downstream code uses these aliases for
// documentation and to make the boundary explicit.
export type Track3Node = AcwNode;
export type Track3Edge = AcwEdge;

export interface AcwTrack3Structure {
  readonly nodes: readonly Track3Node[];
  readonly edges: readonly Track3Edge[];
}

// Stable id scheme for Track 3 derived nodes and edges. The
// scheme is documented here because future Track 4 overlays must
// be able to join on identity without re-running derivation.
//
//   Layer root node   : "node:layer:<layerId>"
//   Param value node  : "node:param:<layerId>:<paramId>:<optionSlug>"
//   Edge              : "edge:<fromId>::<toId>"
//
// optionSlug is the lower-cased option string with non-alphanum
// characters replaced by "-". Determinism is verified at build
// time by the derivation-purity invariant.
export function nodeIdForLayer(layer: Track3Layer): string {
  return `node:layer:${layer}`;
}
// Inverse of the id schemes above: returns the layer that a
// derived node belongs to, or null if the id does not match
// either the layer-root or param-value form. Pure string match,
// no allocation beyond the loop.
export function layerOfNodeId(nodeId: string): Track3Layer | null {
  for (const l of TRACK3_LAYERS) {
    if (nodeId === nodeIdForLayer(l)) return l;
    if (nodeId.startsWith(`node:param:${l}:`)) return l;
  }
  return null;
}
export function nodeIdForParamValue(
  layer: Track3Layer,
  paramId: string,
  optionValue: string,
): string {
  return `node:param:${layer}:${paramId}:${optionSlug(optionValue)}`;
}
export function edgeId(fromId: string, toId: string): string {
  return `edge:${fromId}::${toId}`;
}
export function optionSlug(option: string): string {
  return option.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

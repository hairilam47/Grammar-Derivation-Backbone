// ACW Track 3 — derived structural visualisation: type contracts.
//
// Track 3 derives a structural diagram mechanically from a CTAD
// binding's CTAD_STATE plus a small projection of ADC bounds. The
// derivation is a pure function; this module declares the value
// shapes that flow through it.
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
  | "crossCutting";

export const TRACK3_LAYERS: readonly Track3Layer[] = Object.freeze([
  "infrastructure",
  "application",
  "integration",
  "crossCutting",
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

// AdcBounds carries only the read-only architectural-layer
// information Track 3 cares about. It is computed from a
// PortfolioEntry by `track3AdcBounds.ts` and otherwise opaque.
export interface AdcBounds {
  readonly adsId: string;
  readonly adsVersion: string;
  // Which layers the ADC entry declares as present. Bounds are
  // CONSTRAINING, not informational: `deriveACWStructure` filters
  // out any layer that is not in this set even if CTAD_STATE has
  // selections in it. This is what makes Track 3 "the structural
  // view of THIS ADC entry" rather than a global CTAD echo.
  // The `assertBoundsMaterial` invariant proves this filtering
  // produces a different derivation across full vs partial
  // bounds. The bounds field also surfaces in the binding panel
  // of the derived shell.
  readonly layersPresent: readonly Track3Layer[];
}

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

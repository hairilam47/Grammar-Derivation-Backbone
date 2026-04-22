// ACW Track 3 — DiagramSpec adapter.
//
// Translates the bound CTAD_STATE + AdcBounds into a sequence of
// positioned diagrams (one per architecture stratum) by driving
// the `@workspace/diagramspec` compiler and the
// `@workspace/diagram-layout` ELK wrapper. This module is the
// single point at which Track 3 talks to the diagram pipeline;
// the renderer never imports the compiler or the layout engine
// directly.
//
// Track 3 strata partitioning. The compiler emits ONE viewType +
// stratum per call; Track 3 wants to surface every CTAD section,
// so we compile three specs and union them along the Z axis.
// To avoid double-emitting `crossCutting` (which is mapped into
// both the strategy and technology strata by the foundation
// stratum table) we explicitly mask the per-stratum CTAD input
// here so each section appears in EXACTLY ONE stratum:
//
//   strategy   / context     ← crossCutting
//   application / container  ← application + integration
//   technology  / deployment ← infrastructure + ops
//
// The deployment branch reads environments DIRECTLY from
// CTAD_STATE.environments (Task #77 promoted environments to a
// first-class CTAD concept). The legacy synthesis from
// `infrastructure.deploymentTopology + hostingModel` is gone;
// infrastructure params pass through to the technology call
// because infrastructure is the section mapped to that stratum,
// not because the compiler still needs them for env derivation.
//
// `bounds.layersPresent` constrains derivation: a section that
// the bound ADC entry does not declare in scope is zeroed before
// the compiler sees it, so out-of-bounds CTAD selections never
// surface as nodes. This mirrors the legacy `deriveACWStructure`
// contract.
//
// ELK call counter. The renderer must be able to assert at test
// time that a layer-toggle (visibility-only) does NOT trigger a
// layout pass. We expose a tiny module-local counter that the
// adapter increments on every `layoutDiagram` call. Tests read
// the counter via `getElkLayoutCallCount()`.
import {
  compileDiagramSpec,
  CTAD_SECTIONS_FOR_STRATUM,
  type CtadSectionKey,
  type CtadStateLike,
  type DiagramSpec,
  type DiagramStratum,
  type DiagramViewType,
} from "@workspace/diagramspec";
import {
  layoutDiagram,
  type PositionedDiagram,
} from "@workspace/diagram-layout";
import type { CtadStateExport } from "@/ctad/ctadStore";
import type { AdcBounds, Track3Layer } from "./track3Types";

export interface Track3StratumPlan {
  readonly stratum: DiagramStratum;
  readonly viewType: DiagramViewType;
  readonly sections: readonly Track3Layer[];
}

// Frozen partition: every CTAD section appears in EXACTLY one
// plan entry. Order is the Z stacking order: lowest stratum
// index first.
export const TRACK3_STRATUM_PLAN: readonly Track3StratumPlan[] = Object.freeze([
  Object.freeze({
    stratum: "strategy" as DiagramStratum,
    viewType: "context" as DiagramViewType,
    sections: Object.freeze<Track3Layer[]>(["crossCutting"]),
  }),
  Object.freeze({
    stratum: "application" as DiagramStratum,
    viewType: "container" as DiagramViewType,
    sections: Object.freeze<Track3Layer[]>(["application", "integration"]),
  }),
  Object.freeze({
    stratum: "technology" as DiagramStratum,
    viewType: "deployment" as DiagramViewType,
    sections: Object.freeze<Track3Layer[]>(["infrastructure", "ops"]),
  }),
]);

const EMPTY_BLOCK: Readonly<Record<string, string | readonly string[] | null>> =
  Object.freeze({});

function blockFor(state: CtadStateExport, section: Track3Layer) {
  switch (section) {
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

// Build the masked CTAD-state passed to a single compiler call.
// Sections not on the plan (or out of bounds) are zeroed. The
// `infrastructure` block is always passed through to the
// technology / deployment branch as part of that plan's section
// allocation; environments themselves are scoped just below.
function maskStateForPlan(
  state: CtadStateExport,
  bounds: AdcBounds,
  plan: Track3StratumPlan,
): CtadStateLike {
  const inBounds = new Set<Track3Layer>(bounds.layersPresent);
  const allowed = new Set<Track3Layer>(plan.sections);
  function pass(section: Track3Layer) {
    if (!allowed.has(section)) return EMPTY_BLOCK;
    if (!inBounds.has(section)) return EMPTY_BLOCK;
    return blockFor(state, section);
  }
  // Environments are scoped to the technology stratum — the
  // deployment view is the only branch the compiler that consumes
  // env containers. Logical/runtime strata pass an empty list so
  // their masked CTAD_STATE remains environment-free and can never
  // accidentally fan host nodes out by environment.
  const envs =
    plan.stratum === "technology"
      ? state.environments
      : ([] as CtadStateLike["environments"]);
  return {
    infrastructure: pass("infrastructure"),
    application: pass("application"),
    integration: pass("integration"),
    crossCutting: pass("crossCutting"),
    ops: pass("ops"),
    environments: envs,
  };
}

export function compileTrack3Specs(
  state: CtadStateExport,
  bounds: AdcBounds,
): readonly DiagramSpec[] {
  const out: DiagramSpec[] = [];
  for (const plan of TRACK3_STRATUM_PLAN) {
    const masked = maskStateForPlan(state, bounds, plan);
    const spec = compileDiagramSpec(masked, {
      viewType: plan.viewType,
      stratum: plan.stratum,
    });
    if (spec.nodes.length > 0) out.push(spec);
  }
  return Object.freeze(out);
}

// ---- ELK call counter ------------------------------------------
let __elkLayoutCalls = 0;
export function getElkLayoutCallCount(): number {
  return __elkLayoutCalls;
}
export function resetElkLayoutCallCount(): void {
  __elkLayoutCalls = 0;
}

export async function layoutTrack3Specs(
  specs: readonly DiagramSpec[],
): Promise<readonly PositionedDiagram[]> {
  const out: PositionedDiagram[] = [];
  for (const spec of specs) {
    __elkLayoutCalls++;
    const laid = await layoutDiagram(spec);
    out.push(laid);
  }
  return Object.freeze(out);
}

// Convenience: parse a node id back to its CTAD section. Used by
// the renderer to apply layer-toggle visibility WITHOUT re-running
// layout. The id schemes are documented in the compiler:
//   node:section:<section>
//   node:param:<section>:<paramId>:<slug>(::env:<envId>)?
//   node:env:<envId>
// Returns null for env / unknown ids.
export function ctadSectionOfNodeId(id: string): CtadSectionKey | null {
  if (id.startsWith("node:section:")) {
    return parseSection(id.slice("node:section:".length));
  }
  if (id.startsWith("node:param:")) {
    const rest = id.slice("node:param:".length);
    const colon = rest.indexOf(":");
    if (colon === -1) return null;
    return parseSection(rest.slice(0, colon));
  }
  return null;
}

function parseSection(s: string): CtadSectionKey | null {
  switch (s) {
    case "infrastructure":
    case "application":
    case "integration":
    case "crossCutting":
    case "ops":
      return s;
    default:
      return null;
  }
}

// Convenience: extract the (section, paramId, option-slug) tuple
// from a `node:param:` id, dropping any trailing `::env:` segment
// so deployment-view fan-out collapses for parity comparison.
export interface ParamRef {
  readonly section: CtadSectionKey;
  readonly paramId: string;
  readonly optionSlug: string;
}
export function paramRefOfNodeId(id: string): ParamRef | null {
  if (!id.startsWith("node:param:")) return null;
  let rest = id.slice("node:param:".length);
  const envIdx = rest.indexOf("::env:");
  if (envIdx !== -1) rest = rest.slice(0, envIdx);
  const parts = rest.split(":");
  if (parts.length < 3) return null;
  const section = parseSection(parts[0]);
  if (section === null) return null;
  return Object.freeze({
    section,
    paramId: parts[1],
    optionSlug: parts.slice(2).join(":"),
  });
}

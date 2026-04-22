// DiagramSpec — pure compiler.
//
// `compileDiagramSpec(ctadState, request)` produces ONE DiagramSpec
// per call, deterministic and total. The compiler:
//   - never throws on empty input (returns an empty spec);
//   - never reads CNCF data;
//   - never imports the layout engine or any renderer;
//   - never mutates `ctadState`;
//   - emits ONLY nodes/edges implied by `ctadState` (plus the
//     synthesized environments for the deployment view).
//
// The compiler does NOT enforce viewType × stratum pairing —
// that's the validator's job. An invalid pairing still produces
// a structurally well-formed (but legally-invalid) spec; callers
// should always pass the spec through `validateDiagramSpec` for
// authority on legality.

import {
  DIAGRAMSPEC_SCHEMA_VERSION,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeKind,
  type DiagramRelation,
  type DiagramRequest,
  type DiagramSpec,
  type DiagramStratum,
  type DiagramViewType,
} from "./types";
import {
  BUSINESS_PARAM_ALLOWLIST,
  CTAD_SECTIONS_FOR_STRATUM,
  type CtadSectionKey,
} from "./stratumMapping";
import { synthesizeEnvironments } from "./synthesizeEnvironments";

// Minimal structural shape of the CTAD state the compiler needs.
// Declared structurally so this package does not depend on
// canvas-ui's CTAD types.
export interface CtadStateLike {
  readonly infrastructure: Readonly<
    Record<string, string | readonly string[] | null>
  >;
  readonly application: Readonly<
    Record<string, string | readonly string[] | null>
  >;
  readonly integration: Readonly<
    Record<string, string | readonly string[] | null>
  >;
  readonly crossCutting: Readonly<
    Record<string, string | readonly string[] | null>
  >;
  readonly ops: Readonly<Record<string, string | readonly string[] | null>>;
}

function selectionsFor(
  state: CtadStateLike,
  section: CtadSectionKey,
): Readonly<Record<string, string | readonly string[] | null>> {
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

function valueOptions(
  v: string | readonly string[] | null,
): readonly string[] {
  if (v === null) return [];
  if (typeof v === "string") return [v];
  return v;
}

function optionSlug(option: string): string {
  return option
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ID schemes (stable, documented):
//   node:section:<section>
//   node:param:<section>:<paramId>:<optionSlug>
//   node:env:<envId>            (deployment-view synthesized)
//   edge:<from>::<to>::<relation>
function nodeIdForSection(section: CtadSectionKey): string {
  return `node:section:${section}`;
}
function nodeIdForParamValue(
  section: CtadSectionKey,
  paramId: string,
  option: string,
): string {
  return `node:param:${section}:${paramId}:${optionSlug(option)}`;
}
function edgeIdFor(from: string, to: string, relation: DiagramRelation): string {
  return `edge:${from}::${to}::${relation}`;
}

interface FlatSelection {
  readonly section: CtadSectionKey;
  readonly paramId: string;
  readonly option: string;
}

function collectSelections(
  state: CtadStateLike,
  stratum: DiagramStratum,
): readonly FlatSelection[] {
  const sections = CTAD_SECTIONS_FOR_STRATUM[stratum];
  const out: FlatSelection[] = [];
  for (const section of sections) {
    const allow = stratum === "business" ? BUSINESS_PARAM_ALLOWLIST[section] : null;
    const block = selectionsFor(state, section);
    // Iterate `block` in object-key order; CTAD guarantees registry
    // order on the export, so this is deterministic.
    for (const [paramId, raw] of Object.entries(block)) {
      if (allow && !allow.includes(paramId)) continue;
      for (const option of valueOptions(raw)) {
        out.push({ section, paramId, option });
      }
    }
  }
  return out;
}

// Map (viewType, hasParent) → DiagramNodeKind for the param node.
function paramNodeKind(viewType: DiagramViewType): DiagramNodeKind {
  switch (viewType) {
    case "context":
      // Context view: each CTAD-derived element is rendered as a
      // peer "system" actor of the architecture. Strategy stratum
      // produces the same kind; intent is that downstream styling
      // colours by stratum, not by kind.
      return "system";
    case "container":
      return "container";
    case "component":
      return "component";
    case "deployment":
      // Deployment-view non-environment nodes represent runtime
      // node classes (host roles); rendered as "node".
      return "node";
  }
}

// Map (viewType) → DiagramRelation for section-to-param edges.
function containmentRelation(viewType: DiagramViewType): DiagramRelation {
  if (viewType === "deployment") return "hosts";
  return "contains";
}

// Map (viewType) → DiagramRelation for inter-param peer edges.
function peerRelation(viewType: DiagramViewType): DiagramRelation {
  switch (viewType) {
    case "context":
      return "communicates-with";
    case "container":
    case "component":
      return "depends-on";
    case "deployment":
      return "connects-to";
  }
}

const EMPTY_SPEC = (
  viewType: DiagramViewType,
  stratum: DiagramStratum,
): DiagramSpec =>
  Object.freeze({
    schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
    viewType,
    stratum,
    nodes: Object.freeze([] as DiagramNode[]),
    edges: Object.freeze([] as DiagramEdge[]),
  });

export function compileDiagramSpec(
  ctadState: CtadStateLike,
  request: DiagramRequest,
): DiagramSpec {
  const { viewType, stratum } = request;
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  // ---- Deployment view (technology stratum) ---------------------
  // Hierarchical: synthesized env containers → host nodes → edges.
  if (viewType === "deployment") {
    const topology = pickSingle(ctadState.infrastructure["deploymentTopology"]);
    const hosting = pickSingle(ctadState.infrastructure["hostingModel"]);
    const envs = synthesizeEnvironments(topology, hosting);

    // Emit env nodes (or short-circuit when nothing to show AT ALL).
    const selections = collectSelections(ctadState, stratum);
    if (envs.length === 0 && selections.length === 0) {
      return EMPTY_SPEC(viewType, stratum);
    }

    for (const env of envs) {
      nodes.push(
        Object.freeze({
          id: env.id,
          kind: "environment" as DiagramNodeKind,
          label: env.label,
          parentId: null,
          ctadRef: Object.freeze({
            section: "synthesized",
            paramId: null,
            option: null,
          }),
        }),
      );
    }
    // Each CTAD-derived host node hosts INTO every environment
    // (deterministic fan-out). When no envs exist we fall back to
    // a synthetic default (already handled by `synthesizeEnvironments`
    // unless both inputs were null and we already returned empty).
    const parentEnvs =
      envs.length > 0
        ? envs.map((e) => e.id)
        : []; // length-0 path is unreachable here, but kept defensive.

    const seenNode = new Set<string>();
    const peerNodeIds: string[] = [];
    for (const sel of selections) {
      // One node per (env, selection) pair so containment is
      // explicit and deterministic.
      for (const envId of parentEnvs) {
        const nodeId = `${nodeIdForParamValue(sel.section, sel.paramId, sel.option)}::${envId}`;
        if (seenNode.has(nodeId)) continue;
        seenNode.add(nodeId);
        nodes.push(
          Object.freeze({
            id: nodeId,
            kind: paramNodeKind(viewType),
            label: humanLabel(sel.option),
            parentId: envId,
            ctadRef: Object.freeze({
              section: sel.section,
              paramId: sel.paramId,
              option: sel.option,
            }),
          }),
        );
        peerNodeIds.push(nodeId);
        // Containment edge env --hosts--> node.
        const eid = edgeIdFor(envId, nodeId, "hosts");
        edges.push(
          Object.freeze({
            id: eid,
            from: envId,
            to: nodeId,
            relation: "hosts" as DiagramRelation,
          }),
        );
      }
    }
    // Connects-to edges between peer nodes WITHIN the same env,
    // canonicalised so each pair appears once. For determinism we
    // pair adjacent items in registry order.
    appendPeerChainEdges(edges, peerNodeIds, "connects-to", (id) =>
      tailEnv(id),
    );
    return Object.freeze({
      schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
      viewType,
      stratum,
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
    });
  }

  // ---- Non-deployment views -------------------------------------
  const selections = collectSelections(ctadState, stratum);
  if (selections.length === 0) {
    return EMPTY_SPEC(viewType, stratum);
  }

  // Group selections by section so we can emit a section-level
  // boundary node (kind depends on viewType) plus its child param
  // nodes.
  const bySection = new Map<CtadSectionKey, FlatSelection[]>();
  for (const sel of selections) {
    const arr = bySection.get(sel.section) ?? [];
    arr.push(sel);
    bySection.set(sel.section, arr);
  }

  const sectionParentKind: DiagramNodeKind =
    viewType === "context" ? "system" : viewType === "container" ? "system" : "container";
  const sectionLabelFor = (s: CtadSectionKey): string => {
    switch (s) {
      case "infrastructure":
        return "Infrastructure";
      case "application":
        return "Application";
      case "integration":
        return "Integration";
      case "crossCutting":
        return "Cross-Cutting";
      case "ops":
        return "Ops & Lifecycle";
    }
  };

  for (const section of CTAD_SECTIONS_FOR_STRATUM[stratum]) {
    const flat = bySection.get(section) ?? [];
    if (flat.length === 0) continue;
    const parentId = nodeIdForSection(section);
    nodes.push(
      Object.freeze({
        id: parentId,
        kind: sectionParentKind,
        label: sectionLabelFor(section),
        parentId: null,
        ctadRef: Object.freeze({
          section,
          paramId: null,
          option: null,
        }),
      }),
    );
    const childIds: string[] = [];
    for (const sel of flat) {
      const id = nodeIdForParamValue(sel.section, sel.paramId, sel.option);
      nodes.push(
        Object.freeze({
          id,
          kind: paramNodeKind(viewType),
          label: humanLabel(sel.option),
          parentId,
          ctadRef: Object.freeze({
            section: sel.section,
            paramId: sel.paramId,
            option: sel.option,
          }),
        }),
      );
      childIds.push(id);
      // Containment edge parent --contains--> child.
      const cRel = containmentRelation(viewType);
      const eid = edgeIdFor(parentId, id, cRel);
      edges.push(
        Object.freeze({
          id: eid,
          from: parentId,
          to: id,
          relation: cRel,
        }),
      );
    }
    // Peer chain inside the section so the diagram has flow
    // edges, not just containment ones.
    appendPeerChainEdges(edges, childIds, peerRelation(viewType), () => "");
  }

  return Object.freeze({
    schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
    viewType,
    stratum,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}

// ---- helpers ---------------------------------------------------

function pickSingle(v: string | readonly string[] | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return v.length > 0 ? v[0] : null;
}

function humanLabel(option: string): string {
  return option;
}

// Append a directional chain of peer edges over `ids` using
// `relation`. `bucketKey(id)` groups ids; edges only form between
// adjacent ids in the same bucket, so a deployment-view chain
// stays inside its environment.
function appendPeerChainEdges(
  edges: DiagramEdge[],
  ids: readonly string[],
  relation: DiagramRelation,
  bucketKey: (id: string) => string,
): void {
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1];
    const b = ids[i];
    if (bucketKey(a) !== bucketKey(b)) continue;
    const id = edgeIdFor(a, b, relation);
    edges.push(
      Object.freeze({
        id,
        from: a,
        to: b,
        relation,
      }),
    );
  }
}

// Extract the trailing "::env:..." segment of a deployment-view
// node id so peer-chain bucketing keeps edges within an env.
function tailEnv(nodeId: string): string {
  const idx = nodeId.lastIndexOf("::env:");
  return idx === -1 ? "" : nodeId.slice(idx);
}

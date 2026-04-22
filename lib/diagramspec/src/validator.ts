// DiagramSpec — runtime validator.
//
// Hand-rolled (no JSON-schema runtime dep) so this package stays
// dependency-free. Validates the structural contract AND the
// viewType × stratum pairing rules. Returns a discriminated
// union: { ok: true, spec } | { ok: false, errors }.

import {
  DIAGRAM_NODE_KINDS,
  DIAGRAM_RELATIONS,
  DIAGRAM_STRATA,
  DIAGRAM_VIEW_TYPES,
  DIAGRAMSPEC_SCHEMA_VERSION,
  type DiagramSpec,
  type DiagramNode,
  type DiagramEdge,
  type DiagramNodeKind,
  type DiagramRelation,
  type DiagramStratum,
  type DiagramViewType,
} from "./types";
import { isPairingAllowed } from "./viewRules";

export type ValidationResult =
  | { readonly ok: true; readonly spec: DiagramSpec }
  | { readonly ok: false; readonly errors: readonly string[] };

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isArray(v: unknown): v is readonly unknown[] {
  return Array.isArray(v);
}

function validateNode(
  raw: unknown,
  index: number,
  errors: string[],
): DiagramNode | null {
  if (!isObject(raw)) {
    errors.push(`nodes[${index}]: expected object`);
    return null;
  }
  const id = raw.id;
  const kind = raw.kind;
  const label = raw.label;
  const parentId = raw.parentId;
  const ctadRef = raw.ctadRef;
  let ok = true;
  if (!isString(id) || id.length === 0) {
    errors.push(`nodes[${index}].id: expected non-empty string`);
    ok = false;
  }
  if (!isString(kind) || !DIAGRAM_NODE_KINDS.includes(kind as DiagramNodeKind)) {
    errors.push(
      `nodes[${index}].kind: expected one of ${DIAGRAM_NODE_KINDS.join("|")}`,
    );
    ok = false;
  }
  if (!isString(label)) {
    errors.push(`nodes[${index}].label: expected string`);
    ok = false;
  }
  if (parentId !== null && !isString(parentId)) {
    errors.push(`nodes[${index}].parentId: expected string|null`);
    ok = false;
  }
  if (!isObject(ctadRef)) {
    errors.push(`nodes[${index}].ctadRef: expected object`);
    ok = false;
  } else {
    if (!isString(ctadRef.section)) {
      errors.push(`nodes[${index}].ctadRef.section: expected string`);
      ok = false;
    }
    if (ctadRef.paramId !== null && !isString(ctadRef.paramId)) {
      errors.push(`nodes[${index}].ctadRef.paramId: expected string|null`);
      ok = false;
    }
    if (ctadRef.option !== null && !isString(ctadRef.option)) {
      errors.push(`nodes[${index}].ctadRef.option: expected string|null`);
      ok = false;
    }
  }
  if (!ok) return null;
  return raw as unknown as DiagramNode;
}

function validateEdge(
  raw: unknown,
  index: number,
  knownNodeIds: ReadonlySet<string>,
  errors: string[],
): DiagramEdge | null {
  if (!isObject(raw)) {
    errors.push(`edges[${index}]: expected object`);
    return null;
  }
  const id = raw.id;
  const from = raw.from;
  const to = raw.to;
  const relation = raw.relation;
  let ok = true;
  if (!isString(id) || id.length === 0) {
    errors.push(`edges[${index}].id: expected non-empty string`);
    ok = false;
  }
  if (!isString(from) || !knownNodeIds.has(from)) {
    errors.push(`edges[${index}].from: expected node id (got ${String(from)})`);
    ok = false;
  }
  if (!isString(to) || !knownNodeIds.has(to)) {
    errors.push(`edges[${index}].to: expected node id (got ${String(to)})`);
    ok = false;
  }
  if (
    !isString(relation) ||
    !DIAGRAM_RELATIONS.includes(relation as DiagramRelation)
  ) {
    errors.push(
      `edges[${index}].relation: expected one of ${DIAGRAM_RELATIONS.join("|")}`,
    );
    ok = false;
  }
  if (!ok) return null;
  return raw as unknown as DiagramEdge;
}

export function validateDiagramSpec(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ["spec: expected object"] };
  }
  if (input.schemaVersion !== DIAGRAMSPEC_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion: expected "${DIAGRAMSPEC_SCHEMA_VERSION}" (got ${String(input.schemaVersion)})`,
    );
  }
  const viewType = input.viewType;
  const stratum = input.stratum;
  if (
    !isString(viewType) ||
    !DIAGRAM_VIEW_TYPES.includes(viewType as DiagramViewType)
  ) {
    errors.push(
      `viewType: expected one of ${DIAGRAM_VIEW_TYPES.join("|")} (got ${String(viewType)})`,
    );
  }
  if (
    !isString(stratum) ||
    !DIAGRAM_STRATA.includes(stratum as DiagramStratum)
  ) {
    errors.push(
      `stratum: expected one of ${DIAGRAM_STRATA.join("|")} (got ${String(stratum)})`,
    );
  }
  if (
    isString(viewType) &&
    isString(stratum) &&
    DIAGRAM_VIEW_TYPES.includes(viewType as DiagramViewType) &&
    DIAGRAM_STRATA.includes(stratum as DiagramStratum) &&
    !isPairingAllowed(viewType as DiagramViewType, stratum as DiagramStratum)
  ) {
    errors.push(
      `pairing: viewType "${viewType}" is not allowed for stratum "${stratum}" (mixed-view rejected)`,
    );
  }
  if (!isArray(input.nodes)) {
    errors.push("nodes: expected array");
  }
  if (!isArray(input.edges)) {
    errors.push("edges: expected array");
  }
  if (errors.length > 0 && (!isArray(input.nodes) || !isArray(input.edges))) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  const rawNodes = input.nodes as readonly unknown[];
  const rawEdges = input.edges as readonly unknown[];
  const validatedNodes: DiagramNode[] = [];
  const seenNodeIds = new Set<string>();
  for (let i = 0; i < rawNodes.length; i++) {
    const n = validateNode(rawNodes[i], i, errors);
    if (n) {
      if (seenNodeIds.has(n.id)) {
        errors.push(`nodes[${i}].id: duplicate id "${n.id}"`);
      } else {
        seenNodeIds.add(n.id);
        validatedNodes.push(n);
      }
    }
  }
  // Parent ids must reference known nodes (or be null).
  for (let i = 0; i < validatedNodes.length; i++) {
    const n = validatedNodes[i];
    if (n.parentId !== null && !seenNodeIds.has(n.parentId)) {
      errors.push(
        `nodes[${i}].parentId: references unknown node "${n.parentId}"`,
      );
    }
  }
  const validatedEdges: DiagramEdge[] = [];
  const seenEdgeIds = new Set<string>();
  for (let i = 0; i < rawEdges.length; i++) {
    const e = validateEdge(rawEdges[i], i, seenNodeIds, errors);
    if (e) {
      if (seenEdgeIds.has(e.id)) {
        errors.push(`edges[${i}].id: duplicate id "${e.id}"`);
      } else {
        seenEdgeIds.add(e.id);
        validatedEdges.push(e);
      }
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return {
    ok: true,
    spec: {
      schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
      viewType: viewType as DiagramViewType,
      stratum: stratum as DiagramStratum,
      nodes: Object.freeze(validatedNodes),
      edges: Object.freeze(validatedEdges),
    },
  };
}

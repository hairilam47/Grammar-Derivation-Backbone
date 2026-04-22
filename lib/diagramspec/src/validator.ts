// DiagramSpec — runtime validator.
//
// Two-phase validation:
//   Phase 1: schema-driven evaluation against `DIAGRAMSPEC_JSON_SCHEMA`
//            (the published JSON Schema artifact in `schema.ts`).
//            This authoritatively rejects malformed shape /
//            wrong types / unknown enums / missing fields /
//            unknown properties.
//   Phase 2: cross-field semantic checks that JSON Schema cannot
//            express: viewType x stratum pairing rules, edge
//            endpoints resolving to known node ids, parent ids
//            resolving to known node ids, and id uniqueness.
//
// Result: { ok: true, spec } | { ok: false, errors }.

import {
  DIAGRAMSPEC_SCHEMA_VERSION,
  type DiagramSpec,
  type DiagramStratum,
  type DiagramViewType,
} from "./types";
import { isPairingAllowed } from "./viewRules";
import { DIAGRAMSPEC_JSON_SCHEMA, evaluateAgainstSchema } from "./schema";

export type ValidationResult =
  | { readonly ok: true; readonly spec: DiagramSpec }
  | { readonly ok: false; readonly errors: readonly string[] };

export function validateDiagramSpec(input: unknown): ValidationResult {
  // Phase 1: JSON-Schema-driven shape validation.
  const schemaErrors = evaluateAgainstSchema(
    DIAGRAMSPEC_JSON_SCHEMA as unknown as Record<string, unknown>,
    input,
  );
  if (schemaErrors.length > 0) {
    return { ok: false, errors: Object.freeze([...schemaErrors]) };
  }
  // After phase 1 the input is structurally a DiagramSpec; the
  // assertion below is a cast, not a runtime check.
  const spec = input as DiagramSpec;

  // Phase 2: cross-field semantic checks.
  const errors: string[] = [];

  // viewType x stratum pairing.
  if (!isPairingAllowed(spec.viewType, spec.stratum)) {
    errors.push(
      `pairing: viewType "${spec.viewType}" is not allowed for stratum "${spec.stratum}" (mixed-view rejected)`,
    );
  }

  // Node id uniqueness.
  const nodeIds = new Set<string>();
  for (let i = 0; i < spec.nodes.length; i++) {
    const n = spec.nodes[i];
    if (nodeIds.has(n.id)) {
      errors.push(`nodes[${i}].id: duplicate id "${n.id}"`);
    } else {
      nodeIds.add(n.id);
    }
  }

  // Parent ids reference known nodes.
  for (let i = 0; i < spec.nodes.length; i++) {
    const n = spec.nodes[i];
    if (n.parentId !== null && !nodeIds.has(n.parentId)) {
      errors.push(
        `nodes[${i}].parentId: references unknown node "${n.parentId}"`,
      );
    }
  }

  // Edge id uniqueness + endpoint resolution.
  const edgeIds = new Set<string>();
  for (let i = 0; i < spec.edges.length; i++) {
    const e = spec.edges[i];
    if (edgeIds.has(e.id)) {
      errors.push(`edges[${i}].id: duplicate id "${e.id}"`);
    } else {
      edgeIds.add(e.id);
    }
    if (!nodeIds.has(e.from)) {
      errors.push(
        `edges[${i}].from: references unknown node "${e.from}"`,
      );
    }
    if (!nodeIds.has(e.to)) {
      errors.push(`edges[${i}].to: references unknown node "${e.to}"`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }

  // Freeze defensively so downstream consumers cannot mutate the
  // returned spec via reference to the input.
  return {
    ok: true,
    spec: Object.freeze({
      schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
      viewType: spec.viewType as DiagramViewType,
      stratum: spec.stratum as DiagramStratum,
      nodes: Object.freeze([...spec.nodes]),
      edges: Object.freeze([...spec.edges]),
    }),
  };
}

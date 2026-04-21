// ACW Track 3 — derived adjacency rules.
//
// A frozen table that lists which categorical pairings of CTAD
// parameter selections imply a derived structural edge between
// the corresponding param-value nodes. Edges are strictly
// adjacency / dependency / containment in nature — never
// direction-of-flow, never priority, never recommendation.
//
// The adjacency model is pair-based: when two parameters are
// listed as adjacent and BOTH have non-null selections in
// CTAD_STATE, an edge is added between every pair of (option of
// paramA, option of paramB) value-nodes. This is intentionally
// conservative: pairings the table does not list never
// materialise an edge.
import type { Track3Layer } from "./track3Types";

export interface AdjacencyRule {
  readonly from: { readonly layer: Track3Layer; readonly paramId: string };
  readonly to: { readonly layer: Track3Layer; readonly paramId: string };
}

// Cast at the array boundary: each inner object literal widens
// `layer: "application"` to `layer: string` because the property
// is not annotated, and `Object.freeze` preserves whatever shape
// it received. Annotating the outer array with `as` lets the
// literals stay deeply frozen while restoring the strict
// `Track3Layer` type for downstream consumers.
export const TRACK3_ADJACENCY = Object.freeze([
  // Application <-> infrastructure
  Object.freeze({
    from: { layer: "application", paramId: "runtimeCategory" },
    to: { layer: "infrastructure", paramId: "hostingModel" },
  }),
  Object.freeze({
    from: { layer: "application", paramId: "runtimeCategory" },
    to: { layer: "infrastructure", paramId: "virtualisationClass" },
  }),
  Object.freeze({
    from: { layer: "application", paramId: "applicationStyle" },
    to: { layer: "infrastructure", paramId: "deploymentTopology" },
  }),
  Object.freeze({
    from: { layer: "application", paramId: "backendFrameworkClass" },
    to: { layer: "infrastructure", paramId: "osClass" },
  }),
  // Application data path
  Object.freeze({
    from: { layer: "application", paramId: "applicationStyle" },
    to: { layer: "infrastructure", paramId: "databaseClass" },
  }),
  // Integration <-> application boundary
  Object.freeze({
    from: { layer: "integration", paramId: "integrationPattern" },
    to: { layer: "application", paramId: "applicationStyle" },
  }),
  Object.freeze({
    from: { layer: "integration", paramId: "messageExchange" },
    to: { layer: "application", paramId: "applicationStyle" },
  }),
  Object.freeze({
    from: { layer: "integration", paramId: "boundaryScope" },
    to: { layer: "infrastructure", paramId: "networkTopology" },
  }),
  // Cross-cutting touches infrastructure and application
  Object.freeze({
    from: { layer: "crossCutting", paramId: "configurationManagement" },
    to: { layer: "application", paramId: "applicationStyle" },
  }),
  Object.freeze({
    from: { layer: "crossCutting", paramId: "secretsHandling" },
    to: { layer: "infrastructure", paramId: "identityModel" },
  }),
  Object.freeze({
    from: { layer: "crossCutting", paramId: "resiliencePosture" },
    to: { layer: "infrastructure", paramId: "deploymentTopology" },
  }),
]) as readonly AdjacencyRule[];

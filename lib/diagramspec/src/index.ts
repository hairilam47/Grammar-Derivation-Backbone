// DiagramSpec — public surface.

export type {
  DiagramSpec,
  DiagramRequest,
  DiagramNode,
  DiagramEdge,
  DiagramNodeKind,
  DiagramRelation,
  DiagramStratum,
  DiagramViewType,
  DiagramCtadRef,
} from "./types";
export {
  DIAGRAM_NODE_KINDS,
  DIAGRAM_RELATIONS,
  DIAGRAM_STRATA,
  DIAGRAM_VIEW_TYPES,
  DIAGRAMSPEC_SCHEMA_VERSION,
  STRATUM_INDEX,
} from "./types";

export { ALLOWED_STRATA_FOR_VIEW, isPairingAllowed } from "./viewRules";

export {
  CTAD_SECTIONS_FOR_STRATUM,
  BUSINESS_PARAM_ALLOWLIST,
  type CtadSectionKey,
} from "./stratumMapping";

export { synthesizeEnvironments } from "./synthesizeEnvironments";
export type { SynthesizedEnvironment } from "./synthesizeEnvironments";

export { compileDiagramSpec } from "./compile";
export type { CtadStateLike } from "./compile";

export { validateDiagramSpec } from "./validator";
export type { ValidationResult } from "./validator";

export { assertNoForbiddenDiagramspecImports } from "./diagramspecIsolation";

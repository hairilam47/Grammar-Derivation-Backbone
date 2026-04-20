// ACW v1 — pure grammar validator.
//
// Three predicates: `canCreateNode`, `canCreateEdge`, and the
// dispatcher `validateOperation`. Each returns either `{ ok: true }`
// or `{ ok: false, reason: <neutral message> }`. No mutation, no
// logging, no escalation.
//
// Vocabulary: every neutral reason string in this module is asserted
// against ACW_PLACEHOLDER_FORBIDDEN at module load. The phrasing
// uses "is not permitted" rather than the master prompt's literal
// "is not allowed" because the substring "low" inside "allowed" is
// banned by the responsibility-lens tier the ACW vocabulary
// transitively inherits. Semantic meaning is unchanged.
import { assertAllAcwPlaceholderLanguage } from "../governance/staticTextGuard";
import {
  type AcwElementType,
  type AcwExplicitEdgeKind,
  ACW_ELEMENT_TYPE_LABEL,
  ACW_EDGE_KIND_LABEL,
  isAcwElementType,
  isPermittedEdge,
  permittedParentsFor,
} from "./acwGrammar";

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

// Neutral reason strings. Asserted at module load.
const REASON_UNKNOWN_TYPE = "This element type is not part of the workspace grammar.";
const REASON_PARENT_FORBIDDEN_PREFIX = "This element type is not permitted inside";
const REASON_PARENT_REQUIRED = "This element type is not permitted at the workspace root.";
const REASON_PARENT_MISSING = "The parent node referenced does not exist.";
const REASON_NODE_MISSING = "One of the referenced nodes does not exist.";
const REASON_EDGE_FORBIDDEN_PREFIX = "This relationship is not permitted between";
const REASON_SELF_EDGE = "A relationship from a node to itself is not permitted.";
const REASON_PARENT_ROOT = "the workspace root";

assertAllAcwPlaceholderLanguage([
  REASON_UNKNOWN_TYPE,
  REASON_PARENT_FORBIDDEN_PREFIX,
  REASON_PARENT_REQUIRED,
  REASON_PARENT_MISSING,
  REASON_NODE_MISSING,
  REASON_EDGE_FORBIDDEN_PREFIX,
  REASON_SELF_EDGE,
  REASON_PARENT_ROOT,
]);

// Read-only view of the live workspace surface the validator needs.
// Passed in rather than imported so the validator remains a pure
// function and can be exercised against fabricated graphs in tests.
export interface ValidatorWorkspaceView {
  getNodeType(nodeId: string): AcwElementType | undefined;
}

// canCreateNode: may a node of `type` be created with the given
// parent reference? `parentId === null` means "at the workspace
// root".
export function canCreateNode(
  type: string,
  parentId: string | null,
  view: ValidatorWorkspaceView,
): ValidationResult {
  if (!isAcwElementType(type)) {
    return { ok: false, reason: REASON_UNKNOWN_TYPE };
  }
  const permitted = permittedParentsFor(type);
  if (parentId === null) {
    if (!permitted.includes(null)) {
      return { ok: false, reason: REASON_PARENT_REQUIRED };
    }
    return { ok: true };
  }
  const parentType = view.getNodeType(parentId);
  if (parentType === undefined) {
    return { ok: false, reason: REASON_PARENT_MISSING };
  }
  if (!permitted.includes(parentType)) {
    const parentLabel = ACW_ELEMENT_TYPE_LABEL[parentType];
    return {
      ok: false,
      reason: `${REASON_PARENT_FORBIDDEN_PREFIX} ${parentLabel}.`,
    };
  }
  return { ok: true };
}

// canCreateEdge: may an explicit edge of `kind` be created from
// `fromId` to `toId`?
export function canCreateEdge(
  kind: AcwExplicitEdgeKind,
  fromId: string,
  toId: string,
  view: ValidatorWorkspaceView,
): ValidationResult {
  if (fromId === toId) {
    return { ok: false, reason: REASON_SELF_EDGE };
  }
  const fromType = view.getNodeType(fromId);
  const toType = view.getNodeType(toId);
  if (fromType === undefined || toType === undefined) {
    return { ok: false, reason: REASON_NODE_MISSING };
  }
  if (!isPermittedEdge(kind, fromType, toType)) {
    const kindLabel = ACW_EDGE_KIND_LABEL[kind];
    const fromLabel = ACW_ELEMENT_TYPE_LABEL[fromType];
    const toLabel = ACW_ELEMENT_TYPE_LABEL[toType];
    return {
      ok: false,
      reason: `${REASON_EDGE_FORBIDDEN_PREFIX} ${fromLabel} and ${toLabel} (${kindLabel}).`,
    };
  }
  return { ok: true };
}

// Operation dispatcher used by callers that prefer a uniform shape.
export type AcwOperation =
  | {
      readonly kind: "createNode";
      readonly type: string;
      readonly parentId: string | null;
    }
  | {
      readonly kind: "createEdge";
      readonly edgeKind: AcwExplicitEdgeKind;
      readonly fromId: string;
      readonly toId: string;
    };

export function validateOperation(
  op: AcwOperation,
  view: ValidatorWorkspaceView,
): ValidationResult {
  switch (op.kind) {
    case "createNode":
      return canCreateNode(op.type, op.parentId, view);
    case "createEdge":
      return canCreateEdge(op.edgeKind, op.fromId, op.toId, view);
  }
}

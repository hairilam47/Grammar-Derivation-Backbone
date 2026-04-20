// ACW v1 — authoring panel + refusal banner.
//
// Single shared surface mounted by WorkspaceShell so every lens
// observes the same authoring affordances over the same workspace.
//
// Two forms (add element / add relationship) and one inline refusal
// banner (`data-testid="acw-refusal-banner"`). Every authoring path
// goes through the validator; refusals are displayed as plain
// neutral text.
//
// Vocabulary: every label asserted against ACW_PLACEHOLDER_FORBIDDEN.
// "Destination" replaces "target" (banned). "Permitted" / "not
// permitted" replaces "allowed" / "not allowed" (banned via the
// substring "low" inside "allowed").
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_ELEMENT_TYPES,
  ACW_EXPLICIT_EDGE_KINDS,
  ACW_ELEMENT_TYPE_LABEL,
  ACW_EDGE_KIND_LABEL,
  permittedParentsFor,
  type AcwElementType,
  type AcwExplicitEdgeKind,
} from "@/acw/acwGrammar";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { createNode, createEdge } from "@/acw/acwStore";

const PANEL_TITLE = "Workspace authoring";
const PANEL_HINT =
  "Every operation passes through the v1 grammar validator. Refused operations leave the workspace unchanged.";
const ADD_NODE_TITLE = "Add element";
const ADD_EDGE_TITLE = "Add relationship";
const TYPE_LABEL = "Type";
const PARENT_LABEL = "Parent";
const LABEL_LABEL = "Label";
const KIND_LABEL = "Kind";
const FROM_LABEL = "From";
const TO_LABEL = "Destination";
const ROOT_OPTION = "Workspace root";
const NONE_OPTION = "— pick a node —";
const SUBMIT_LABEL = "Add";
const REFUSAL_PREFIX = "Refused:";
const DISMISS_LABEL = "Dismiss";
const NO_NODES_HINT = "No nodes exist yet. Add an element first.";

assertAllAcwPlaceholderLanguage([
  PANEL_TITLE,
  PANEL_HINT,
  ADD_NODE_TITLE,
  ADD_EDGE_TITLE,
  TYPE_LABEL,
  PARENT_LABEL,
  LABEL_LABEL,
  KIND_LABEL,
  FROM_LABEL,
  TO_LABEL,
  ROOT_OPTION,
  NONE_OPTION,
  SUBMIT_LABEL,
  REFUSAL_PREFIX,
  DISMISS_LABEL,
  NO_NODES_HINT,
]);

const SELECT_CLASS =
  "w-full text-xs bg-background border border-border/60 rounded px-2 py-1 font-mono";

export function AuthoringPanel() {
  const workspace = useAcwWorkspace();
  const [refusal, setRefusal] = useState<string | null>(null);

  // ---- Add-node form state ---------------------------------------------
  const [nodeType, setNodeType] = useState<AcwElementType>("Zone");
  const [nodeParent, setNodeParent] = useState<string>("");
  const [nodeLabel, setNodeLabel] = useState<string>("");

  const candidateParents = useMemo(() => {
    const permitted = permittedParentsFor(nodeType);
    const result: { id: string; label: string }[] = [];
    if (permitted.includes(null)) {
      result.push({ id: "", label: ROOT_OPTION });
    }
    for (const n of workspace.structureGraph.nodes) {
      if (permitted.includes(n.type)) {
        result.push({
          id: n.id,
          label: `${ACW_ELEMENT_TYPE_LABEL[n.type]}: ${n.label}`,
        });
      }
    }
    return result;
  }, [nodeType, workspace]);

  // Keep `nodeParent` aligned with what the <select> visibly shows.
  // When candidateParents changes (e.g. the user switched Type), the
  // previous parent id may no longer be a permitted option. Without
  // this snap-back, the <select> renders its first option visually
  // but state stays at the stale value, so submission would carry
  // the wrong parentId (in particular, an empty parentId resolves to
  // null/root and triggers a spurious ROOT_ONLY refusal).
  useEffect(() => {
    if (candidateParents.length === 0) {
      if (nodeParent !== "") setNodeParent("");
      return;
    }
    const current = candidateParents.find((c) => c.id === nodeParent);
    if (!current) {
      setNodeParent(candidateParents[0].id);
    }
  }, [candidateParents, nodeParent]);

  const onSubmitNode = () => {
    const parentId = nodeParent === "" ? null : nodeParent;
    const result = createNode({
      type: nodeType,
      parentId,
      label: nodeLabel.trim() === "" ? ACW_ELEMENT_TYPE_LABEL[nodeType] : nodeLabel.trim(),
    });
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    setRefusal(null);
    setNodeLabel("");
  };

  // ---- Add-edge form state ---------------------------------------------
  const [edgeKind, setEdgeKind] = useState<AcwExplicitEdgeKind>("CONNECTS");
  const [edgeFrom, setEdgeFrom] = useState<string>("");
  const [edgeTo, setEdgeTo] = useState<string>("");

  const onSubmitEdge = () => {
    // Endpoint pickers must be set before we hand off to the
    // validator-gated store. Submit is disabled in this state below
    // (see `disabled={...}` on the submit button), so this guard is
    // a defensive no-op rather than a UI-local refusal path; it
    // therefore does not need to surface in `acw-refusal-banner`,
    // which is reserved for validator-sourced refusals.
    if (edgeFrom === "" || edgeTo === "") {
      return;
    }
    const result = createEdge({ kind: edgeKind, fromId: edgeFrom, toId: edgeTo });
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    setRefusal(null);
  };

  const allNodes = workspace.structureGraph.nodes;

  return (
    <Card data-testid="acw-authoring-panel">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {PANEL_TITLE}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">{PANEL_HINT}</p>
      </CardHeader>

      {refusal !== null ? (
        <div
          data-testid="acw-refusal-banner"
          className="mx-6 mb-3 px-3 py-2 border border-destructive/50 bg-destructive/10 rounded text-xs flex items-start justify-between gap-3"
        >
          <span>
            <span className="font-semibold uppercase tracking-widest text-[10px] mr-2">
              {REFUSAL_PREFIX}
            </span>
            <span data-testid="acw-refusal-banner-message">{refusal}</span>
          </span>
          <button
            type="button"
            onClick={() => setRefusal(null)}
            className="text-[10px] uppercase tracking-widest underline"
            data-testid="acw-refusal-banner-dismiss"
          >
            {DISMISS_LABEL}
          </button>
        </div>
      ) : null}

      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Add element form */}
        <div className="space-y-2" data-testid="acw-authoring-add-node">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {ADD_NODE_TITLE}
          </h3>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest" htmlFor="acw-node-type">
              {TYPE_LABEL}
            </Label>
            <select
              id="acw-node-type"
              data-testid="acw-node-type-select"
              className={SELECT_CLASS}
              value={nodeType}
              onChange={(e) => {
                setNodeType(e.target.value as AcwElementType);
                setNodeParent("");
              }}
            >
              {ACW_ELEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACW_ELEMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest" htmlFor="acw-node-parent">
              {PARENT_LABEL}
            </Label>
            <select
              id="acw-node-parent"
              data-testid="acw-node-parent-select"
              className={SELECT_CLASS}
              value={nodeParent}
              onChange={(e) => setNodeParent(e.target.value)}
            >
              {candidateParents.length === 0 ? (
                <option value="">{NONE_OPTION}</option>
              ) : (
                candidateParents.map((p) => (
                  <option key={p.id || "root"} value={p.id}>
                    {p.label}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest" htmlFor="acw-node-label">
              {LABEL_LABEL}
            </Label>
            <Input
              id="acw-node-label"
              data-testid="acw-node-label-input"
              value={nodeLabel}
              onChange={(e) => setNodeLabel(e.target.value)}
              className="text-xs font-mono"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onSubmitNode}
            data-testid="acw-node-submit"
            disabled={candidateParents.length === 0}
          >
            {SUBMIT_LABEL}
          </Button>
        </div>

        {/* Add edge form */}
        <div className="space-y-2" data-testid="acw-authoring-add-edge">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {ADD_EDGE_TITLE}
          </h3>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest" htmlFor="acw-edge-kind">
              {KIND_LABEL}
            </Label>
            <select
              id="acw-edge-kind"
              data-testid="acw-edge-kind-select"
              className={SELECT_CLASS}
              value={edgeKind}
              onChange={(e) => setEdgeKind(e.target.value as AcwExplicitEdgeKind)}
            >
              {ACW_EXPLICIT_EDGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACW_EDGE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest" htmlFor="acw-edge-from">
              {FROM_LABEL}
            </Label>
            <select
              id="acw-edge-from"
              data-testid="acw-edge-from-select"
              className={SELECT_CLASS}
              value={edgeFrom}
              onChange={(e) => setEdgeFrom(e.target.value)}
            >
              <option value="">{NONE_OPTION}</option>
              {allNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {ACW_ELEMENT_TYPE_LABEL[n.type]}: {n.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest" htmlFor="acw-edge-to">
              {TO_LABEL}
            </Label>
            <select
              id="acw-edge-to"
              data-testid="acw-edge-to-select"
              className={SELECT_CLASS}
              value={edgeTo}
              onChange={(e) => setEdgeTo(e.target.value)}
            >
              <option value="">{NONE_OPTION}</option>
              {allNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {ACW_ELEMENT_TYPE_LABEL[n.type]}: {n.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onSubmitEdge}
            data-testid="acw-edge-submit"
            disabled={allNodes.length < 2 || edgeFrom === "" || edgeTo === ""}
          >
            {SUBMIT_LABEL}
          </Button>
          {allNodes.length < 2 ? (
            <p
              className="text-[11px] italic text-muted-foreground"
              data-testid="acw-authoring-no-nodes-hint"
            >
              {NO_NODES_HINT}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

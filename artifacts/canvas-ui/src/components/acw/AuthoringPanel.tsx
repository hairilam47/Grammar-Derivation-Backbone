// ACW v1 — authoring panel + refusal banner.
//
// Single shared surface mounted by WorkspaceShell so every lens
// observes the same authoring affordances over the same workspace.
//
// Two stepwise flows (add element / add relationship) and one inline
// refusal banner (`data-testid="acw-refusal-banner"`). Every authoring
// path goes through the validator; refusals are displayed as plain
// neutral text. Each flow walks the user through one blank at a time,
// and every choice is offered as a selectable card rather than a
// dropdown menu — clicking a card both selects the value and reveals
// the continue control for that step.
//
// Vocabulary: every label asserted against ACW_PLACEHOLDER_FORBIDDEN.
// "Destination" replaces "target" (banned). "Permitted" / "not
// permitted" replaces "allowed" / "not allowed" (banned via the
// substring "low" inside "allowed").
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  Network,
  Workflow,
} from "lucide-react";
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
import { createNode, createEdge, updateNodeBinding } from "@/acw/acwStore";
import { subscribeRefusals } from "@/acw/acwRefusalChannel";
import {
  resolveBoundOptions,
  resolveLabel,
} from "@/acw/semantic/techNodeBinding";
import { lookupIconForCategory } from "@/acw/icons/iconRegistry";

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
const NO_PARENTS_HINT =
  "No permitted parent for this type. Pick a different type.";
const NO_NODES_PICKER_HINT =
  "No element exists yet. Use the form on the left to add one.";
const SUBMIT_LABEL = "Add";
const REFUSAL_PREFIX = "Refused:";
const DISMISS_LABEL = "Dismiss";
const NO_NODES_HINT = "No nodes exist yet. Add an element first.";
// Stepwise flow labels (Phase: card-based authoring).
const STEP_PREFIX = "Step";
const STEP_OF_JOIN = "of";
const CONTINUE_LABEL = "Continue";
const BACK_LABEL = "Back";
const LABEL_HINT =
  "Defaults to the type label if left blank.";
// Phase 5 — bound-bindings subsection labels.
const BINDINGS_TITLE = "Bound parameters";
const BINDINGS_HINT =
  "Nodes seeded from a CTAD architecture carry a bound parameter. Pick a card here to update the node label in place.";
const NO_BOUND_NODES_HINT = "No bound nodes in this workspace.";
const SECTION_LABEL = "Section";
const PARAM_LABEL = "Parameter";
const OPTION_LABEL = "Option";
const NOT_SPECIFIED_LABEL = "Not specified";

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
  NO_PARENTS_HINT,
  NO_NODES_PICKER_HINT,
  SUBMIT_LABEL,
  REFUSAL_PREFIX,
  DISMISS_LABEL,
  NO_NODES_HINT,
  STEP_PREFIX,
  STEP_OF_JOIN,
  CONTINUE_LABEL,
  BACK_LABEL,
  LABEL_HINT,
  BINDINGS_TITLE,
  BINDINGS_HINT,
  NO_BOUND_NODES_HINT,
  SECTION_LABEL,
  PARAM_LABEL,
  OPTION_LABEL,
  NOT_SPECIFIED_LABEL,
]);

// ---- Generic step / card primitives ----------------------------------

interface StepHeaderProps {
  index: number;
  total: number;
  title: string;
  testIdPrefix: string;
}

function StepHeader({ index, total, title, testIdPrefix }: StepHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testIdPrefix}-step-counter`}
      >
        {STEP_PREFIX} {index} {STEP_OF_JOIN} {total}
      </span>
      <Label
        className="text-[10px] uppercase tracking-widest"
        data-testid={`${testIdPrefix}-step-title`}
      >
        {title}
      </Label>
    </div>
  );
}

interface StepDotsProps {
  total: number;
  current: number;
  testIdPrefix: string;
}

function StepDots({ total, current, testIdPrefix }: StepDotsProps) {
  const dots = Array.from({ length: total }, (_, i) => i);
  return (
    <div
      className="flex items-center gap-1.5"
      aria-hidden="true"
      data-testid={`${testIdPrefix}-step-dots`}
    >
      {dots.map((i) => {
        const state =
          i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <span
            key={i}
            data-state={state}
            className={[
              "h-1.5 rounded-full transition-all",
              state === "current" ? "w-6 bg-primary" : "w-1.5",
              state === "done" ? "bg-primary/70" : "",
              state === "upcoming" ? "bg-border" : "",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  primary: ReactNode;
  secondary?: ReactNode;
  icon?: ReactNode;
  testId?: string;
  disabled?: boolean;
}

function OptionCard({
  selected,
  onClick,
  primary,
  secondary,
  icon,
  testId,
  disabled,
}: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      data-selected={selected ? "true" : "false"}
      className={[
        "group relative w-full text-left rounded-md border px-3 py-2 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border/60 bg-background hover:border-primary/60 hover:bg-accent/40",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        {icon ? (
          <span className="mt-0.5 text-muted-foreground group-hover:text-foreground">
            {icon}
          </span>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono leading-tight truncate">
            {primary}
          </div>
          {secondary ? (
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5 truncate">
              {secondary}
            </div>
          ) : null}
        </div>
        {selected ? (
          <Check
            className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </button>
  );
}

interface OptionPillProps {
  selected: boolean;
  onClick: () => void;
  label: ReactNode;
  testId?: string;
}

function OptionPill({ selected, onClick, label, testId }: OptionPillProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-testid={testId}
      data-selected={selected ? "true" : "false"}
      className={[
        "shrink-0 rounded-full border px-3 py-1 text-[11px] font-mono transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/60 bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ---- Element type icon hint ------------------------------------------
// Lightweight visual mnemonic. Not a substitute for the type label.

function iconForElementType(type: AcwElementType): ReactNode {
  switch (type) {
    case "Zone":
      return <Layers className="w-3.5 h-3.5" aria-hidden="true" />;
    case "System":
    case "Subsystem":
      return <Network className="w-3.5 h-3.5" aria-hidden="true" />;
    default:
      return <Workflow className="w-3.5 h-3.5" aria-hidden="true" />;
  }
}

// ---- Main panel ------------------------------------------------------

export function AuthoringPanel() {
  const workspace = useAcwWorkspace();
  const [refusal, setRefusal] = useState<string | null>(null);

  // Subscribe to the refusal channel so visual surfaces (Canvas2D
  // drag handlers, the group affordance) can route their refusals
  // into this single shared banner without prop-threading. The
  // channel transports the validator's neutral refusal string
  // verbatim — no codes, no severity, no remediation.
  useEffect(() => {
    return subscribeRefusals((message) => setRefusal(message));
  }, []);

  // ---- Add-node stepwise state ---------------------------------------
  const [nodeStep, setNodeStep] = useState<0 | 1 | 2>(0);
  const [nodeType, setNodeType] = useState<AcwElementType>("Zone");
  const [nodeParent, setNodeParent] = useState<string>("");
  const [nodeParentTouched, setNodeParentTouched] = useState<boolean>(false);
  const [nodeLabel, setNodeLabel] = useState<string>("");

  const candidateParents = useMemo(() => {
    const permitted = permittedParentsFor(nodeType);
    const result: { id: string; label: string; secondary?: string }[] = [];
    if (permitted.includes(null)) {
      result.push({ id: "", label: ROOT_OPTION });
    }
    for (const n of workspace.structureGraph.nodes) {
      if (permitted.includes(n.type)) {
        result.push({
          id: n.id,
          label: n.label,
          secondary: ACW_ELEMENT_TYPE_LABEL[n.type],
        });
      }
    }
    return result;
  }, [nodeType, workspace]);

  // Keep `nodeParent` aligned with what's currently visible. When
  // candidateParents changes (e.g. the user switched Type), the
  // previous parent id may no longer be a permitted option. Without
  // this snap-back, submission would carry the wrong parentId (in
  // particular, an empty parentId resolves to null/root and triggers
  // a spurious ROOT_ONLY refusal).
  useEffect(() => {
    if (candidateParents.length === 0) {
      if (nodeParent !== "") setNodeParent("");
      return;
    }
    const current = candidateParents.find((c) => c.id === nodeParent);
    if (!current) {
      // Default to the first option but mark the parent as untouched
      // so the wizard still requires an explicit confirmation when
      // multiple parents are permitted.
      setNodeParent(candidateParents[0].id);
      setNodeParentTouched(false);
    }
  }, [candidateParents, nodeParent]);

  const onPickNodeType = (t: AcwElementType) => {
    setNodeType(t);
    setNodeParent("");
    setNodeParentTouched(false);
  };

  const onPickNodeParent = (id: string) => {
    setNodeParent(id);
    setNodeParentTouched(true);
  };

  const canAdvanceFromParent =
    candidateParents.length > 0 &&
    (nodeParentTouched || candidateParents.length === 1);

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
    setNodeStep(0);
    setNodeParentTouched(false);
  };

  // ---- Add-edge stepwise state ---------------------------------------
  const [edgeStep, setEdgeStep] = useState<0 | 1 | 2>(0);
  const [edgeKind, setEdgeKind] = useState<AcwExplicitEdgeKind>("CONNECTS");
  const [edgeKindTouched, setEdgeKindTouched] = useState<boolean>(false);
  const [edgeFrom, setEdgeFrom] = useState<string>("");
  const [edgeTo, setEdgeTo] = useState<string>("");

  const onPickEdgeKind = (k: AcwExplicitEdgeKind) => {
    setEdgeKind(k);
    setEdgeKindTouched(true);
  };

  const onSubmitEdge = () => {
    if (edgeFrom === "" || edgeTo === "") return;
    const result = createEdge({ kind: edgeKind, fromId: edgeFrom, toId: edgeTo });
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    setRefusal(null);
    setEdgeStep(0);
    setEdgeFrom("");
    setEdgeTo("");
    setEdgeKindTouched(false);
  };

  const allNodes = workspace.structureGraph.nodes;

  // Phase 5 — bound nodes (those carrying a `boundParam`). The
  // option pickers below route through `updateNodeBinding` which
  // re-validates the resulting workspace; CTAD itself is never
  // mutated from this surface.
  const boundNodes = useMemo(
    () => allNodes.filter((n) => n.boundParam !== undefined),
    [allNodes],
  );

  const onChangeBinding = (nodeId: string, raw: string) => {
    const node = allNodes.find((n) => n.id === nodeId);
    if (node === undefined || node.boundParam === undefined) return;
    const optionValue = raw === "" ? null : raw;
    const result = updateNodeBinding(nodeId, {
      boundParam: {
        sectionId: node.boundParam.sectionId,
        paramId: node.boundParam.paramId,
        optionValue,
      },
    });
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    setRefusal(null);
  };

  const enoughNodesForEdge = allNodes.length >= 2;

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
        {/* Add element flow */}
        <div
          className="space-y-3 p-3 rounded-md border border-border/40 bg-muted/5"
          data-testid="acw-authoring-add-node"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {ADD_NODE_TITLE}
            </h3>
            <StepDots
              total={3}
              current={nodeStep}
              testIdPrefix="acw-node"
            />
          </div>

          {nodeStep === 0 && (
            <div
              className="space-y-2"
              data-testid="acw-node-type-step"
              role="radiogroup"
              aria-label={TYPE_LABEL}
            >
              <StepHeader
                index={1}
                total={3}
                title={TYPE_LABEL}
                testIdPrefix="acw-node-type"
              />
              <div className="grid grid-cols-2 gap-2">
                {ACW_ELEMENT_TYPES.map((t) => (
                  <OptionCard
                    key={t}
                    selected={nodeType === t}
                    onClick={() => onPickNodeType(t)}
                    primary={ACW_ELEMENT_TYPE_LABEL[t]}
                    icon={iconForElementType(t)}
                    testId={`acw-node-type-card-${t}`}
                  />
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setNodeStep(1)}
                  data-testid="acw-node-step-1-continue"
                >
                  {CONTINUE_LABEL}
                  <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {nodeStep === 1 && (
            <div
              className="space-y-2"
              data-testid="acw-node-parent-step"
              role="radiogroup"
              aria-label={PARENT_LABEL}
            >
              <StepHeader
                index={2}
                total={3}
                title={PARENT_LABEL}
                testIdPrefix="acw-node-parent"
              />
              {candidateParents.length === 0 ? (
                <p
                  className="text-[11px] italic text-muted-foreground"
                  data-testid="acw-node-parent-empty-hint"
                >
                  {NO_PARENTS_HINT}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-56 overflow-auto pr-1">
                  {candidateParents.map((p) => (
                    <OptionCard
                      key={p.id || "root"}
                      selected={nodeParent === p.id && nodeParentTouched}
                      onClick={() => onPickNodeParent(p.id)}
                      primary={p.label}
                      secondary={p.secondary}
                      testId={`acw-node-parent-card-${p.id || "root"}`}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setNodeStep(0)}
                  data-testid="acw-node-step-2-back"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  {BACK_LABEL}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setNodeStep(2)}
                  disabled={!canAdvanceFromParent}
                  data-testid="acw-node-step-2-continue"
                >
                  {CONTINUE_LABEL}
                  <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {nodeStep === 2 && (
            <div className="space-y-2" data-testid="acw-node-label-step">
              <StepHeader
                index={3}
                total={3}
                title={LABEL_LABEL}
                testIdPrefix="acw-node-label"
              />
              <Input
                id="acw-node-label"
                data-testid="acw-node-label-input"
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                className="text-xs font-mono"
                placeholder={ACW_ELEMENT_TYPE_LABEL[nodeType]}
                autoFocus
              />
              <p className="text-[11px] italic text-muted-foreground">
                {LABEL_HINT}
              </p>
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setNodeStep(1)}
                  data-testid="acw-node-step-3-back"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  {BACK_LABEL}
                </Button>
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
            </div>
          )}
        </div>

        {/* Add relationship flow */}
        <div
          className="space-y-3 p-3 rounded-md border border-border/40 bg-muted/5"
          data-testid="acw-authoring-add-edge"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {ADD_EDGE_TITLE}
            </h3>
            <StepDots
              total={3}
              current={edgeStep}
              testIdPrefix="acw-edge"
            />
          </div>

          {!enoughNodesForEdge ? (
            <p
              className="text-[11px] italic text-muted-foreground"
              data-testid="acw-authoring-no-nodes-hint"
            >
              {NO_NODES_HINT}
            </p>
          ) : null}

          {edgeStep === 0 && (
            <div
              className="space-y-2"
              data-testid="acw-edge-kind-step"
              role="radiogroup"
              aria-label={KIND_LABEL}
            >
              <StepHeader
                index={1}
                total={3}
                title={KIND_LABEL}
                testIdPrefix="acw-edge-kind"
              />
              <div className="grid grid-cols-1 gap-2">
                {ACW_EXPLICIT_EDGE_KINDS.map((k) => (
                  <OptionCard
                    key={k}
                    selected={edgeKind === k && edgeKindTouched}
                    onClick={() => onPickEdgeKind(k)}
                    primary={ACW_EDGE_KIND_LABEL[k]}
                    testId={`acw-edge-kind-card-${k}`}
                  />
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEdgeStep(1)}
                  disabled={!enoughNodesForEdge || !edgeKindTouched}
                  data-testid="acw-edge-step-1-continue"
                >
                  {CONTINUE_LABEL}
                  <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {edgeStep === 1 && (
            <div
              className="space-y-2"
              data-testid="acw-edge-from-step"
              role="radiogroup"
              aria-label={FROM_LABEL}
            >
              <StepHeader
                index={2}
                total={3}
                title={FROM_LABEL}
                testIdPrefix="acw-edge-from"
              />
              {allNodes.length === 0 ? (
                <p
                  className="text-[11px] italic text-muted-foreground"
                  data-testid="acw-edge-from-empty-hint"
                >
                  {NO_NODES_PICKER_HINT}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-56 overflow-auto pr-1">
                  {allNodes.map((n) => (
                    <OptionCard
                      key={n.id}
                      selected={edgeFrom === n.id}
                      onClick={() => setEdgeFrom(n.id)}
                      primary={n.label}
                      secondary={ACW_ELEMENT_TYPE_LABEL[n.type]}
                      testId={`acw-edge-from-card-${n.id}`}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEdgeStep(0)}
                  data-testid="acw-edge-step-2-back"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  {BACK_LABEL}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEdgeStep(2)}
                  disabled={edgeFrom === ""}
                  data-testid="acw-edge-step-2-continue"
                >
                  {CONTINUE_LABEL}
                  <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {edgeStep === 2 && (
            <div
              className="space-y-2"
              data-testid="acw-edge-to-step"
              role="radiogroup"
              aria-label={TO_LABEL}
            >
              <StepHeader
                index={3}
                total={3}
                title={TO_LABEL}
                testIdPrefix="acw-edge-to"
              />
              {allNodes.length === 0 ? (
                <p
                  className="text-[11px] italic text-muted-foreground"
                  data-testid="acw-edge-to-empty-hint"
                >
                  {NO_NODES_PICKER_HINT}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-56 overflow-auto pr-1">
                  {allNodes.map((n) => (
                    <OptionCard
                      key={n.id}
                      selected={edgeTo === n.id}
                      onClick={() => setEdgeTo(n.id)}
                      primary={n.label}
                      secondary={ACW_ELEMENT_TYPE_LABEL[n.type]}
                      testId={`acw-edge-to-card-${n.id}`}
                      disabled={n.id === edgeFrom}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEdgeStep(1)}
                  data-testid="acw-edge-step-3-back"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  {BACK_LABEL}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSubmitEdge}
                  data-testid="acw-edge-submit"
                  disabled={!enoughNodesForEdge || edgeFrom === "" || edgeTo === ""}
                >
                  {SUBMIT_LABEL}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Phase 5 — bound parameters subsection. Each option set is
            rendered as a horizontally-scrollable row of selectable
            pill cards rather than a dropdown. */}
        <div
          className="space-y-2 md:col-span-2"
          data-testid="acw-authoring-bound-bindings"
        >
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {BINDINGS_TITLE}
          </h3>
          <p className="text-[11px] text-muted-foreground">{BINDINGS_HINT}</p>
          {boundNodes.length === 0 ? (
            <p
              className="text-[11px] italic text-muted-foreground"
              data-testid="acw-authoring-no-bound-nodes-hint"
            >
              {NO_BOUND_NODES_HINT}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="acw-bound-nodes-list">
              {boundNodes.map((node) => {
                const bp = node.boundParam!;
                const options = resolveBoundOptions(node);
                const iconEntry = lookupIconForCategory(node.boundTechnologyCategory);
                const display = resolveLabel(node);
                return (
                  <li
                    key={node.id}
                    data-testid={`acw-bound-node-${node.id}`}
                    className="border border-border/50 rounded p-2 space-y-1"
                  >
                    <div className="flex items-center gap-2 text-xs font-mono">
                      {iconEntry ? (
                        <iconEntry.Icon
                          width={14}
                          height={14}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span data-testid={`acw-bound-node-display-${node.id}`}>
                        {display}
                      </span>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {SECTION_LABEL}: {bp.sectionId} · {PARAM_LABEL}: {bp.paramId}
                    </div>
                    <div className="space-y-1">
                      <Label
                        className="text-[10px] uppercase tracking-widest"
                        id={`acw-bound-option-label-${node.id}`}
                      >
                        {OPTION_LABEL}
                      </Label>
                      <div
                        role="radiogroup"
                        aria-labelledby={`acw-bound-option-label-${node.id}`}
                        className="flex flex-wrap gap-1.5"
                        data-testid={`acw-bound-option-cards-${node.id}`}
                      >
                        <OptionPill
                          selected={(bp.optionValue ?? null) === null}
                          onClick={() => onChangeBinding(node.id, "")}
                          label={NOT_SPECIFIED_LABEL}
                          testId={`acw-bound-option-card-${node.id}-none`}
                        />
                        {options.map((o) => (
                          <OptionPill
                            key={o}
                            selected={bp.optionValue === o}
                            onClick={() => onChangeBinding(node.id, o)}
                            label={o}
                            testId={`acw-bound-option-card-${node.id}-${o}`}
                          />
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

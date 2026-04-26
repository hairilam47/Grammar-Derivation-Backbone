// EAStudio Phase 2 — right-side Properties panel.
//
// Reads the lens-keyed `selectedNodeIdByLens` slice and renders an
// editor for the optional descriptive node fields:
//
//   - label        (renamed via `renameNode`)
//   - description  (text)
//   - owner        (text)
//   - status       (closed enum dropdown)
//   - maturity     (closed enum dropdown)
//   - priority     (closed enum dropdown)
//
// It also lists the incident CONNECTS edges for the selected node
// and offers a per-edge delete button. All mutations route through
// the validator-gated store API; refusals publish on
// `acwRefusalChannel` and surface in the studio inline banner. The
// panel itself never touches the workspace directly.
//
// Sealed domain containers are not editable: when the user has one
// selected (which the canvas suppresses, but defensively here too)
// the panel renders a plain "sealed container" notice instead of
// the editor form.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Vocabulary "permitted" not "allowed".
//   - Empty-string writes are not sent (the field clears via the
//     "Clear" affordance which calls `updateNodeProperties` with
//     `null`, omitting the key). Helper components live at module
//     scope so React keeps the same input element across renders
//     (no focus loss while typing).
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import {
  deleteEdge,
  renameNode,
  updateNodeProperties,
} from "@/acw/acwStore";
import { publishRefusal } from "@/acw/acwRefusalChannel";
import {
  getSelectedNodeId,
  setSelectedNodeId,
  subscribeViewState,
} from "@/acw/acwViewState";
import {
  ACW_NODE_MATURITIES,
  ACW_NODE_MATURITY_LABEL,
  ACW_NODE_PRIORITIES,
  ACW_NODE_PRIORITY_LABEL,
  ACW_NODE_STATUSES,
  ACW_NODE_STATUS_LABEL,
} from "@/acw/acwNodeProperties";

const PANEL_TITLE = "Properties";
const EMPTY_STATE = "Click a node to edit its properties.";
const SEALED_NOTICE = "This is a sealed domain container and is not editable.";
const FIELD_LABEL = "Label";
const FIELD_DESCRIPTION = "Description";
// "Owner" is in ACW_PLACEHOLDER_FORBIDDEN via the responsibility
// tier, so the displayed label uses the neutral synonym
// "Maintainer". The schema field on `AcwNode` is still `owner` —
// only the user-facing label changes.
const FIELD_OWNER = "Maintainer";
const FIELD_STATUS = "Status";
const FIELD_MATURITY = "Maturity";
// "Priority" is in ACW_PLACEHOLDER_FORBIDDEN via the SIGNALS tier.
// The displayed label uses the neutral synonym "Tier"; the schema
// field on `AcwNode` is still `priority` and the enum values
// ("low" / "medium" / "high" / "critical") keep their programmatic
// names. Only the user-facing label changes.
const FIELD_PRIORITY = "Tier";
const APPLY_LABEL = "Apply";
const CLEAR_LABEL = "Clear";
const NONE_LABEL = "—";
const INCIDENT_TITLE = "Incident connections";
const NO_EDGES = "No connections incident to this node.";
const CONNECT_FROM = "from";
const CONNECT_TO = "to";
const DELETE_LABEL = "Delete";
const CLOSE_LABEL = "Close";

assertAllAcwPlaceholderLanguage([
  PANEL_TITLE,
  EMPTY_STATE,
  SEALED_NOTICE,
  FIELD_LABEL,
  FIELD_DESCRIPTION,
  FIELD_OWNER,
  FIELD_STATUS,
  FIELD_MATURITY,
  FIELD_PRIORITY,
  APPLY_LABEL,
  CLEAR_LABEL,
  NONE_LABEL,
  INCIDENT_TITLE,
  NO_EDGES,
  CONNECT_FROM,
  CONNECT_TO,
  DELETE_LABEL,
  CLOSE_LABEL,
]);

export interface NodePropertiesPanelProps {
  readonly lensId: string;
}

function PanelHeader({ onClose }: { onClose?: () => void }) {
  return (
    <header className="flex items-center justify-between px-3 py-2 border-b border-border/30">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {PANEL_TITLE}
      </h3>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={CLOSE_LABEL}
          data-testid="acw-studio-properties-close"
          className="p-1 rounded border border-transparent hover:border-border/60 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      ) : null}
    </header>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  currentPersisted: string;
  onChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
  testIdPrefix: string;
}

function TextField(p: TextFieldProps) {
  const dirty = p.value !== p.currentPersisted;
  return (
    <div className="px-3 py-2 border-b border-border/20 flex flex-col gap-1">
      <label
        className="text-[10px] uppercase tracking-widest text-muted-foreground"
        htmlFor={p.id}
      >
        {p.label}
      </label>
      <input
        id={p.id}
        type="text"
        className="px-2 py-1 text-xs rounded border border-border/60 bg-background"
        value={p.value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
        data-testid={`${p.testIdPrefix}-input`}
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={p.onApply}
          disabled={!dirty || p.value.length === 0}
          className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-border/60 disabled:opacity-40 hover:text-primary hover:border-primary/60 transition-colors"
          data-testid={`${p.testIdPrefix}-apply`}
        >
          {APPLY_LABEL}
        </button>
        <button
          type="button"
          onClick={p.onClear}
          disabled={p.currentPersisted.length === 0 && p.value.length === 0}
          className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-border/60 disabled:opacity-40 hover:text-destructive hover:border-destructive/60 transition-colors"
          data-testid={`${p.testIdPrefix}-clear`}
        >
          {CLEAR_LABEL}
        </button>
      </div>
    </div>
  );
}

interface EnumFieldProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
  testIdPrefix: string;
}

function EnumField(p: EnumFieldProps) {
  return (
    <div className="px-3 py-2 border-b border-border/20 flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {p.label}
      </label>
      <select
        className="px-2 py-1 text-xs rounded border border-border/60 bg-background"
        value={p.value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => p.onChange(e.target.value)}
        data-testid={`${p.testIdPrefix}-select`}
      >
        <option value="">{NONE_LABEL}</option>
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NodePropertiesPanel({ lensId }: NodePropertiesPanelProps) {
  const ws = useAcwWorkspace();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;

  const selectedId = getSelectedNodeId(lensId);
  const node = useMemo(
    () => ws.structureGraph.nodes.find((n) => n.id === selectedId) ?? null,
    [ws.structureGraph.nodes, selectedId],
  );

  // Local form mirror so typing does not commit on every keystroke.
  // Re-seeded whenever the selection or the persisted node bytes
  // change. The "Apply" button performs the validator-gated commit.
  const [labelDraft, setLabelDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [ownerDraft, setOwnerDraft] = useState("");
  useEffect(() => {
    setLabelDraft(node?.label ?? "");
    setDescDraft(node?.description ?? "");
    setOwnerDraft(node?.owner ?? "");
  }, [node?.id, node?.label, node?.description, node?.owner]);

  if (selectedId === null || node === null) {
    return (
      <aside
        data-testid="acw-studio-properties-panel"
        data-state="empty"
        className="w-[280px] border-l border-border/40 bg-card/30 flex flex-col"
      >
        <PanelHeader />
        <p className="px-3 py-2 text-[11px] text-muted-foreground italic">
          {EMPTY_STATE}
        </p>
      </aside>
    );
  }

  if (node.isDomainContainer === true) {
    return (
      <aside
        data-testid="acw-studio-properties-panel"
        data-state="sealed"
        data-node-id={node.id}
        className="w-[280px] border-l border-border/40 bg-card/30 flex flex-col"
      >
        <PanelHeader onClose={() => setSelectedNodeId(lensId, null)} />
        <p className="px-3 py-2 text-[11px] text-muted-foreground italic">
          {SEALED_NOTICE}
        </p>
      </aside>
    );
  }

  function applyLabel(e: FormEvent) {
    e.preventDefault();
    if (node === null) return;
    if (labelDraft.length === 0 || labelDraft === node.label) return;
    const r = renameNode(node.id, labelDraft);
    if (!r.ok) publishRefusal(r.reason);
  }
  function applyText(field: "description" | "owner", value: string) {
    if (node === null) return;
    if (value.length === 0) {
      // empty → unset the field
      const r = updateNodeProperties(node.id, { [field]: null } as Parameters<
        typeof updateNodeProperties
      >[1]);
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    if ((node[field] ?? "") === value) return;
    const r = updateNodeProperties(node.id, { [field]: value } as Parameters<
      typeof updateNodeProperties
    >[1]);
    if (!r.ok) publishRefusal(r.reason);
  }
  function setEnum(
    field: "status" | "maturity" | "priority",
    value: string,
  ) {
    if (node === null) return;
    const next = value === "" ? null : value;
    const r = updateNodeProperties(node.id, {
      [field]: next,
    } as Parameters<typeof updateNodeProperties>[1]);
    if (!r.ok) publishRefusal(r.reason);
  }

  const incidentEdges = ws.structureGraph.edges.filter(
    (e) => e.fromId === node.id || e.toId === node.id,
  );

  return (
    <aside
      data-testid="acw-studio-properties-panel"
      data-state="editing"
      data-node-id={node.id}
      className="w-[280px] border-l border-border/40 bg-card/30 flex flex-col overflow-y-auto"
    >
      <PanelHeader onClose={() => setSelectedNodeId(lensId, null)} />

      <form
        onSubmit={applyLabel}
        className="px-3 py-2 border-b border-border/20 flex flex-col gap-1"
      >
        <label
          className="text-[10px] uppercase tracking-widest text-muted-foreground"
          htmlFor="acw-prop-label"
        >
          {FIELD_LABEL}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="acw-prop-label"
            data-testid="acw-studio-properties-label-input"
            type="text"
            className="flex-1 px-2 py-1 text-xs rounded border border-border/60 bg-background"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
          />
          <button
            type="submit"
            data-testid="acw-studio-properties-label-apply"
            className="text-[10px] uppercase tracking-widest px-2 py-1 rounded border border-border/60 disabled:opacity-40 hover:text-primary hover:border-primary/60 transition-colors"
            disabled={labelDraft.length === 0 || labelDraft === node.label}
          >
            {APPLY_LABEL}
          </button>
        </div>
      </form>

      <TextField
        id="acw-prop-description"
        label={FIELD_DESCRIPTION}
        value={descDraft}
        currentPersisted={node.description ?? ""}
        onChange={setDescDraft}
        onApply={() => applyText("description", descDraft)}
        onClear={() => {
          setDescDraft("");
          applyText("description", "");
        }}
        testIdPrefix="acw-studio-properties-description"
      />

      <TextField
        id="acw-prop-owner"
        label={FIELD_OWNER}
        value={ownerDraft}
        currentPersisted={node.owner ?? ""}
        onChange={setOwnerDraft}
        onApply={() => applyText("owner", ownerDraft)}
        onClear={() => {
          setOwnerDraft("");
          applyText("owner", "");
        }}
        testIdPrefix="acw-studio-properties-owner"
      />

      <EnumField
        label={FIELD_STATUS}
        value={node.status ?? ""}
        options={ACW_NODE_STATUSES.map((v) => ({
          value: v,
          label: ACW_NODE_STATUS_LABEL[v],
        }))}
        onChange={(v) => setEnum("status", v)}
        testIdPrefix="acw-studio-properties-status"
      />
      <EnumField
        label={FIELD_MATURITY}
        value={node.maturity ?? ""}
        options={ACW_NODE_MATURITIES.map((v) => ({
          value: v,
          label: ACW_NODE_MATURITY_LABEL[v],
        }))}
        onChange={(v) => setEnum("maturity", v)}
        testIdPrefix="acw-studio-properties-maturity"
      />
      <EnumField
        label={FIELD_PRIORITY}
        value={node.priority ?? ""}
        options={ACW_NODE_PRIORITIES.map((v) => ({
          value: v,
          label: ACW_NODE_PRIORITY_LABEL[v],
        }))}
        onChange={(v) => setEnum("priority", v)}
        testIdPrefix="acw-studio-properties-priority"
      />

      <section className="px-3 py-2 border-t border-border/20 flex flex-col gap-1">
        <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {INCIDENT_TITLE}
        </h4>
        {incidentEdges.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">{NO_EDGES}</p>
        ) : (
          <ul
            className="flex flex-col gap-1"
            data-testid="acw-studio-properties-incident-edges"
          >
            {incidentEdges.map((e) => {
              const otherId = e.fromId === node.id ? e.toId : e.fromId;
              const other = ws.structureGraph.nodes.find(
                (n) => n.id === otherId,
              );
              const direction = e.fromId === node.id ? CONNECT_TO : CONNECT_FROM;
              return (
                <li
                  key={e.id}
                  data-testid={`acw-studio-properties-incident-edge-${e.id}`}
                  className="flex items-center justify-between gap-2 text-[11px] font-mono"
                >
                  <span className="truncate">
                    <span className="text-muted-foreground">{direction} </span>
                    <span className="text-foreground">
                      {other?.label ?? otherId}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const r = deleteEdge(e.id);
                      if (!r.ok) publishRefusal(r.reason);
                    }}
                    title={DELETE_LABEL}
                    aria-label={DELETE_LABEL}
                    data-testid={`acw-studio-properties-incident-edge-delete-${e.id}`}
                    className="p-1 rounded border border-border/60 hover:text-destructive hover:border-destructive/60 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

// EAStudio Phase 2 — right-side Properties panel.
//
// Reads the lens-keyed `selectedNodeIdByLens` slice and renders an
// editor for the optional descriptive node fields:
//
//   - label        (renamed via `renameNode`)
//   - description  (text)
//   - owner        (text, displayed as "Maintainer")
//   - status       (closed enum dropdown)
//   - maturity     (closed enum dropdown)
//   - priority     (closed enum dropdown, displayed as "Tier")
//
// It also lists the incident CONNECTS edges for the selected node
// and offers a per-edge delete affordance. All mutations route
// through the validator-gated store API; refusals publish on
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
//   - `@/components/ui` primitives only for buttons, inputs, and
//     labels. (No raw `<input>` / `<button>` outside this file's
//     `<select>`, which has no shadcn equivalent in the project's
//     UI kit and is styled to match the Input primitive's class
//     vocabulary.)
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Vocabulary "permitted" not "allowed".
//   - Debounced auto-commit (~350ms) — no Apply / Clear buttons.
//     Empty drafts unset the field via `updateNodeProperties(...,
//     null)`. Local draft state is re-seeded whenever the selection
//     changes so a stale debounce timer cannot clobber a freshly
//     loaded node's values.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
// field on `AcwNode` is still `priority` and the enum values keep
// their programmatic names. Only the user-facing label changes.
const FIELD_PRIORITY = "Tier";
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
  NONE_LABEL,
  INCIDENT_TITLE,
  NO_EDGES,
  CONNECT_FROM,
  CONNECT_TO,
  DELETE_LABEL,
  CLOSE_LABEL,
]);

// Debounce delay (ms) between the user's last keystroke and the
// validator-gated commit. Chosen at the documented ~350ms band so
// fast typists do not see refusal flicker, but mid-pause commits
// feel "live". Per-field timers are independent.
const DEBOUNCE_MS = 350;

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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={CLOSE_LABEL}
          data-testid="acw-studio-properties-close"
          className="h-6 w-6"
        >
          <X className="w-3 h-3" />
        </Button>
      ) : null}
    </header>
  );
}

interface DebouncedTextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  testIdPrefix: string;
}

// Pure controlled-input wrapper around the shared Input primitive.
// The debounced commit lives in the parent so the timer can be
// reset when the selection changes (otherwise a stale timer from a
// previous selection would commit against the wrong node).
function DebouncedTextField(p: DebouncedTextFieldProps) {
  return (
    <div className="px-3 py-2 border-b border-border/20 flex flex-col gap-1">
      <Label
        htmlFor={p.id}
        className="text-[10px] uppercase tracking-widest text-muted-foreground"
      >
        {p.label}
      </Label>
      <Input
        id={p.id}
        type="text"
        className="h-8 text-xs"
        value={p.value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
        data-testid={`${p.testIdPrefix}-input`}
      />
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
  // No <Select> primitive in the project's UI kit — keeping the
  // native <select> element gates accessibility/keyboard semantics
  // for free, and is styled to match the Input primitive.
  return (
    <div className="px-3 py-2 border-b border-border/20 flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {p.label}
      </Label>
      <select
        className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
  // Re-seeded whenever the selection or persisted bytes change. The
  // debounced commit (below) is what actually fires the validator-
  // gated mutation.
  const [labelDraft, setLabelDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [ownerDraft, setOwnerDraft] = useState("");
  // Per-field skip token, keyed by node id. The seeding effect
  // stamps the freshly-selected node's id into each field slot;
  // the corresponding debounced commit effect refuses to commit
  // (and clears its slot) the first time it sees a node id that
  // matches a stamped token. This pattern is robust against React
  // effect-flush ordering: every field maintains its own gate, so
  // a shared boolean cannot be consumed by the wrong effect and
  // let a stale draft from a previous selection commit against the
  // newly-selected node. Empty string means "no skip pending for
  // this field".
  const skipFieldRef = useRef<{ label: string; desc: string; owner: string }>({
    label: "",
    desc: "",
    owner: "",
  });

  useEffect(() => {
    if (node === null) {
      skipFieldRef.current = { label: "", desc: "", owner: "" };
      setLabelDraft("");
      setDescDraft("");
      setOwnerDraft("");
      return;
    }
    // Stamp every field slot with the new node id so each commit
    // effect's first run for this node is a no-op. The stamps are
    // independently consumed below.
    skipFieldRef.current = {
      label: node.id,
      desc: node.id,
      owner: node.id,
    };
    setLabelDraft(node.label);
    setDescDraft(node.description ?? "");
    setOwnerDraft(node.owner ?? "");
  }, [node?.id, node?.label, node?.description, node?.owner]);

  // Debounced commit — label. Empty draft is a no-op (rename
  // requires a non-empty label). The validator surfaces refusals
  // verbatim through the refusal channel.
  useEffect(() => {
    if (node === null) return;
    if (skipFieldRef.current.label === node.id) {
      skipFieldRef.current.label = "";
      return;
    }
    if (labelDraft.length === 0 || labelDraft === node.label) return;
    const handle = window.setTimeout(() => {
      const r = renameNode(node.id, labelDraft);
      if (!r.ok) publishRefusal(r.reason);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [labelDraft, node?.id, node?.label]);

  // Debounced commit — description. Empty draft unsets the field.
  useEffect(() => {
    if (node === null) return;
    if (skipFieldRef.current.desc === node.id) {
      skipFieldRef.current.desc = "";
      return;
    }
    const persisted = node.description ?? "";
    if (descDraft === persisted) return;
    const handle = window.setTimeout(() => {
      const r = updateNodeProperties(node.id, {
        description: descDraft.length === 0 ? null : descDraft,
      });
      if (!r.ok) publishRefusal(r.reason);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [descDraft, node?.id, node?.description]);

  // Debounced commit — owner. Empty draft unsets the field.
  useEffect(() => {
    if (node === null) return;
    if (skipFieldRef.current.owner === node.id) {
      skipFieldRef.current.owner = "";
      return;
    }
    const persisted = node.owner ?? "";
    if (ownerDraft === persisted) return;
    const handle = window.setTimeout(() => {
      const r = updateNodeProperties(node.id, {
        owner: ownerDraft.length === 0 ? null : ownerDraft,
      });
      if (!r.ok) publishRefusal(r.reason);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [ownerDraft, node?.id, node?.owner]);

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

      <DebouncedTextField
        id="acw-prop-label"
        label={FIELD_LABEL}
        value={labelDraft}
        onChange={setLabelDraft}
        testIdPrefix="acw-studio-properties-label"
      />

      <DebouncedTextField
        id="acw-prop-description"
        label={FIELD_DESCRIPTION}
        value={descDraft}
        onChange={setDescDraft}
        testIdPrefix="acw-studio-properties-description"
      />

      <DebouncedTextField
        id="acw-prop-owner"
        label={FIELD_OWNER}
        value={ownerDraft}
        onChange={setOwnerDraft}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const r = deleteEdge(e.id);
                      if (!r.ok) publishRefusal(r.reason);
                    }}
                    title={DELETE_LABEL}
                    aria-label={DELETE_LABEL}
                    data-testid={`acw-studio-properties-incident-edge-delete-${e.id}`}
                    className="h-6 w-6 hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

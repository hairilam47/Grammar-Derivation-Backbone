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
// Visual styling notes (Task #99):
//   - All chrome is rendered with the prototype-aligned `es-props-*`
//     class set defined in `.eastudio-root` scoped CSS. The panel
//     occupies the third column of the `.es-body` grid (the grid
//     itself owns the 280px width); when nothing is selected the
//     component returns null and the grid switches to a two-column
//     layout via `data-properties="hidden"`.
//
// Constitutional discipline:
//   - Lucide icons only.
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
  getLensLayers,
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
  isAcwNodeMaturity,
  isAcwNodePriority,
  isAcwNodeStatus,
  type AcwNodeMaturity,
  type AcwNodePriority,
  type AcwNodeStatus,
} from "@/acw/acwNodeProperties";
import {
  createOu,
  listOus,
  removeOu,
  subscribeOus,
} from "@/acw/orgUnits/ouStore";

const PANEL_TITLE = "Properties";
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
// EAStudio Path B Phase 3 — categorical organisational-unit
// overlay. Field label and the two action buttons live alongside
// the existing enum dropdowns; the OU registry is a separate
// store so adding / removing units does NOT mutate the workspace
// graph (clearing assignments is a cascade in `removeOu`, gated
// by the same validator as every other node mutation).
const FIELD_ORG_UNIT = "Organisational unit";
const ADD_UNIT_LABEL = "Add unit";
const REMOVE_LABEL = "Remove";
const ADD_UNIT_PROMPT = "Name of the new unit";
const REMOVE_CONFIRM = "Remove this unit? Nodes carrying it will be cleared.";
const NONE_LABEL = "Not specified";
// Canvas Enhancements — layer assignment field.
const FIELD_LAYERS = "Layers";
const LAYERS_NONE_NOTICE = "No layers defined for this lens.";
const INCIDENT_TITLE = "Incident connections";
const NO_EDGES = "No connections incident to this node.";
const CONNECT_FROM = "from";
const CONNECT_TO = "to";
const DELETE_LABEL = "Delete";
const CLOSE_LABEL = "Close";

assertAllAcwPlaceholderLanguage([
  PANEL_TITLE,
  SEALED_NOTICE,
  FIELD_LABEL,
  FIELD_DESCRIPTION,
  FIELD_OWNER,
  FIELD_STATUS,
  FIELD_MATURITY,
  FIELD_PRIORITY,
  FIELD_ORG_UNIT,
  ADD_UNIT_LABEL,
  REMOVE_LABEL,
  ADD_UNIT_PROMPT,
  REMOVE_CONFIRM,
  NONE_LABEL,
  FIELD_LAYERS,
  LAYERS_NONE_NOTICE,
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
    <header className="es-props-head">
      <h3 className="es-props-title">{PANEL_TITLE}</h3>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={CLOSE_LABEL}
          data-testid="acw-studio-properties-close"
          className="es-props-close"
        >
          <X className="w-3 h-3" />
        </button>
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

// Pure controlled-input wrapper around the prototype-styled
// `es-props-input`. The debounced commit lives in the parent so
// the timer can be reset when the selection changes (otherwise a
// stale timer from a previous selection would commit against the
// wrong node).
function DebouncedTextField(p: DebouncedTextFieldProps) {
  return (
    <div className="es-props-field">
      <label htmlFor={p.id} className="es-props-label">
        {p.label}
      </label>
      <input
        id={p.id}
        type="text"
        className="es-props-input"
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
  return (
    <div className="es-props-field">
      <label className="es-props-label">{p.label}</label>
      <select
        className="es-props-select"
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
  // Phase 3 — re-render when the OU registry mutates so the
  // dropdown options and the disabled state of the Remove button
  // track Add / Remove / rename in real time.
  const [ouTick, setOuTick] = useState(0);
  useEffect(() => subscribeOus(() => setOuTick((t) => t + 1)), []);
  void ouTick;

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
    // Conditional mount: when nothing is selected the panel is
    // not rendered at all, so the four-domain grid uses the full
    // width. Selecting a node remounts the panel in the editing
    // (or sealed-notice) state below. This matches the Phase 2
    // UX contract — "the panel opens on selection" — rather than
    // standing as a persistent empty-state aside.
    return null;
  }

  if (node.isDomainContainer === true) {
    return (
      <aside
        data-testid="acw-studio-properties-panel"
        data-state="sealed"
        data-node-id={node.id}
        className="es-props"
      >
        <PanelHeader onClose={() => setSelectedNodeId(lensId, null)} />
        <p className="es-props-sealed">{SEALED_NOTICE}</p>
      </aside>
    );
  }

  // Per-field, fully-typed enum commit helpers. Each one builds a
  // discriminated `UpdateNodePropertiesRequest` whose key is known
  // statically, so the request literal type matches the store's
  // signature with no `as` cast and no widening. The empty string
  // sentinel from the native <select> maps to `null` (clear the
  // field). Unknown / corrupt enum values from the DOM are refused
  // locally — the predicate below is the same one the validator
  // uses, so the failure mode (no-op + refusal) is consistent.
  function commitStatus(value: string) {
    if (node === null) return;
    if (value === "") {
      const r = updateNodeProperties(node.id, { status: null });
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    if (!isAcwNodeStatus(value)) {
      publishRefusal(
        `The status value "${value}" is not a permitted enum member.`,
      );
      return;
    }
    const next: AcwNodeStatus = value;
    const r = updateNodeProperties(node.id, { status: next });
    if (!r.ok) publishRefusal(r.reason);
  }
  function commitMaturity(value: string) {
    if (node === null) return;
    if (value === "") {
      const r = updateNodeProperties(node.id, { maturity: null });
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    if (!isAcwNodeMaturity(value)) {
      publishRefusal(
        `The maturity value "${value}" is not a permitted enum member.`,
      );
      return;
    }
    const next: AcwNodeMaturity = value;
    const r = updateNodeProperties(node.id, { maturity: next });
    if (!r.ok) publishRefusal(r.reason);
  }
  function commitPriority(value: string) {
    if (node === null) return;
    if (value === "") {
      const r = updateNodeProperties(node.id, { priority: null });
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    if (!isAcwNodePriority(value)) {
      publishRefusal(
        `The priority value "${value}" is not a permitted enum member.`,
      );
      return;
    }
    const next: AcwNodePriority = value;
    const r = updateNodeProperties(node.id, { priority: next });
    if (!r.ok) publishRefusal(r.reason);
  }
  // Phase 3 — bind / unbind the node's organisationalUnitId. The
  // empty-string sentinel from the native <select> maps to `null`
  // (clear). The store's validator owns id existence; an unknown
  // id is refused there, not pre-validated here.
  function commitOrgUnit(value: string) {
    if (node === null) return;
    const r = updateNodeProperties(node.id, {
      organisationalUnitId: value === "" ? null : value,
    });
    if (!r.ok) publishRefusal(r.reason);
  }
  // Phase 3 — Add unit. Uses window.prompt for the name; the
  // store's validator rejects empty / whitespace-only names. We
  // only auto-bind the new id to the currently-selected node when
  // the create succeeded.
  function onAddUnit() {
    if (typeof window === "undefined" || node === null) return;
    const raw = window.prompt(ADD_UNIT_PROMPT, "");
    if (raw === null) return;
    const name = raw.trim();
    if (name.length === 0) return;
    const r = createOu({ name });
    if (!r.ok) {
      publishRefusal(r.reason);
      return;
    }
    const bind = updateNodeProperties(node.id, {
      organisationalUnitId: r.id,
    });
    if (!bind.ok) publishRefusal(bind.reason);
  }
  // Phase 3 — Remove the currently-bound unit from the registry.
  // Cascade-clears every node whose `organisationalUnitId` matched,
  // and reassigns child units' parentId. Disabled when the node has
  // no OU bound.
  function onRemoveUnit() {
    if (typeof window === "undefined" || node === null) return;
    const id = node.organisationalUnitId;
    if (id === undefined) return;
    const ok = window.confirm(REMOVE_CONFIRM);
    if (!ok) return;
    const r = removeOu(id);
    if (!r.ok) publishRefusal(r.reason);
  }

  // Canvas Enhancements — layer assignment for this node.
  const lensLayers = getLensLayers(lensId);

  function commitLayerToggle(layerId: string) {
    if (node === null) return;
    const current = node.layerIds ?? [];
    const checked = current.includes(layerId);
    const next = checked
      ? current.filter((id) => id !== layerId)
      : [...current, layerId];
    const r = updateNodeProperties(node.id, {
      layerIds: next.length === 0 ? null : next,
    });
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
      className="es-props"
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
        onChange={commitStatus}
        testIdPrefix="acw-studio-properties-status"
      />
      <EnumField
        label={FIELD_MATURITY}
        value={node.maturity ?? ""}
        options={ACW_NODE_MATURITIES.map((v) => ({
          value: v,
          label: ACW_NODE_MATURITY_LABEL[v],
        }))}
        onChange={commitMaturity}
        testIdPrefix="acw-studio-properties-maturity"
      />
      <EnumField
        label={FIELD_PRIORITY}
        value={node.priority ?? ""}
        options={ACW_NODE_PRIORITIES.map((v) => ({
          value: v,
          label: ACW_NODE_PRIORITY_LABEL[v],
        }))}
        onChange={commitPriority}
        testIdPrefix="acw-studio-properties-priority"
      />

      {/*
        Phase 3 — categorical OU overlay binding. The dropdown lists
        every unit currently in the registry; selecting "Not specified" clears the field.
        Add unit prompts for a name and immediately binds it; Remove
        is disabled unless the node currently carries an OU id.
      */}
      <div
        className="es-props-field"
        data-testid="acw-studio-properties-ou-field"
      >
        <label className="es-props-label">{FIELD_ORG_UNIT}</label>
        <select
          className="es-props-select"
          value={node.organisationalUnitId ?? ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            commitOrgUnit(e.target.value)
          }
          data-testid="acw-studio-properties-ou-select"
        >
          <option value="">{NONE_LABEL}</option>
          {/*
            Phase 3 — sort the OU options alphabetically by name so
            the dropdown order is stable and human-scannable
            regardless of registry insertion order. Sort uses the
            user's locale and is case-insensitive (`sensitivity:
            "base"`) to match the rest of the panel's textual UX.
          */}
          {[...listOus()]
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            )
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
        <div
          className="es-props-ou-actions"
          style={{ display: "flex", gap: 6, marginTop: 4 }}
        >
          <button
            type="button"
            className="es-cnode-btn"
            onClick={onAddUnit}
            data-testid="acw-studio-properties-ou-add"
          >
            {ADD_UNIT_LABEL}
          </button>
          <button
            type="button"
            className="es-cnode-btn"
            data-tone="danger"
            disabled={node.organisationalUnitId === undefined}
            onClick={onRemoveUnit}
            data-testid="acw-studio-properties-ou-remove"
          >
            {REMOVE_LABEL}
          </button>
        </div>
      </div>

      {/*
        Canvas Enhancements — layer membership multi-select.
        Lists every layer defined on the current lens; each row is
        a checkbox so the user can assign the node to multiple layers.
        When no layers have been defined yet the field shows a brief
        notice instead of an empty checkbox list.
      */}
      <div
        className="es-props-field"
        data-testid="acw-studio-properties-layers-field"
      >
        <label className="es-props-label">{FIELD_LAYERS}</label>
        {lensLayers.length === 0 ? (
          <p
            className="es-mono"
            style={{
              fontSize: 10,
              color: "var(--text2)",
              fontStyle: "italic",
              margin: 0,
            }}
          >
            {LAYERS_NONE_NOTICE}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {lensLayers.map((layer) => {
              const checked = (node.layerIds ?? []).includes(layer.id);
              return (
                <label
                  key={layer.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                  data-testid={`acw-studio-properties-layer-row-${layer.id}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => commitLayerToggle(layer.id)}
                    data-testid={`acw-studio-properties-layer-checkbox-${layer.id}`}
                  />
                  <span>{layer.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <section className="es-props-section">
        <h4>{INCIDENT_TITLE}</h4>
        {incidentEdges.length === 0 ? (
          <p
            className="es-mono"
            style={{
              fontSize: 10,
              color: "var(--text2)",
              fontStyle: "italic",
              margin: 0,
            }}
          >
            {NO_EDGES}
          </p>
        ) : (
          <ul
            data-testid="acw-studio-properties-incident-edges"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
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
                  className="es-props-edge"
                >
                  <span
                    className="es-props-edge-other"
                    style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}
                  >
                    <span className="es-props-edge-dir">{direction}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
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
                    className="es-cnode-btn"
                    data-tone="danger"
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

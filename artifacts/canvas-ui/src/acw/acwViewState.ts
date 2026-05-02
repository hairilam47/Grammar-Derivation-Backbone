// ACW v2/v3 — per-lens visual view-state (collapse / expand + 2D/3D mode).
//
// View-state is *not* part of the canonical workspace document.
// Master prompt §11 (grammar always wins over visuals) and the v2
// task brief require collapse / expand to leave the underlying
// `structureGraph` untouched. v3 adds a per-lens 2D/3D viewing
// mode to this same slice — the mode is also a visual-only choice
// and must never appear in the canonical workspace.
//
// Persisting view-state alongside (not inside) the workspace makes
// that separation a build-time fact rather than a habit:
//   - Two distinct localStorage keys: `acw.workspace.v1` for the
//     graph, `acw.workspace.view.v1` for the view-state.
//   - Two distinct schema versions: `acw-1.0` and `acw-view-1.0`.
//   - Two distinct allow-lists. The view-state allow-list contains
//     no graph fields (`nodes`, `edges`, `parentId`, etc.); the
//     read-validator drops the document if a future commit slips a
//     graph field in.
//
// v3 schema-version note: adding `viewModeByLens` is a strictly
// additive optional field on `acw-view-1.0`. Documents persisted by
// v2 (which lack the field) still read cleanly — the validator
// treats absence as "no per-lens mode set" and `getViewMode` then
// returns the default ("2d"). No "acw-view-2.0" version is
// introduced; per the task brief, v3 introduces no new schema.
import { assertAllAcwPlaceholderLanguage } from "../governance/staticTextGuard";
import {
  isAcwDomainTag,
  isAcwLodLevel,
  type AcwDomainTag,
  type AcwLodLevel,
} from "./acwGrammar";

import {
  resolveActiveKey,
  currentScope,
} from "@/governance/storageKeyUtils";
import {
  readScoped,
  writeScoped,
  onScopeOrHydrationChange,
  __resetScopedStorageForTest,
} from "@/governance/scopedStorageClient";

export const ACW_VIEW_SCHEMA_VERSION = "acw-view-1.0" as const;
// Phase 2 (SaaS Onboarding) — Org+WorkItem scope.
export const BASE_STORAGE_KEY = "acw.workspace.view.v1";

function getStorageKey(): string | null {
  return resolveActiveKey(BASE_STORAGE_KEY, true);
}

export type AcwLensViewMode = "2d" | "3d";
const ALLOWED_VIEW_MODES: readonly AcwLensViewMode[] = ["2d", "3d"];
const DEFAULT_VIEW_MODE: AcwLensViewMode = "2d";

// EAStudio Phase 1 — default active domain when a lens has no
// previously-recorded selection. Pure UI default; the validator and
// the workspace document have no opinion about it.
const DEFAULT_DOMAIN: AcwDomainTag = "business";

// Per-lens view-state. Lens identity = the lens path (e.g.
// "/workspace/landscape").
//   - collapseByLens: which container ids are collapsed in this lens.
//   - viewModeByLens: which canvas mode (2D or 3D) the lens displays.
//   - currentDomainByLens (EAStudio Phase 1): which of the four
//     EAStudio domains is active in this lens (controls the palette
//     contents and the highlighted domain container). Optional and
//     absent on every pre-EAStudio document; absence reads as the
//     DEFAULT_DOMAIN.
// All three are visual-only; none references workspace content.
export interface AcwViewState {
  readonly schemaVersion: typeof ACW_VIEW_SCHEMA_VERSION;
  readonly collapseByLens: Readonly<Record<string, readonly string[]>>;
  readonly viewModeByLens: Readonly<Record<string, AcwLensViewMode>>;
  readonly currentDomainByLens: Readonly<Record<string, AcwDomainTag>>;
  // EAStudio Phase 2 — visual-only interactive editing slices.
  // Three additive optional fields, all keyed by lens id:
  //   - connectModeByLens: which lenses currently have Connect-mode
  //     toggled on. A lens not present in the map is in Design mode
  //     (the default). Connect-mode is purely a UI affordance —
  //     mutations still flow through `createEdge`, which the
  //     validator gates.
  //   - connectPendingSourceByLens: while the user is composing a
  //     CONNECTS edge, the id of the source node they clicked
  //     first. Cleared on completion or cancel. Storing this in
  //     view-state lets the click-source / click-destination
  //     interaction survive a re-render without losing the
  //     in-flight pick.
  //   - selectedNodeIdByLens: which node the Properties panel is
  //     currently editing in this lens. Selection is per-lens so
  //     two lenses can edit different nodes simultaneously without
  //     clobbering each other.
  // All three are absent on every pre-Phase-2 document; absence
  // reads as the documented default (Design mode, no pending
  // source, no selection).
  readonly connectModeByLens?: Readonly<Record<string, boolean>>;
  readonly connectPendingSourceByLens?: Readonly<Record<string, string>>;
  readonly selectedNodeIdByLens?: Readonly<Record<string, string>>;
  // EAStudio Phase 2 — selected CONNECTS edge per lens. Drives
  // the in-canvas "Delete?" confirm pill so the user can remove
  // a connection by clicking (or right-clicking) its path. Same
  // visual-only discipline as the other Phase 2 slices: absent
  // entries read as "no edge selected", and a selection never
  // mutates the workspace until the user confirms the delete.
  readonly selectedEdgeIdByLens?: Readonly<Record<string, string>>;
  // EAStudio Phase 3 — top-bar view-tab per lens. Drives which
  // sub-surface the Studio shell renders: "design" (the four-
  // domain authoring canvas from Phases 1+2), "matrix" (the
  // node × node CONNECTS toggle table), or "export" (the
  // JSON/CSV preview + download surface). Optional, additive,
  // and lens-keyed in line with the other Phase-2/3 slices;
  // absence reads as DEFAULT_VIEW_TAB ("design") so the
  // existing canvas remains the landing surface for every
  // pre-Phase-3 document.
  readonly viewTabByLens?: Readonly<Record<string, AcwStudioViewTab>>;
  // EAStudio Phase 2 (LoS framework) — per-lens active Level of
  // Specification. The Studio top bar L1 / L2 / L3 buttons toggle
  // this slice; the Studio canvas reads it to decide whether to
  // render the 2D authoring surface (L1/L2) or the full-screen
  // 3D structural canvas (L3). Optional, additive, lens-keyed in
  // line with every other Phase 2 slice; absence reads as the
  // documented default (L2 — the existing 2D canvas), so every
  // pre-Phase-2 document stays on its current surface.
  readonly activeLodByLens?: Readonly<Record<string, AcwLodLevel>>;
  // EAStudio Path B Phase 3 — Organisational Unit overlay toggle
  // per lens. When `true`, the Studio canvas tints each node with
  // a categorical hue derived from its `organisationalUnitId`
  // binding so the user can scan the layout for ownership at a
  // glance. The toggle is pure visual state and never touches the
  // workspace document or the OU registry. Mirrors the
  // `connectModeByLens` shape (boolean values) so the validator
  // stays one-line-per-slice. Optional and absent on every pre-
  // Phase-3 document; absence reads as `false` (overlay off).
  readonly showOrgOverlayByLens?: Readonly<Record<string, boolean>>;
  // Canvas Enhancements — per-lens named layer definitions and
  // visibility flags. Each lens gets an optional slice describing
  // its user-defined layers; nodes opt in by listing layer ids in
  // their `layerIds` field. Absence of this field (pre-enhancement
  // documents) reads as "no layers defined". The schema version
  // stays `acw-view-1.0` — the field is purely additive.
  readonly layersByLens?: Readonly<Record<string, AcwLensLayerSlice>>;
}

// Canvas Enhancements — per-lens layer types.
export interface AcwLayerDef {
  readonly id: string;
  readonly name: string;
}

export interface AcwLensLayerSlice {
  readonly definitions: readonly AcwLayerDef[];
  readonly visibility: Readonly<Record<string, boolean>>;
}

// EAStudio Phase 3 — top-bar tab values. Closed set; the read-
// validator rejects unknown literals so a future caller cannot
// smuggle a fourth tab in via a hand-edited document.
export const ACW_STUDIO_VIEW_TABS = [
  "design",
  "matrix",
  "export",
] as const;
export type AcwStudioViewTab = (typeof ACW_STUDIO_VIEW_TABS)[number];
const DEFAULT_VIEW_TAB: AcwStudioViewTab = "design";

export function isAcwStudioViewTab(value: unknown): value is AcwStudioViewTab {
  return (
    typeof value === "string" &&
    (ACW_STUDIO_VIEW_TABS as readonly string[]).includes(value)
  );
}

const ALLOWED_TOP = [
  "schemaVersion",
  "collapseByLens",
  "viewModeByLens",
  "currentDomainByLens",
  "connectModeByLens",
  "connectPendingSourceByLens",
  "selectedNodeIdByLens",
  "selectedEdgeIdByLens",
  "viewTabByLens",
  "activeLodByLens",
  "showOrgOverlayByLens",
  // Canvas Enhancements — per-lens layer definitions and visibility.
  "layersByLens",
] as const;

function emptyView(): AcwViewState {
  return Object.freeze({
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: Object.freeze({}),
    viewModeByLens: Object.freeze({}),
    currentDomainByLens: Object.freeze({}),
    connectModeByLens: Object.freeze({}),
    connectPendingSourceByLens: Object.freeze({}),
    selectedNodeIdByLens: Object.freeze({}),
    selectedEdgeIdByLens: Object.freeze({}),
    viewTabByLens: Object.freeze({}),
    activeLodByLens: Object.freeze({}),
    showOrgOverlayByLens: Object.freeze({}),
    layersByLens: Object.freeze({}),
  });
}

function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      throw new Error(
        `ACW view-state ${context} contains forbidden field "${k}". Permitted fields: ${allowed.join(", ")}.`,
      );
    }
  }
}

function assertValid(raw: unknown): asserts raw is AcwViewState {
  if (raw === null || typeof raw !== "object") {
    throw new Error("ACW view-state must be an object.");
  }
  const r = raw as Record<string, unknown>;
  assertAllowedKeys(r, ALLOWED_TOP, "document");
  if (r.schemaVersion !== ACW_VIEW_SCHEMA_VERSION) {
    throw new Error(
      `ACW view-state schemaVersion must be "${ACW_VIEW_SCHEMA_VERSION}". Got: ${JSON.stringify(r.schemaVersion)}.`,
    );
  }
  if (r.collapseByLens === null || typeof r.collapseByLens !== "object") {
    throw new Error("ACW view-state collapseByLens must be an object.");
  }
  const map = r.collapseByLens as Record<string, unknown>;
  for (const [lensId, ids] of Object.entries(map)) {
    if (typeof lensId !== "string" || lensId.length === 0) {
      throw new Error("ACW view-state lens id must be a non-empty string.");
    }
    if (!Array.isArray(ids)) {
      throw new Error("ACW view-state collapse list must be an array.");
    }
    for (const id of ids) {
      if (typeof id !== "string" || id.length === 0) {
        throw new Error("ACW view-state collapse list entries must be non-empty strings.");
      }
    }
  }
  // viewModeByLens is optional for backward compat with v2-persisted
  // documents. When present it must be an object with string lens
  // ids and "2d" | "3d" values.
  if (r.viewModeByLens !== undefined) {
    if (r.viewModeByLens === null || typeof r.viewModeByLens !== "object") {
      throw new Error("ACW view-state viewModeByLens must be an object.");
    }
    const vm = r.viewModeByLens as Record<string, unknown>;
    for (const [lensId, mode] of Object.entries(vm)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (typeof mode !== "string" || !ALLOWED_VIEW_MODES.includes(mode as AcwLensViewMode)) {
        throw new Error(
          `ACW view-state viewModeByLens value must be one of ${ALLOWED_VIEW_MODES.join(" | ")}. Got: ${JSON.stringify(mode)}.`,
        );
      }
    }
  }
  // EAStudio Phase 1 — currentDomainByLens. Optional for backward
  // compat with v2/v3-persisted documents. When present it must be
  // an object with string lens ids and AcwDomainTag values.
  if (r.currentDomainByLens !== undefined) {
    if (
      r.currentDomainByLens === null ||
      typeof r.currentDomainByLens !== "object"
    ) {
      throw new Error("ACW view-state currentDomainByLens must be an object.");
    }
    const dm = r.currentDomainByLens as Record<string, unknown>;
    for (const [lensId, tag] of Object.entries(dm)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (!isAcwDomainTag(tag)) {
        throw new Error(
          "ACW view-state currentDomainByLens value must be one of: business, data, application, technology.",
        );
      }
    }
  }
  // EAStudio Phase 2 — connectModeByLens. Optional. When present
  // each value must be a strict boolean.
  if (r.connectModeByLens !== undefined) {
    if (r.connectModeByLens === null || typeof r.connectModeByLens !== "object") {
      throw new Error("ACW view-state connectModeByLens must be an object.");
    }
    const cm = r.connectModeByLens as Record<string, unknown>;
    for (const [lensId, on] of Object.entries(cm)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (typeof on !== "boolean") {
        throw new Error(
          "ACW view-state connectModeByLens values must be booleans.",
        );
      }
    }
  }
  // EAStudio Phase 2 — connectPendingSourceByLens. Optional. When
  // present each value must be a non-empty string (a node id).
  if (r.connectPendingSourceByLens !== undefined) {
    if (
      r.connectPendingSourceByLens === null ||
      typeof r.connectPendingSourceByLens !== "object"
    ) {
      throw new Error(
        "ACW view-state connectPendingSourceByLens must be an object.",
      );
    }
    const ps = r.connectPendingSourceByLens as Record<string, unknown>;
    for (const [lensId, sid] of Object.entries(ps)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (typeof sid !== "string" || sid.length === 0) {
        throw new Error(
          "ACW view-state connectPendingSourceByLens values must be non-empty strings.",
        );
      }
    }
  }
  // EAStudio Phase 2 — selectedNodeIdByLens. Optional. When present
  // each value must be a non-empty string (a node id).
  if (r.selectedNodeIdByLens !== undefined) {
    if (
      r.selectedNodeIdByLens === null ||
      typeof r.selectedNodeIdByLens !== "object"
    ) {
      throw new Error("ACW view-state selectedNodeIdByLens must be an object.");
    }
    const sm = r.selectedNodeIdByLens as Record<string, unknown>;
    for (const [lensId, nid] of Object.entries(sm)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (typeof nid !== "string" || nid.length === 0) {
        throw new Error(
          "ACW view-state selectedNodeIdByLens values must be non-empty strings.",
        );
      }
    }
  }
  // EAStudio Phase 3 — viewTabByLens. Optional. When present each
  // value must be one of the closed AcwStudioViewTab literals.
  // Mirrors the viewModeByLens shape but for the top-bar tab strip.
  if (r.viewTabByLens !== undefined) {
    if (r.viewTabByLens === null || typeof r.viewTabByLens !== "object") {
      throw new Error("ACW view-state viewTabByLens must be an object.");
    }
    const tm = r.viewTabByLens as Record<string, unknown>;
    for (const [lensId, tab] of Object.entries(tm)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (!isAcwStudioViewTab(tab)) {
        throw new Error(
          `ACW view-state viewTabByLens value must be one of ${ACW_STUDIO_VIEW_TABS.join(" | ")}. Got: ${JSON.stringify(tab)}.`,
        );
      }
    }
  }
  // EAStudio Phase 2 (LoS framework) — activeLodByLens. Optional.
  // When present each value must be one of the closed AcwLodLevel
  // literals (1, 2, or 3). Mirrors the viewTabByLens shape but
  // for the L1/L2/L3 toggle. Absent entries read as the documented
  // default (L2), so pre-Phase-2 documents stay on the existing
  // 2D canvas with no migration.
  if (r.activeLodByLens !== undefined) {
    if (r.activeLodByLens === null || typeof r.activeLodByLens !== "object") {
      throw new Error("ACW view-state activeLodByLens must be an object.");
    }
    const lm = r.activeLodByLens as Record<string, unknown>;
    for (const [lensId, level] of Object.entries(lm)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (!isAcwLodLevel(level)) {
        throw new Error(
          "ACW view-state activeLodByLens value must be one of 1 | 2 | 3.",
        );
      }
    }
  }
  // EAStudio Path B Phase 3 — showOrgOverlayByLens. Optional.
  // When present each value must be a strict boolean. Mirrors the
  // connectModeByLens validator branch; absence reads as "overlay
  // off" so pre-Phase-3 documents validate identically.
  if (r.showOrgOverlayByLens !== undefined) {
    if (
      r.showOrgOverlayByLens === null ||
      typeof r.showOrgOverlayByLens !== "object"
    ) {
      throw new Error("ACW view-state showOrgOverlayByLens must be an object.");
    }
    const om = r.showOrgOverlayByLens as Record<string, unknown>;
    for (const [lensId, on] of Object.entries(om)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (typeof on !== "boolean") {
        throw new Error(
          "ACW view-state showOrgOverlayByLens values must be booleans.",
        );
      }
    }
  }
  // EAStudio Phase 2 — selectedEdgeIdByLens. Optional. When present
  // each value must be a non-empty string (an edge id). Identical
  // shape to the node selection slice; absent entries mean "no edge
  // selected on this lens".
  if (r.selectedEdgeIdByLens !== undefined) {
    if (
      r.selectedEdgeIdByLens === null ||
      typeof r.selectedEdgeIdByLens !== "object"
    ) {
      throw new Error("ACW view-state selectedEdgeIdByLens must be an object.");
    }
    const em = r.selectedEdgeIdByLens as Record<string, unknown>;
    for (const [lensId, eid] of Object.entries(em)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (typeof eid !== "string" || eid.length === 0) {
        throw new Error(
          "ACW view-state selectedEdgeIdByLens values must be non-empty strings.",
        );
      }
    }
  }
  // Canvas Enhancements — layersByLens. Optional. When present it
  // must be an object whose values each contain a `definitions`
  // array of `{id, name}` pairs and a `visibility` boolean map.
  if (r.layersByLens !== undefined) {
    if (r.layersByLens === null || typeof r.layersByLens !== "object") {
      throw new Error("ACW view-state layersByLens must be an object.");
    }
    const lm = r.layersByLens as Record<string, unknown>;
    for (const [lensId, slice] of Object.entries(lm)) {
      if (typeof lensId !== "string" || lensId.length === 0) {
        throw new Error("ACW view-state lens id must be a non-empty string.");
      }
      if (slice === null || typeof slice !== "object") {
        throw new Error("ACW view-state layersByLens entry must be an object.");
      }
      const s = slice as Record<string, unknown>;
      if (!Array.isArray(s.definitions)) {
        throw new Error(
          "ACW view-state layersByLens.definitions must be an array.",
        );
      }
      for (const def of s.definitions as unknown[]) {
        if (def === null || typeof def !== "object") {
          throw new Error(
            "ACW view-state layer definition must be an object.",
          );
        }
        const d = def as Record<string, unknown>;
        if (typeof d.id !== "string" || d.id.length === 0) {
          throw new Error(
            "ACW view-state layer definition id must be a non-empty string.",
          );
        }
        if (typeof d.name !== "string" || d.name.length === 0) {
          throw new Error(
            "ACW view-state layer definition name must be a non-empty string.",
          );
        }
      }
      if (
        s.visibility === null ||
        typeof s.visibility !== "object" ||
        Array.isArray(s.visibility)
      ) {
        throw new Error(
          "ACW view-state layersByLens.visibility must be an object.",
        );
      }
      const v = s.visibility as Record<string, unknown>;
      for (const [layerId, vis] of Object.entries(v)) {
        if (typeof layerId !== "string" || layerId.length === 0) {
          throw new Error(
            "ACW view-state layer visibility key must be a non-empty string.",
          );
        }
        if (typeof vis !== "boolean") {
          throw new Error(
            "ACW view-state layer visibility value must be a boolean.",
          );
        }
      }
    }
  }
}

function isValid(raw: unknown): raw is AcwViewState {
  try {
    assertValid(raw);
    return true;
  } catch {
    return false;
  }
}

let cache: AcwViewState | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // intentional no-op: render-hook subscribers must not escalate.
    }
  }
}

function normalize(raw: AcwViewState): AcwViewState {
  // Backfill optional fields added by v3 / EAStudio Phase 1 / Phase 2
  // / Phase 3 for older persisted documents so callers never have to
  // null-check.
  return Object.freeze({
    schemaVersion: raw.schemaVersion,
    collapseByLens: raw.collapseByLens,
    viewModeByLens: raw.viewModeByLens ?? Object.freeze({}),
    currentDomainByLens: raw.currentDomainByLens ?? Object.freeze({}),
    connectModeByLens: raw.connectModeByLens ?? Object.freeze({}),
    connectPendingSourceByLens:
      raw.connectPendingSourceByLens ?? Object.freeze({}),
    selectedNodeIdByLens: raw.selectedNodeIdByLens ?? Object.freeze({}),
    selectedEdgeIdByLens: raw.selectedEdgeIdByLens ?? Object.freeze({}),
    viewTabByLens: raw.viewTabByLens ?? Object.freeze({}),
    activeLodByLens: raw.activeLodByLens ?? Object.freeze({}),
    showOrgOverlayByLens: raw.showOrgOverlayByLens ?? Object.freeze({}),
    layersByLens: raw.layersByLens ?? Object.freeze({}),
  });
}

function readFromStorage(): AcwViewState {
  const raw = readScoped(getStorageKey());
  if (raw === null) return emptyView();
  try {
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return emptyView();
    return normalize(parsed);
  } catch {
    return emptyView();
  }
}

function writeToStorage(state: AcwViewState): void {
  assertValid(state);
  const key = getStorageKey();
  if (key === null) return;
  writeScoped(key, JSON.stringify(state));
}

if (typeof window !== "undefined") {
  onScopeOrHydrationChange(() => {
    cache = null;
    notify();
  });
}

export function getViewState(): AcwViewState {
  if (cache === null) cache = readFromStorage();
  return cache;
}

export function subscribeViewState(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function getCollapsedIds(lensId: string): readonly string[] {
  const map = getViewState().collapseByLens;
  return map[lensId] ?? Object.freeze([]);
}

export function isCollapsed(lensId: string, nodeId: string): boolean {
  return getCollapsedIds(lensId).includes(nodeId);
}

export function toggleCollapsed(lensId: string, nodeId: string): void {
  const current = getCollapsedIds(lensId);
  const nextIds = current.includes(nodeId)
    ? current.filter((id) => id !== nodeId)
    : [...current, nodeId];
  const prev = getViewState();
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: Object.freeze({
      ...prev.collapseByLens,
      [lensId]: Object.freeze(nextIds),
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// v3 — per-lens 2D/3D viewing mode.
export function getViewMode(lensId: string): AcwLensViewMode {
  const map = getViewState().viewModeByLens;
  return map[lensId] ?? DEFAULT_VIEW_MODE;
}

export function setViewMode(lensId: string, mode: AcwLensViewMode): void {
  if (!ALLOWED_VIEW_MODES.includes(mode)) {
    throw new Error(
      `ACW view-state setViewMode rejected mode "${mode}". Permitted: ${ALLOWED_VIEW_MODES.join(" | ")}.`,
    );
  }
  const prev = getViewState();
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    viewModeByLens: Object.freeze({
      ...prev.viewModeByLens,
      [lensId]: mode,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Phase 1 — per-lens active domain. Pure UI state.
export function getCurrentDomain(lensId: string): AcwDomainTag {
  const map = getViewState().currentDomainByLens;
  return map[lensId] ?? DEFAULT_DOMAIN;
}

export function setCurrentDomain(lensId: string, tag: AcwDomainTag): void {
  if (!isAcwDomainTag(tag)) {
    throw new Error(
      `ACW view-state setCurrentDomain rejected tag "${String(tag)}". Permitted: business | data | application | technology.`,
    );
  }
  const prev = getViewState();
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    currentDomainByLens: Object.freeze({
      ...prev.currentDomainByLens,
      [lensId]: tag,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Phase 2 — Connect-mode toggle.
//
// Toggling Connect-mode off also clears any in-flight pending
// source for the same lens, so the next Design-mode click cannot
// accidentally complete a half-composed connection. The selection
// slice is intentionally NOT touched here: a user can flip Connect
// mode while still keeping the Properties panel pointed at the
// node they were last editing.
export function getConnectMode(lensId: string): boolean {
  const map = getViewState().connectModeByLens ?? {};
  return map[lensId] === true;
}

export function setConnectMode(lensId: string, on: boolean): void {
  const prev = getViewState();
  const prevMode = prev.connectModeByLens ?? {};
  const prevPending = prev.connectPendingSourceByLens ?? {};
  const nextMode: Record<string, boolean> = { ...prevMode };
  if (on) nextMode[lensId] = true;
  else delete nextMode[lensId];
  const nextPending: Record<string, string> = { ...prevPending };
  if (!on) delete nextPending[lensId];
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    connectModeByLens: Object.freeze(nextMode),
    connectPendingSourceByLens: Object.freeze(nextPending),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Phase 2 — pending-source for click-source-then-destination.
export function getConnectPendingSource(lensId: string): string | null {
  const map = getViewState().connectPendingSourceByLens ?? {};
  return map[lensId] ?? null;
}

export function setConnectPendingSource(
  lensId: string,
  nodeId: string | null,
): void {
  if (nodeId !== null && (typeof nodeId !== "string" || nodeId.length === 0)) {
    throw new Error(
      "ACW view-state setConnectPendingSource rejected an empty node id.",
    );
  }
  const prev = getViewState();
  const prevPending = prev.connectPendingSourceByLens ?? {};
  const nextPending: Record<string, string> = { ...prevPending };
  if (nodeId === null) delete nextPending[lensId];
  else nextPending[lensId] = nodeId;
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    connectPendingSourceByLens: Object.freeze(nextPending),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Phase 2 — selected node for the Properties panel.
export function getSelectedNodeId(lensId: string): string | null {
  const map = getViewState().selectedNodeIdByLens ?? {};
  return map[lensId] ?? null;
}

export function setSelectedNodeId(
  lensId: string,
  nodeId: string | null,
): void {
  if (nodeId !== null && (typeof nodeId !== "string" || nodeId.length === 0)) {
    throw new Error(
      "ACW view-state setSelectedNodeId rejected an empty node id.",
    );
  }
  const prev = getViewState();
  const prevSel = prev.selectedNodeIdByLens ?? {};
  const nextSel: Record<string, string> = { ...prevSel };
  if (nodeId === null) delete nextSel[lensId];
  else nextSel[lensId] = nodeId;
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    selectedNodeIdByLens: Object.freeze(nextSel),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Phase 2 — selected CONNECTS edge for the in-canvas
// "Delete?" confirm pill. Mirrors the node-selection slice exactly:
// click an edge to set, click again or press Esc to clear, confirm
// deletes via the validator-gated `deleteEdge` (no parallel store
// guard for sealed pairs since edges between two sealed nodes
// cannot exist in the first place).
export function getSelectedEdgeId(lensId: string): string | null {
  const map = getViewState().selectedEdgeIdByLens ?? {};
  return map[lensId] ?? null;
}

export function setSelectedEdgeId(
  lensId: string,
  edgeId: string | null,
): void {
  if (edgeId !== null && (typeof edgeId !== "string" || edgeId.length === 0)) {
    throw new Error(
      "ACW view-state setSelectedEdgeId rejected an empty edge id.",
    );
  }
  const prev = getViewState();
  const prevSel = prev.selectedEdgeIdByLens ?? {};
  const nextSel: Record<string, string> = { ...prevSel };
  if (edgeId === null) delete nextSel[lensId];
  else nextSel[lensId] = edgeId;
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    selectedEdgeIdByLens: Object.freeze(nextSel),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Phase 3 — top-bar tab selector.
//
// Pure UI state. Switching tabs swaps the rendered sub-surface in
// the Studio shell (Design canvas | Matrix | Export) and never
// touches the workspace document. The default ("design") matches
// the existing landing surface so every pre-Phase-3 lens reads
// identically to before.
export function getViewTab(lensId: string): AcwStudioViewTab {
  const map = getViewState().viewTabByLens ?? {};
  return map[lensId] ?? DEFAULT_VIEW_TAB;
}

export function setViewTab(lensId: string, tab: AcwStudioViewTab): void {
  if (!isAcwStudioViewTab(tab)) {
    throw new Error(
      `ACW view-state setViewTab rejected tab "${String(tab)}". Permitted: ${ACW_STUDIO_VIEW_TABS.join(" | ")}.`,
    );
  }
  const prev = getViewState();
  const prevTab = prev.viewTabByLens ?? {};
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    viewTabByLens: Object.freeze({ ...prevTab, [lensId]: tab }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Phase 2 (LoS framework) — per-lens active LoS.
//
// Pure UI state. The Studio top bar L1/L2/L3 buttons call
// `setActiveLod`; the Studio canvas reads `getActiveLod` to decide
// whether to render the 2D authoring surface (L1 / L2) or the
// full-screen 3D structural canvas (L3). The default (2) matches
// the existing landing surface so every pre-Phase-2 lens reads
// identically to before.
const DEFAULT_LOD: AcwLodLevel = 2;

export function getActiveLod(lensId: string): AcwLodLevel {
  const map = getViewState().activeLodByLens ?? {};
  return map[lensId] ?? DEFAULT_LOD;
}

export function setActiveLod(lensId: string, level: AcwLodLevel): void {
  if (!isAcwLodLevel(level)) {
    throw new Error(
      `ACW view-state setActiveLod rejected level "${String(level)}". Permitted: 1 | 2 | 3.`,
    );
  }
  const prev = getViewState();
  const prevMap = prev.activeLodByLens ?? {};
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    activeLodByLens: Object.freeze({ ...prevMap, [lensId]: level }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// EAStudio Path B Phase 3 — per-lens Organisational Unit overlay
// toggle. Pure UI state. Mirrors `getConnectMode` / `setConnectMode`
// shape: a lens not present in the map reads as `false` (overlay
// off); flipping the toggle on tints every node on the canvas
// using `acw/orgUnits/ouHue.ts`. Selection, connect-mode, and
// every other slice are intentionally NOT touched here so the
// overlay is freely composable with whatever else the user is
// doing on the surface.
export function getShowOrgOverlay(lensId: string): boolean {
  const map = getViewState().showOrgOverlayByLens ?? {};
  return map[lensId] === true;
}

export function setShowOrgOverlay(lensId: string, on: boolean): void {
  const prev = getViewState();
  const prevMap = prev.showOrgOverlayByLens ?? {};
  const nextMap: Record<string, boolean> = { ...prevMap };
  if (on) nextMap[lensId] = true;
  else delete nextMap[lensId];
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    showOrgOverlayByLens: Object.freeze(nextMap),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// Canvas Enhancements — per-lens layer management helpers.
//
// Layers are purely visual: they do not change the workspace
// document or the grammar. Each lens has its own independent
// layer list stored in `layersByLens[lensId]`. The helpers below
// are the single mutation point for all layer operations so the
// assertValid boundary is always crossed before persistence.

export function getLensLayers(lensId: string): readonly AcwLayerDef[] {
  const map = getViewState().layersByLens ?? {};
  return map[lensId]?.definitions ?? Object.freeze([]);
}

export function getLensLayerVisibility(
  lensId: string,
): Readonly<Record<string, boolean>> {
  const map = getViewState().layersByLens ?? {};
  return map[lensId]?.visibility ?? Object.freeze({});
}

function freshLayerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `layer-${crypto.randomUUID()}`;
  }
  return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addLensLayer(lensId: string, name: string): void {
  const prev = getViewState();
  const prevLayers = prev.layersByLens ?? {};
  const prevSlice: AcwLensLayerSlice = prevLayers[lensId] ?? {
    definitions: Object.freeze([]),
    visibility: Object.freeze({}),
  };
  const id = freshLayerId();
  const nextDefs = Object.freeze([
    ...prevSlice.definitions,
    Object.freeze({ id, name }),
  ]);
  const nextVis = Object.freeze({ ...prevSlice.visibility, [id]: true });
  const nextSlice: AcwLensLayerSlice = Object.freeze({
    definitions: nextDefs,
    visibility: nextVis,
  });
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    layersByLens: Object.freeze({ ...prevLayers, [lensId]: nextSlice }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

export function renameLensLayer(
  lensId: string,
  layerId: string,
  name: string,
): void {
  const prev = getViewState();
  const prevLayers = prev.layersByLens ?? {};
  const prevSlice = prevLayers[lensId];
  if (!prevSlice) return;
  const nextDefs = Object.freeze(
    prevSlice.definitions.map((d) =>
      d.id === layerId ? Object.freeze({ id: d.id, name }) : d,
    ),
  );
  const nextSlice: AcwLensLayerSlice = Object.freeze({
    ...prevSlice,
    definitions: nextDefs,
  });
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    layersByLens: Object.freeze({ ...prevLayers, [lensId]: nextSlice }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

export function deleteLensLayer(lensId: string, layerId: string): void {
  const prev = getViewState();
  const prevLayers = prev.layersByLens ?? {};
  const prevSlice = prevLayers[lensId];
  if (!prevSlice) return;
  const nextDefs = Object.freeze(
    prevSlice.definitions.filter((d) => d.id !== layerId),
  );
  const nextVis: Record<string, boolean> = { ...prevSlice.visibility };
  delete nextVis[layerId];
  const nextSlice: AcwLensLayerSlice = Object.freeze({
    definitions: nextDefs,
    visibility: Object.freeze(nextVis),
  });
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    layersByLens: Object.freeze({ ...prevLayers, [lensId]: nextSlice }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

export function toggleLensLayerVisibility(
  lensId: string,
  layerId: string,
): void {
  const prev = getViewState();
  const prevLayers = prev.layersByLens ?? {};
  const prevSlice = prevLayers[lensId];
  if (!prevSlice) return;
  const current = prevSlice.visibility[layerId] !== false;
  const nextVis = Object.freeze({
    ...prevSlice.visibility,
    [layerId]: !current,
  });
  const nextSlice: AcwLensLayerSlice = Object.freeze({
    ...prevSlice,
    visibility: nextVis,
  });
  const next: AcwViewState = Object.freeze({
    ...prev,
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    layersByLens: Object.freeze({ ...prevLayers, [lensId]: nextSlice }),
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// Test / maintenance affordance: clear all view-state.
export function clearViewState(): void {
  const next = emptyView();
  writeToStorage(next);
  cache = next;
  notify();
}

// Internal exposure for the build-time invariant module.
export const __acwViewStateInternals = Object.freeze({
  isValid,
  assertValid,
  emptyView,
  ALLOWED_VIEW_MODES,
  DEFAULT_VIEW_MODE,
  reloadFromStorageForTest(): void {
    __resetScopedStorageForTest();
    cache = null;
    notify();
  },
});

assertAllAcwPlaceholderLanguage([]);

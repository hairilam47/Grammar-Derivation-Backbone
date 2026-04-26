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
import { isAcwDomainTag, type AcwDomainTag } from "./acwGrammar";

export const ACW_VIEW_SCHEMA_VERSION = "acw-view-1.0" as const;
const STORAGE_KEY = "acw.workspace.view.v1";

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
}

const ALLOWED_TOP = [
  "schemaVersion",
  "collapseByLens",
  "viewModeByLens",
  "currentDomainByLens",
] as const;

function emptyView(): AcwViewState {
  return Object.freeze({
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: Object.freeze({}),
    viewModeByLens: Object.freeze({}),
    currentDomainByLens: Object.freeze({}),
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
  // Backfill optional v3 / EAStudio Phase 1 fields for older
  // persisted documents so callers never have to null-check.
  const needsViewMode = raw.viewModeByLens === undefined;
  const needsDomain = raw.currentDomainByLens === undefined;
  if (!needsViewMode && !needsDomain) return raw;
  return Object.freeze({
    schemaVersion: raw.schemaVersion,
    collapseByLens: raw.collapseByLens,
    viewModeByLens: needsViewMode ? Object.freeze({}) : raw.viewModeByLens,
    currentDomainByLens: needsDomain
      ? Object.freeze({})
      : raw.currentDomainByLens,
  });
}

function readFromStorage(): AcwViewState {
  if (typeof window === "undefined") return emptyView();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyView();
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return emptyView();
    return normalize(parsed);
  } catch {
    return emptyView();
  }
}

function writeToStorage(state: AcwViewState): void {
  assertValid(state);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: Object.freeze({
      ...prev.collapseByLens,
      [lensId]: Object.freeze(nextIds),
    }),
    viewModeByLens: prev.viewModeByLens,
    currentDomainByLens: prev.currentDomainByLens,
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
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: prev.collapseByLens,
    viewModeByLens: Object.freeze({
      ...prev.viewModeByLens,
      [lensId]: mode,
    }),
    currentDomainByLens: prev.currentDomainByLens,
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
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: prev.collapseByLens,
    viewModeByLens: prev.viewModeByLens,
    currentDomainByLens: Object.freeze({
      ...prev.currentDomainByLens,
      [lensId]: tag,
    }),
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
    cache = null;
    notify();
  },
});

assertAllAcwPlaceholderLanguage([]);

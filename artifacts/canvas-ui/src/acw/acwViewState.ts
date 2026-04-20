// ACW v2 — per-lens visual view-state (collapse / expand).
//
// View-state is *not* part of the canonical workspace document.
// Master prompt §11 (grammar always wins over visuals) and the v2
// task brief require collapse / expand to leave the underlying
// `structureGraph` untouched. Persisting view-state alongside (not
// inside) the workspace makes that separation a build-time fact
// rather than a habit:
//   - Two distinct localStorage keys: `acw.workspace.v1` for the
//     graph, `acw.workspace.view.v1` for the view-state.
//   - Two distinct schema versions: `acw-1.0` and `acw-view-1.0`.
//   - Two distinct allow-lists. The view-state allow-list contains
//     no graph fields (`nodes`, `edges`, `parentId`, etc.); the
//     read-validator drops the document if a future commit slips a
//     graph field in.
//
// This module is intentionally tiny — collapse state is the only
// view-state concern v2 introduces.
import { assertAllAcwPlaceholderLanguage } from "../governance/staticTextGuard";

export const ACW_VIEW_SCHEMA_VERSION = "acw-view-1.0" as const;
const STORAGE_KEY = "acw.workspace.view.v1";

// Per-lens collapse state. Lens identity = the lens path (e.g.
// "/workspace/landscape"). Each lens tracks the set of node ids
// whose containers are currently collapsed.
export interface AcwViewState {
  readonly schemaVersion: typeof ACW_VIEW_SCHEMA_VERSION;
  readonly collapseByLens: Readonly<Record<string, readonly string[]>>;
}

const ALLOWED_TOP = ["schemaVersion", "collapseByLens"] as const;

function emptyView(): AcwViewState {
  return Object.freeze({
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: Object.freeze({}),
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

function readFromStorage(): AcwViewState {
  if (typeof window === "undefined") return emptyView();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyView();
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return emptyView();
    return parsed;
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
  });
  writeToStorage(next);
  cache = next;
  notify();
}

// Test / maintenance affordance: clear all view-state. Not bound to
// any UI; provided so test harnesses can reset state without
// touching localStorage directly.
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
  // Force the in-memory cache to drop and re-read from
  // localStorage on the next access. The v2 invariants use this
  // to restore the user's persisted view-state after running
  // snapshot-and-restore probes against the live singleton.
  reloadFromStorageForTest(): void {
    cache = null;
    notify();
  },
});

// Vocabulary assertion. The view-state module surfaces no static
// labels into the DOM today; the module-load assertion runs against
// an empty list so any future literal added here is guarded.
assertAllAcwPlaceholderLanguage([]);

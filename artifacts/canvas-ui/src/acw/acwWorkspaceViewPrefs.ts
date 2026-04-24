// ACW Workspace Builder — per-lens visual preferences for the
// authored lenses (Task #86).
//
// Persisted in localStorage under `acw.workspace.viewprefs.v1`.
// Schema-locked: the read-validator drops any document with a
// field outside the allowlist, so a future commit cannot quietly
// smuggle structural data into a surface that, by contract, only
// holds inert per-lens visual preferences.
//
// Scope: this slice ONLY tracks `isFullscreen` per authored lens
// id (e.g. "/workspace/landscape", "/workspace/deployment"). The
// per-lens 2D/3D mode and the per-lens collapse state continue to
// live in `acw/acwViewState.ts`; we do not merge them here so the
// two slices stay independently swappable. The Track 3 derived
// view owns its OWN viewprefs slice (`acw/track3/track3ViewPrefs`)
// — these two slices intentionally stay decoupled per the Task #86
// architectural constraint.
//
// Relation to the ACW grammar: this slice is NEVER part of the
// canonical workspace document (`acw-1.0`). It mirrors the
// separation pattern already enforced by `acwViewState`:
//   - distinct localStorage key,
//   - distinct schema version,
//   - distinct allowlist with no graph fields.
// NOTE: this module emits no user-facing static labels — every
// string here is a developer-facing schema-validator error. We
// therefore deliberately do NOT run the strings through
// `assertAllAcwPlaceholderLanguage`; mirrors the convention in
// `track3ViewPrefs`, whose validator messages also contain
// "must"/"required" wording for the same reason.

export const ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION =
  "acw-workspace-viewprefs-1.0" as const;
const STORAGE_KEY = "acw.workspace.viewprefs.v1";

const DEFAULT_FULLSCREEN = true;

export interface AcwLensPrefs {
  readonly isFullscreen: boolean;
}

export interface AcwWorkspaceViewPrefsDoc {
  readonly schemaVersion: typeof ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION;
  readonly byLens: Readonly<Record<string, AcwLensPrefs>>;
}

const ALLOWED_TOP = ["schemaVersion", "byLens"] as const;
const ALLOWED_LENS = ["isFullscreen"] as const;

function defaultLensPrefs(): AcwLensPrefs {
  return Object.freeze({ isFullscreen: DEFAULT_FULLSCREEN });
}

function emptyDoc(): AcwWorkspaceViewPrefsDoc {
  return Object.freeze({
    schemaVersion: ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
    byLens: Object.freeze({}),
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
        `ACW workspace view-prefs ${context} contains forbidden field "${k}". Permitted: ${allowed.join(", ")}.`,
      );
    }
  }
}

function assertValidLensMap(
  raw: unknown,
): asserts raw is Record<string, AcwLensPrefs> {
  if (raw === null || typeof raw !== "object") {
    throw new Error("ACW workspace view-prefs byLens must be an object.");
  }
  const map = raw as Record<string, unknown>;
  for (const [key, prefs] of Object.entries(map)) {
    if (typeof key !== "string" || key.length === 0) {
      throw new Error(
        "ACW workspace view-prefs byLens key must be a non-empty string.",
      );
    }
    if (prefs === null || typeof prefs !== "object") {
      throw new Error(
        "ACW workspace view-prefs lens entry must be an object.",
      );
    }
    const p = prefs as Record<string, unknown>;
    assertAllowedKeys(p, ALLOWED_LENS, `lens entry "${key}"`);
    if (typeof p.isFullscreen !== "boolean") {
      throw new Error(
        "ACW workspace view-prefs isFullscreen must be a boolean.",
      );
    }
  }
}

export function assertValidPrefsDoc(
  raw: unknown,
): asserts raw is AcwWorkspaceViewPrefsDoc {
  if (raw === null || typeof raw !== "object") {
    throw new Error("ACW workspace view-prefs document must be an object.");
  }
  const r = raw as Record<string, unknown>;
  assertAllowedKeys(r, ALLOWED_TOP, "document");
  if (r.schemaVersion !== ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION) {
    throw new Error(
      `ACW workspace view-prefs schemaVersion is not on the permitted list. Got: ${JSON.stringify(r.schemaVersion)}.`,
    );
  }
  if (r.byLens === undefined) {
    throw new Error(
      "ACW workspace view-prefs document is missing byLens.",
    );
  }
  assertValidLensMap(r.byLens);
}

function isValid(raw: unknown): raw is AcwWorkspaceViewPrefsDoc {
  try {
    assertValidPrefsDoc(raw);
    return true;
  } catch {
    return false;
  }
}

let cache: AcwWorkspaceViewPrefsDoc | null = null;
const subscribers = new Set<() => void>();

function readFromStorage(): AcwWorkspaceViewPrefsDoc {
  if (typeof window === "undefined") return emptyDoc();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDoc();
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return emptyDoc();
    return Object.freeze({
      schemaVersion: ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
      byLens: Object.freeze({ ...parsed.byLens }),
    });
  } catch {
    return emptyDoc();
  }
}

function writeToStorage(doc: AcwWorkspaceViewPrefsDoc): void {
  assertValidPrefsDoc(doc);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

function notify(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // intentional no-op
    }
  }
}

export function getDoc(): AcwWorkspaceViewPrefsDoc {
  if (cache === null) cache = readFromStorage();
  return cache;
}

export function subscribePrefs(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function getLensPrefs(lensId: string): AcwLensPrefs {
  const existing = getDoc().byLens[lensId];
  return existing ?? defaultLensPrefs();
}

export function isLensFullscreen(lensId: string): boolean {
  return getLensPrefs(lensId).isFullscreen;
}

export function setLensFullscreen(
  lensId: string,
  isFullscreen: boolean,
): void {
  const prev = getDoc();
  const updated: AcwWorkspaceViewPrefsDoc = Object.freeze({
    schemaVersion: ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
    byLens: Object.freeze({
      ...prev.byLens,
      [lensId]: Object.freeze({ isFullscreen }),
    }),
  });
  writeToStorage(updated);
  cache = updated;
  notify();
}

export function toggleLensFullscreen(lensId: string): void {
  setLensFullscreen(lensId, !isLensFullscreen(lensId));
}

export function clearAllPrefs(): void {
  const next = emptyDoc();
  writeToStorage(next);
  cache = next;
  notify();
}

export const __acwWorkspaceViewPrefsInternals = Object.freeze({
  isValid,
  assertValidPrefsDoc,
  emptyDoc,
  defaultLensPrefs,
  ALLOWED_TOP,
  ALLOWED_LENS,
  STORAGE_KEY,
  reloadFromStorageForTest(): void {
    cache = null;
    notify();
  },
});

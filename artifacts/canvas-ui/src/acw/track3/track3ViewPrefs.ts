// ACW Track 3 — view preferences (camera / collapsed layers /
// perspective / 2D-vs-3D).
//
// Persisted in localStorage under `acw.track3.viewprefs.v1`.
// Schema-locked: the read-validator drops any document with a
// field outside the allowlist below, so a future commit cannot
// silently smuggle structural data into the view-prefs document.
//
// Storage is per-binding (keyed by `<adsId>::<adsVersion>`); a
// fresh binding gets the default preferences.
import { TRACK3_PERSPECTIVES, type Track3Perspective } from "./track3Types";

export const TRACK3_VIEWPREFS_SCHEMA_VERSION = "acw-track3-viewprefs-1.0" as const;
const STORAGE_KEY = "acw.track3.viewprefs.v1";

export type Track3ViewMode = "2d" | "3d";
const ALLOWED_VIEW_MODES: readonly Track3ViewMode[] = ["2d", "3d"];
const DEFAULT_VIEW_MODE: Track3ViewMode = "2d";
const DEFAULT_PERSPECTIVE: Track3Perspective = "all";

export interface Track3BindingPrefs {
  readonly viewMode: Track3ViewMode;
  readonly perspective: Track3Perspective;
  readonly hiddenLayers: readonly string[];
  readonly cameraX: number;
  readonly cameraY: number;
  readonly cameraZoom: number;
}

export interface Track3ViewPrefsDoc {
  readonly schemaVersion: typeof TRACK3_VIEWPREFS_SCHEMA_VERSION;
  readonly byBinding: Readonly<Record<string, Track3BindingPrefs>>;
}

const ALLOWED_TOP = ["schemaVersion", "byBinding"] as const;
const ALLOWED_BINDING = [
  "viewMode",
  "perspective",
  "hiddenLayers",
  "cameraX",
  "cameraY",
  "cameraZoom",
] as const;

function defaultPrefs(): Track3BindingPrefs {
  return Object.freeze({
    viewMode: DEFAULT_VIEW_MODE,
    perspective: DEFAULT_PERSPECTIVE,
    hiddenLayers: Object.freeze([] as string[]),
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
  });
}

function emptyDoc(): Track3ViewPrefsDoc {
  return Object.freeze({
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: Object.freeze({}),
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
        `Track 3 view-prefs ${context} contains forbidden field "${k}". Permitted: ${allowed.join(", ")}.`,
      );
    }
  }
}

export function assertValidPrefsDoc(raw: unknown): asserts raw is Track3ViewPrefsDoc {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Track 3 view-prefs document must be an object.");
  }
  const r = raw as Record<string, unknown>;
  assertAllowedKeys(r, ALLOWED_TOP, "document");
  if (r.schemaVersion !== TRACK3_VIEWPREFS_SCHEMA_VERSION) {
    throw new Error(
      `Track 3 view-prefs schemaVersion must be "${TRACK3_VIEWPREFS_SCHEMA_VERSION}".`,
    );
  }
  if (r.byBinding === null || typeof r.byBinding !== "object") {
    throw new Error("Track 3 view-prefs byBinding must be an object.");
  }
  const map = r.byBinding as Record<string, unknown>;
  for (const [bindingKey, prefs] of Object.entries(map)) {
    if (typeof bindingKey !== "string" || bindingKey.length === 0) {
      throw new Error("Track 3 view-prefs binding key must be a non-empty string.");
    }
    if (prefs === null || typeof prefs !== "object") {
      throw new Error("Track 3 view-prefs binding entry must be an object.");
    }
    const p = prefs as Record<string, unknown>;
    assertAllowedKeys(p, ALLOWED_BINDING, `binding "${bindingKey}"`);
    if (typeof p.viewMode !== "string" || !ALLOWED_VIEW_MODES.includes(p.viewMode as Track3ViewMode)) {
      throw new Error(`Track 3 view-prefs viewMode must be "2d" or "3d".`);
    }
    if (typeof p.perspective !== "string" || !TRACK3_PERSPECTIVES.includes(p.perspective as Track3Perspective)) {
      throw new Error(`Track 3 view-prefs perspective is not on the permitted list.`);
    }
    if (!Array.isArray(p.hiddenLayers)) {
      throw new Error("Track 3 view-prefs hiddenLayers must be an array.");
    }
    for (const id of p.hiddenLayers) {
      if (typeof id !== "string" || id.length === 0) {
        throw new Error("Track 3 view-prefs hiddenLayers entries must be non-empty strings.");
      }
    }
    for (const num of ["cameraX", "cameraY", "cameraZoom"] as const) {
      if (typeof p[num] !== "number" || !Number.isFinite(p[num])) {
        throw new Error(`Track 3 view-prefs ${num} must be a finite number.`);
      }
    }
  }
}

function isValid(raw: unknown): raw is Track3ViewPrefsDoc {
  try {
    assertValidPrefsDoc(raw);
    return true;
  } catch {
    return false;
  }
}

let cache: Track3ViewPrefsDoc | null = null;
const subscribers = new Set<() => void>();

function readFromStorage(): Track3ViewPrefsDoc {
  if (typeof window === "undefined") return emptyDoc();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDoc();
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return emptyDoc();
    return parsed;
  } catch {
    return emptyDoc();
  }
}

function writeToStorage(doc: Track3ViewPrefsDoc): void {
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

function bindingKey(adsId: string, adsVersion: string): string {
  return `${adsId}::${adsVersion}`;
}

export function getDoc(): Track3ViewPrefsDoc {
  if (cache === null) cache = readFromStorage();
  return cache;
}

export function subscribePrefs(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function getPrefs(adsId: string, adsVersion: string): Track3BindingPrefs {
  const key = bindingKey(adsId, adsVersion);
  const existing = getDoc().byBinding[key];
  return existing ?? defaultPrefs();
}

function setPrefs(
  adsId: string,
  adsVersion: string,
  next: Track3BindingPrefs,
): void {
  const key = bindingKey(adsId, adsVersion);
  const prev = getDoc();
  const updated: Track3ViewPrefsDoc = Object.freeze({
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: Object.freeze({
      ...prev.byBinding,
      [key]: Object.freeze(next),
    }),
  });
  writeToStorage(updated);
  cache = updated;
  notify();
}

export function setViewMode(
  adsId: string,
  adsVersion: string,
  mode: Track3ViewMode,
): void {
  const prev = getPrefs(adsId, adsVersion);
  setPrefs(adsId, adsVersion, { ...prev, viewMode: mode });
}

export function setPerspective(
  adsId: string,
  adsVersion: string,
  p: Track3Perspective,
): void {
  const prev = getPrefs(adsId, adsVersion);
  setPrefs(adsId, adsVersion, { ...prev, perspective: p });
}

export function toggleLayerHidden(
  adsId: string,
  adsVersion: string,
  layerId: string,
): void {
  const prev = getPrefs(adsId, adsVersion);
  const has = prev.hiddenLayers.includes(layerId);
  const nextHidden = has
    ? prev.hiddenLayers.filter((l) => l !== layerId)
    : [...prev.hiddenLayers, layerId];
  setPrefs(adsId, adsVersion, {
    ...prev,
    hiddenLayers: Object.freeze(nextHidden),
  });
}

export function setCamera(
  adsId: string,
  adsVersion: string,
  cameraX: number,
  cameraY: number,
  cameraZoom: number,
): void {
  const prev = getPrefs(adsId, adsVersion);
  setPrefs(adsId, adsVersion, { ...prev, cameraX, cameraY, cameraZoom });
}

export function clearAllPrefs(): void {
  const next = emptyDoc();
  writeToStorage(next);
  cache = next;
  notify();
}

export const __track3ViewPrefsInternals = Object.freeze({
  isValid,
  assertValidPrefsDoc,
  emptyDoc,
  ALLOWED_VIEW_MODES,
  ALLOWED_TOP,
  ALLOWED_BINDING,
  reloadFromStorageForTest(): void {
    cache = null;
    notify();
  },
});

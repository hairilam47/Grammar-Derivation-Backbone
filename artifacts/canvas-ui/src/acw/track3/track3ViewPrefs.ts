// ACW Track 3 — view preferences (camera / collapsed layers /
// perspective / 2D-vs-3D / fullscreen).
//
// Persisted in localStorage under `acw.track3.viewprefs.v1`.
// Schema-locked: the read-validator drops any document with a
// field outside the allowlist below, so a future commit cannot
// silently smuggle structural data into the view-prefs document.
//
// Two parallel maps keyed independently:
//   - `byBinding` — legacy per-(adsId,adsVersion) prefs (kept so
//     existing locally-stored documents remain valid; Phase 3
//     dropped the binding-mode UI itself, but old docs in user
//     localStorage must continue to validate).
//   - `byArchitecture` — Phase 3 (Task #80) per-architectureId
//     prefs for the new architecture-mode entry.
//
// Phase 4 (Task #81) bumps the schema from
// `acw-track3-viewprefs-1.0` → `acw-track3-viewprefs-1.1`,
// adding a per-entry `isFullscreen: boolean` field controlling
// the full-page canvas mode. Read-time deterministic migration:
// every v1.0 entry is upgraded by injecting `isFullscreen: true`
// (the new default).
import { TRACK3_PERSPECTIVES, type Track3Perspective } from "./track3Types";

import {
  resolveActiveKey,
  currentScope,
} from "@/governance/storageKeyUtils";

export const TRACK3_VIEWPREFS_SCHEMA_VERSION = "acw-track3-viewprefs-1.1" as const;
const LEGACY_SCHEMA_VERSION_V10 = "acw-track3-viewprefs-1.0" as const;
// Phase 2 (SaaS Onboarding) — Org+WorkItem scope.
export const BASE_STORAGE_KEY = "acw.track3.viewprefs.v1";

function getStorageKey(): string | null {
  return resolveActiveKey(BASE_STORAGE_KEY, true);
}

export type Track3ViewMode = "2d" | "3d";
const ALLOWED_VIEW_MODES: readonly Track3ViewMode[] = ["2d", "3d"];
const DEFAULT_VIEW_MODE: Track3ViewMode = "2d";
const DEFAULT_PERSPECTIVE: Track3Perspective = "all";
const DEFAULT_FULLSCREEN = true;

export interface Track3BindingPrefs {
  readonly viewMode: Track3ViewMode;
  readonly perspective: Track3Perspective;
  readonly hiddenLayers: readonly string[];
  readonly cameraX: number;
  readonly cameraY: number;
  readonly cameraZoom: number;
  readonly isFullscreen: boolean;
}

export interface Track3ViewPrefsDoc {
  readonly schemaVersion: typeof TRACK3_VIEWPREFS_SCHEMA_VERSION;
  readonly byBinding: Readonly<Record<string, Track3BindingPrefs>>;
  readonly byArchitecture: Readonly<Record<string, Track3BindingPrefs>>;
}

const ALLOWED_TOP = ["schemaVersion", "byBinding", "byArchitecture"] as const;
const ALLOWED_BINDING = [
  "viewMode",
  "perspective",
  "hiddenLayers",
  "cameraX",
  "cameraY",
  "cameraZoom",
  "isFullscreen",
] as const;

function defaultPrefs(): Track3BindingPrefs {
  return Object.freeze({
    viewMode: DEFAULT_VIEW_MODE,
    perspective: DEFAULT_PERSPECTIVE,
    hiddenLayers: Object.freeze([] as string[]),
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    isFullscreen: DEFAULT_FULLSCREEN,
  });
}

function emptyDoc(): Track3ViewPrefsDoc {
  return Object.freeze({
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: Object.freeze({}),
    byArchitecture: Object.freeze({}),
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

function assertValidEntryMap(
  raw: unknown,
  context: string,
): asserts raw is Record<string, Track3BindingPrefs> {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`Track 3 view-prefs ${context} must be an object.`);
  }
  const map = raw as Record<string, unknown>;
  for (const [key, prefs] of Object.entries(map)) {
    if (typeof key !== "string" || key.length === 0) {
      throw new Error(`Track 3 view-prefs ${context} key must be a non-empty string.`);
    }
    if (prefs === null || typeof prefs !== "object") {
      throw new Error(`Track 3 view-prefs ${context} entry must be an object.`);
    }
    const p = prefs as Record<string, unknown>;
    assertAllowedKeys(p, ALLOWED_BINDING, `${context} entry "${key}"`);
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
    if (typeof p.isFullscreen !== "boolean") {
      throw new Error("Track 3 view-prefs isFullscreen must be a boolean.");
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
  // byBinding is required for back-compat with existing storage;
  // byArchitecture is optional (older docs predate it).
  if (r.byBinding === undefined) {
    throw new Error("Track 3 view-prefs document is missing byBinding.");
  }
  assertValidEntryMap(r.byBinding, "byBinding");
  if (r.byArchitecture !== undefined) {
    assertValidEntryMap(r.byArchitecture, "byArchitecture");
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

// Deterministic v1.0 → v1.1 migration. Accepts a parsed v1.0
// document (which has the same per-entry shape EXCEPT no
// `isFullscreen` field) and returns a v1.1 document where every
// entry has `isFullscreen: true` injected. Returns null if the
// input does not match the v1.0 shape (in which case callers
// fall back to `emptyDoc()`).
function migrateV10ToV11(raw: unknown): Track3ViewPrefsDoc | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== LEGACY_SCHEMA_VERSION_V10) return null;
  // Enforce the v1.0 top-level allowlist BEFORE migrating, so a
  // legacy doc carrying unknown top-level keys is rejected
  // outright rather than silently dropped during the upgrade.
  // Mirrors the strict-locked posture applied at v1.1.
  try {
    assertAllowedKeys(
      r,
      ["schemaVersion", "byBinding", "byArchitecture"],
      "v1.0 doc",
    );
  } catch {
    return null;
  }
  function upgradeMap(
    src: unknown,
  ): Record<string, Track3BindingPrefs> | null {
    if (src === undefined) return {};
    if (src === null || typeof src !== "object") return null;
    const out: Record<string, Track3BindingPrefs> = {};
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (v === null || typeof v !== "object") return null;
      const p = v as Record<string, unknown>;
      // Validate the v1.0 entry shape minus isFullscreen, then
      // inject the new field. Any field outside the v1.0 allowlist
      // (the v1.1 allowlist minus `isFullscreen`) aborts migration.
      const v10Allowed = ALLOWED_BINDING.filter((f) => f !== "isFullscreen");
      try {
        assertAllowedKeys(p, v10Allowed, `v1.0 entry "${k}"`);
      } catch {
        return null;
      }
      out[k] = {
        viewMode: p.viewMode as Track3ViewMode,
        perspective: p.perspective as Track3Perspective,
        hiddenLayers: Object.freeze([...(p.hiddenLayers as string[])]),
        cameraX: p.cameraX as number,
        cameraY: p.cameraY as number,
        cameraZoom: p.cameraZoom as number,
        isFullscreen: DEFAULT_FULLSCREEN,
      };
    }
    return out;
  }
  const byBinding = upgradeMap(r.byBinding);
  const byArchitecture = upgradeMap(r.byArchitecture);
  if (byBinding === null || byArchitecture === null) return null;
  const upgraded: Track3ViewPrefsDoc = {
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: Object.freeze(byBinding),
    byArchitecture: Object.freeze(byArchitecture),
  };
  // Re-validate before returning so a malformed legacy entry
  // (e.g. invalid viewMode) cannot leak past the migration.
  if (!isValid(upgraded)) return null;
  return Object.freeze(upgraded);
}

let cache: Track3ViewPrefsDoc | null = null;
const subscribers = new Set<() => void>();

function readFromStorage(): Track3ViewPrefsDoc {
  if (typeof window === "undefined") return emptyDoc();
  const key = getStorageKey();
  if (key === null) return emptyDoc();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptyDoc();
    const parsed = JSON.parse(raw);
    // Try v1.0 → v1.1 migration first; if not a v1.0 doc, fall
    // through to the strict v1.1 validator.
    const migrated = migrateV10ToV11(parsed);
    if (migrated !== null) return migrated;
    if (!isValid(parsed)) return emptyDoc();
    // Normalise: ensure byArchitecture is always present in the
    // in-memory cache, even when reading a doc whose
    // byArchitecture key was simply omitted at write time.
    return Object.freeze({
      schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
      byBinding: Object.freeze({ ...parsed.byBinding }),
      byArchitecture: Object.freeze({ ...(parsed.byArchitecture ?? {}) }),
    });
  } catch {
    return emptyDoc();
  }
}

function writeToStorage(doc: Track3ViewPrefsDoc): void {
  assertValidPrefsDoc(doc);
  if (typeof window === "undefined") return;
  const key = getStorageKey();
  if (key === null) return;
  window.localStorage.setItem(key, JSON.stringify(doc));
}

if (typeof window !== "undefined") {
  currentScope.subscribe(() => {
    cache = null;
    notify();
  });
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

export function getArchitecturePrefs(architectureId: string): Track3BindingPrefs {
  const existing = getDoc().byArchitecture[architectureId];
  return existing ?? defaultPrefs();
}

function setArchPrefs(
  architectureId: string,
  next: Track3BindingPrefs,
): void {
  const prev = getDoc();
  const updated: Track3ViewPrefsDoc = Object.freeze({
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: prev.byBinding,
    byArchitecture: Object.freeze({
      ...prev.byArchitecture,
      [architectureId]: Object.freeze(next),
    }),
  });
  writeToStorage(updated);
  cache = updated;
  notify();
}

export function setArchitectureViewMode(
  architectureId: string,
  mode: Track3ViewMode,
): void {
  const prev = getArchitecturePrefs(architectureId);
  setArchPrefs(architectureId, { ...prev, viewMode: mode });
}

export function setArchitecturePerspective(
  architectureId: string,
  p: Track3Perspective,
): void {
  const prev = getArchitecturePrefs(architectureId);
  setArchPrefs(architectureId, { ...prev, perspective: p });
}

export function toggleArchitectureLayerHidden(
  architectureId: string,
  layerId: string,
): void {
  const prev = getArchitecturePrefs(architectureId);
  const has = prev.hiddenLayers.includes(layerId);
  const nextHidden = has
    ? prev.hiddenLayers.filter((l) => l !== layerId)
    : [...prev.hiddenLayers, layerId];
  setArchPrefs(architectureId, {
    ...prev,
    hiddenLayers: Object.freeze(nextHidden),
  });
}

export function setArchitectureCamera(
  architectureId: string,
  cameraX: number,
  cameraY: number,
  cameraZoom: number,
): void {
  const prev = getArchitecturePrefs(architectureId);
  setArchPrefs(architectureId, { ...prev, cameraX, cameraY, cameraZoom });
}

export function setArchitectureFullscreen(
  architectureId: string,
  isFullscreen: boolean,
): void {
  const prev = getArchitecturePrefs(architectureId);
  setArchPrefs(architectureId, { ...prev, isFullscreen });
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
  migrateV10ToV11,
  LEGACY_SCHEMA_VERSION_V10,
  ALLOWED_VIEW_MODES,
  ALLOWED_TOP,
  ALLOWED_BINDING,
  reloadFromStorageForTest(): void {
    cache = null;
    notify();
  },
});

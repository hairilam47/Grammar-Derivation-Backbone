// EAStudio / ACW canvas — per-(work item, lensId) camera state.
//
// Task #161 ports the CTAD "big canvas" navigation UX to every
// 2D ACW lens (Studio + the lenses backed by `InteractiveCanvas2D`,
// such as SystemLandscape and Deployment). Each lens owns its own
// independent camera so the user can pan/zoom one lens to look at
// the data domain without disturbing the camera in another lens.
//
// Storage shape (one document per work item, JSON-encoded):
//
//   {
//     v: 1,
//     cameras: {
//       "/acw/studio":     { zoom: 1, panX: 0, panY: 0 },
//       "/acw/landscape":  { zoom: 1.4, panX: -120, panY: -40 },
//       ...
//     }
//   }
//
// The lensId key is the `useLocation()` path string already used by
// every ACW page to scope its per-lens view-state slices, so this
// store stays coherent with the rest of the per-lens persistence
// surface without inventing a new identifier scheme.
//
// Discipline notes:
//   - Lives under `src/acw/**` and stays on the ACW import surface;
//     no CTAD-only module is referenced.
//   - Holds no decision-pipeline state; carries no authority.
//   - Reads return synchronously (L1 cache); writes are write-
//     through to localStorage and the api-server via the scoped
//     storage client, fire-and-forget.
//   - Mirrors `ctadCameraStore.ts` in shape and semantics so a
//     reader who knows one knows the other.

import {
  onScopeOrHydrationChange,
  readScoped,
  writeScoped,
} from "@/governance/scopedStorageClient";
import { resolveActiveKey } from "@/governance/storageKeyUtils";

export interface AcwCanvasCameraState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const ACW_CANVAS_CAMERA_DEFAULT: AcwCanvasCameraState = Object.freeze({
  zoom: 1,
  panX: 0,
  panY: 0,
});

// Sane bounds. Below 0.2 the cards become unreadable; above 4 the
// canvas edges and grid start to alias unpleasantly. Matches the
// CTAD camera bounds so the two surfaces feel identical.
export const ACW_CANVAS_CAMERA_MIN_ZOOM = 0.2;
export const ACW_CANVAS_CAMERA_MAX_ZOOM = 4;

const STORAGE_BASE_KEY = "acw.canvas-camera.v1";

interface CameraDoc {
  readonly v: 1;
  readonly cameras: Readonly<Record<string, AcwCanvasCameraState>>;
}

const EMPTY_DOC: CameraDoc = Object.freeze({
  v: 1,
  cameras: Object.freeze({}),
});

let cache: CameraDoc | null = null;
const reloadListeners = new Set<() => void>();

function getStorageKey(): string | null {
  // Camera is per work item — without an active work-item scope
  // there's nothing to persist (the lens shows an empty canvas in
  // that case anyway).
  return resolveActiveKey(STORAGE_BASE_KEY, /* needsWorkItem */ true);
}

export function clampAcwCameraZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  if (z < ACW_CANVAS_CAMERA_MIN_ZOOM) return ACW_CANVAS_CAMERA_MIN_ZOOM;
  if (z > ACW_CANVAS_CAMERA_MAX_ZOOM) return ACW_CANVAS_CAMERA_MAX_ZOOM;
  return z;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseDoc(raw: string | null): CameraDoc {
  if (raw === null) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return EMPTY_DOC;
    const camerasRaw = (parsed as { cameras?: unknown }).cameras;
    if (camerasRaw === null || typeof camerasRaw !== "object") {
      return EMPTY_DOC;
    }
    const out: Record<string, AcwCanvasCameraState> = {};
    for (const [k, v] of Object.entries(camerasRaw as Record<string, unknown>)) {
      if (typeof k !== "string" || k.length === 0) continue;
      if (v === null || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      if (
        !isFiniteNumber(o.zoom) ||
        !isFiniteNumber(o.panX) ||
        !isFiniteNumber(o.panY)
      ) {
        continue;
      }
      out[k] = Object.freeze({
        zoom: clampAcwCameraZoom(o.zoom),
        panX: o.panX,
        panY: o.panY,
      });
    }
    return Object.freeze({ v: 1 as const, cameras: Object.freeze(out) });
  } catch {
    return EMPTY_DOC;
  }
}

function readDoc(): CameraDoc {
  if (cache !== null) return cache;
  cache = parseDoc(readScoped(getStorageKey()));
  return cache;
}

// Invalidate the cache and notify reload listeners when the active
// scope changes or hydration arrives — the React hooks in each lens
// use this to re-load camera state after a work-item switch or
// after the server response for a fresh-device boot lands.
if (typeof window !== "undefined") {
  onScopeOrHydrationChange(() => {
    cache = null;
    for (const fn of reloadListeners) {
      try {
        fn();
      } catch {
        // listener errors must not break the cache
      }
    }
  });
}

/**
 * Read the persisted camera state for the supplied lensId in the
 * active work-item scope. Returns the default identity camera when
 * no entry has been written yet (or when no work-item scope is
 * active).
 */
export function getAcwCanvasCamera(lensId: string): AcwCanvasCameraState {
  const doc = readDoc();
  return doc.cameras[lensId] ?? ACW_CANVAS_CAMERA_DEFAULT;
}

/**
 * Write a camera state for the supplied lensId in the active work-
 * item scope. Updates the in-memory cache and queues an async write
 * through the scoped storage client. A no-op when no work-item
 * scope is active.
 */
export function setAcwCanvasCamera(
  lensId: string,
  next: AcwCanvasCameraState,
): void {
  const key = getStorageKey();
  if (key === null) return;
  if (typeof lensId !== "string" || lensId.length === 0) return;
  const cur = readDoc();
  const safe: AcwCanvasCameraState = Object.freeze({
    zoom: clampAcwCameraZoom(next.zoom),
    panX: isFiniteNumber(next.panX) ? next.panX : 0,
    panY: isFiniteNumber(next.panY) ? next.panY : 0,
  });
  const cameras = Object.freeze({
    ...cur.cameras,
    [lensId]: safe,
  });
  cache = Object.freeze({ v: 1 as const, cameras });
  writeScoped(key, JSON.stringify({ v: 1, cameras }));
}

/**
 * Subscribe to "the cached document is no longer valid, please re-
 * read" notifications. Fires when the active scope changes OR when
 * a hydration response from the api-server lands. Does NOT fire on
 * a write made through `setAcwCanvasCamera` (the writer already
 * knows what it just wrote, and re-loading would clobber any
 * in-flight local state).
 */
export function subscribeAcwCanvasCameraReload(fn: () => void): () => void {
  reloadListeners.add(fn);
  return () => {
    reloadListeners.delete(fn);
  };
}

// ---- test hook -----------------------------------------------------------

export function __resetAcwCanvasCameraStoreForTest(): void {
  cache = null;
}

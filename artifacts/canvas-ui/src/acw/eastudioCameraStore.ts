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

// Sane bounds. Below 0.25 the cards become unreadable; above 4 the
// canvas edges and grid start to alias unpleasantly. The 0.25
// minimum preserves the pre-Task-#161 ACW zoom contract that
// InteractiveCanvas2D enforced via Math.max(0.25, ...).
export const ACW_CANVAS_CAMERA_MIN_ZOOM = 0.25;
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

// ---- debounced server-write scheduler ------------------------------------
//
// Pan + zoom interactions can fire many state updates per second (one
// per mousemove / wheel / RAF tick). Naively calling writeScoped on
// every one would spam the api-server with PUTs. Instead, we keep the
// L1 cache + L2 localStorage update synchronous (so a same-tab read
// after a write still sees the new value, and a hard-refresh during
// active panning at worst loses the very last ~200ms of motion), and
// we coalesce server PUTs through a per-scoped-key debouncer with a
// 200ms tail. The pending payload is flushed:
//   - automatically when the debounce timer fires
//   - immediately when the active scope changes (so the user's last
//     view on the previous work item / org is durable before its
//     scoped key becomes invalid)
//   - immediately on `beforeunload` / `pagehide` (so closing the tab
//     during active panning still persists the final view)
//   - on demand via `flushAcwCanvasCameraWrites()` (exposed for
//     callers that need a fence point — e.g. an explicit save action
//     or a unit test).
//
// The L1 cache + L2 localStorage updates are NOT debounced because
// they're cheap (a Map.set + a localStorage.setItem) and we want
// reads from `getAcwCanvasCamera` to return the freshest value
// without waiting for the timer to fire.

const WRITE_DEBOUNCE_MS = 200;
const pendingServerWrites = new Map<string, string>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function flushPendingWrites(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingServerWrites.size === 0) return;
  const snapshot = Array.from(pendingServerWrites.entries());
  pendingServerWrites.clear();
  for (const [key, value] of snapshot) {
    writeScoped(key, value);
  }
}

function scheduleServerWrite(scopedKey: string, value: string): void {
  pendingServerWrites.set(scopedKey, value);
  if (pendingTimer !== null) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    flushPendingWrites();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Force any debounced server writes to be flushed immediately.
 * Exposed so callers (component unmount, explicit save, unit tests)
 * can establish a fence point. Idempotent — no-op when no writes
 * are pending.
 */
export function flushAcwCanvasCameraWrites(): void {
  flushPendingWrites();
}

if (typeof window !== "undefined") {
  // Persist the latest pending camera state if the tab is being
  // closed or hidden mid-interaction. `pagehide` is the modern
  // counterpart that also fires for bfcache navigations on iOS.
  window.addEventListener("beforeunload", flushPendingWrites);
  window.addEventListener("pagehide", flushPendingWrites);
}

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
    // Flush any pending writes BEFORE the scope changes so the
    // last-known view on the OUTGOING scope reaches the server
    // before its scoped key is recomputed against the new scope
    // (which would orphan the pending payload).
    flushPendingWrites();
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
 * item scope. Updates the in-memory L1 cache synchronously (so a
 * follow-up `getAcwCanvasCamera` returns the new value immediately)
 * and schedules a debounced server write through the scoped storage
 * client. A no-op when no work-item scope is active.
 *
 * See the "debounced server-write scheduler" block above for the
 * flush triggers (timer tail, scope change, beforeunload/pagehide,
 * explicit `flushAcwCanvasCameraWrites`).
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
  scheduleServerWrite(key, JSON.stringify({ v: 1, cameras }));
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
  pendingServerWrites.clear();
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

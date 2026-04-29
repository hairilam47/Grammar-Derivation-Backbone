// CTAD Logical Design — per-(work item, diagram tab) camera state.
//
// The CtadDesignShell canvas is now a zoomable / pannable surface
// rather than a fixed scrollable area (Task #157). To avoid losing
// the user's view when they switch diagram tabs, switch work items,
// or hard-refresh the page, the camera state (zoom + pan) for each
// of the five logical diagrams (BPMN, ERD, DDL, Sequence, Class) is
// persisted under the active work-item scope using the same scoped
// storage client as every other tenant-scoped CTAD/ACW document.
//
// Storage shape (one document per work item, JSON-encoded):
//
//   {
//     v: 1,
//     cameras: {
//       bpmn:     { zoom: 1, panX: 0, panY: 0 },
//       erd:      { zoom: 1.4, panX: -120, panY: -40 },
//       ...
//     }
//   }
//
// Discipline notes:
//   - Lives under `src/ctad/**` and is therefore scanned by
//     `ctadIsolationInvariants.test-shape.ts`. Every import below
//     is on the CTAD allowlist.
//   - Holds no decision-pipeline state; carries no authority.
//   - Reads return synchronously (L1 cache); writes are write-
//     through to localStorage and the api-server, fire-and-forget.

import {
  onScopeOrHydrationChange,
  readScoped,
  writeScoped,
} from "@/governance/scopedStorageClient";
import { resolveActiveKey } from "@/governance/storageKeyUtils";
import type { AcwDiagramType } from "@/acw/acwStore";

export interface CtadCameraState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const CTAD_CAMERA_DEFAULT: CtadCameraState = Object.freeze({
  zoom: 1,
  panX: 0,
  panY: 0,
});

// Sane bounds. Below 0.2 the cards become unreadable; above 4 the
// canvas edges and grid start to alias unpleasantly.
export const CTAD_CAMERA_MIN_ZOOM = 0.2;
export const CTAD_CAMERA_MAX_ZOOM = 4;

const STORAGE_BASE_KEY = "ctad.design-camera.v1";

interface CameraDoc {
  readonly v: 1;
  readonly cameras: Readonly<
    Partial<Record<AcwDiagramType, CtadCameraState>>
  >;
}

const EMPTY_DOC: CameraDoc = Object.freeze({
  v: 1,
  cameras: Object.freeze({}),
});

let cache: CameraDoc | null = null;
const reloadListeners = new Set<() => void>();

function getStorageKey(): string | null {
  // Camera is per work item — without an active work-item scope
  // there's nothing to persist (the design shell shows an empty
  // canvas in that case anyway).
  return resolveActiveKey(STORAGE_BASE_KEY, /* needsWorkItem */ true);
}

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  if (z < CTAD_CAMERA_MIN_ZOOM) return CTAD_CAMERA_MIN_ZOOM;
  if (z > CTAD_CAMERA_MAX_ZOOM) return CTAD_CAMERA_MAX_ZOOM;
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
    const out: Partial<Record<AcwDiagramType, CtadCameraState>> = {};
    for (const [k, v] of Object.entries(camerasRaw as Record<string, unknown>)) {
      if (v === null || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      if (
        !isFiniteNumber(o.zoom) ||
        !isFiniteNumber(o.panX) ||
        !isFiniteNumber(o.panY)
      ) {
        continue;
      }
      out[k as AcwDiagramType] = Object.freeze({
        zoom: clampZoom(o.zoom),
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
// scope changes or hydration arrives — the React hook in the design
// shell uses this to re-load camera state after a work-item switch
// or after the server response for a fresh-device boot lands.
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
 * Read the persisted camera state for the supplied diagram tab in
 * the active work-item scope. Returns the default identity camera
 * when no entry has been written yet (or when no work-item scope is
 * active).
 */
export function getCamera(diagramType: AcwDiagramType): CtadCameraState {
  const doc = readDoc();
  return doc.cameras[diagramType] ?? CTAD_CAMERA_DEFAULT;
}

/**
 * Write a camera state for the supplied diagram tab in the active
 * work-item scope. Updates the in-memory cache and queues an async
 * write through the scoped storage client. A no-op when no work-
 * item scope is active.
 */
export function setCamera(
  diagramType: AcwDiagramType,
  next: CtadCameraState,
): void {
  const key = getStorageKey();
  if (key === null) return;
  const cur = readDoc();
  const safe: CtadCameraState = Object.freeze({
    zoom: clampZoom(next.zoom),
    panX: isFiniteNumber(next.panX) ? next.panX : 0,
    panY: isFiniteNumber(next.panY) ? next.panY : 0,
  });
  const cameras = Object.freeze({
    ...cur.cameras,
    [diagramType]: safe,
  });
  cache = Object.freeze({ v: 1 as const, cameras });
  writeScoped(key, JSON.stringify({ v: 1, cameras }));
}

/**
 * Subscribe to "the cached document is no longer valid, please re-
 * read" notifications. Fires when the active scope changes OR when
 * a hydration response from the api-server lands. Does NOT fire on
 * a write made through `setCamera` (the writer already knows what
 * it just wrote, and re-loading would clobber any in-flight local
 * state).
 */
export function subscribeCameraReload(fn: () => void): () => void {
  reloadListeners.add(fn);
  return () => {
    reloadListeners.delete(fn);
  };
}

// ---- test hook -----------------------------------------------------------

export function __resetCtadCameraStoreForTest(): void {
  cache = null;
}

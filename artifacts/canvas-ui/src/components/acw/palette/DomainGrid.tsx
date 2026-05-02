// EAStudio Phase 1 — domain grid (Task #99 visual alignment).
//
// Renders a 2x2 layout of flat zones, one per immutable domain
// container. Each zone:
//   - accepts palette drops (`application/x-eastudio-palette-kind`)
//     routed through the validator-gated `createNode` store API
//     with `parentId` set to the domain container's stable id;
//   - renders the container's child nodes as flat cards (`.es-cnode`)
//     wrapping the prototype's icon + primary + secondary text
//     layout. Each card carries `data-acw-node-id` so the unified
//     `StudioEdgeOverlay` can pick up its bounding rect for edge
//     drawing without reaching into the store.
//
// Connect mode wiring: each card listens for clicks. With Connect
// mode on, the first click arms the lens-keyed pending-source
// slice; the second click on a *different* node fires the
// validator-gated `createEdge` (CONNECTS). Same-node click clears
// the pending source. Outside Connect mode a click simply selects
// the node so the right-side properties panel binds to it.
//
// Per-card `node-conn-btn` affordance mirrors the prototype: the
// connect button arms the source for a single CONNECTS edge
// regardless of the current Connect-mode toggle. The prototype's
// per-card delete button is intentionally omitted in this
// alignment pass — node deletion would require a new store
// mutation that the task scope explicitly forbids; the user
// removes nodes via the workspace-wide Clear action in the top
// bar instead.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - All structural mutations route through the validator-gated
//     store API; refusals publish through `acwRefusalChannel` so
//     the lens's inline banner surfaces them verbatim.
//   - Zone accent colours and card border-left tints are pure UI
//     styling — no traffic-light, no judgement, no animation.
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Locate,
  Lock,
  Maximize,
  RefreshCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_CANVAS_CAMERA_DEFAULT,
  ACW_CANVAS_CAMERA_MAX_ZOOM,
  ACW_CANVAS_CAMERA_MIN_ZOOM,
  clampAcwCameraZoom,
  flushAcwCanvasCameraWrites,
  getAcwCanvasCamera,
  setAcwCanvasCamera,
  subscribeAcwCanvasCameraReload,
  type AcwCanvasCameraState,
} from "@/acw/eastudioCameraStore";
import {
  ACW_DOMAIN_LABEL,
  ACW_DOMAIN_ICON,
  ACW_PALETTE,
  paletteItemByKind,
  paletteItemByLabel,
  type PaletteItem,
} from "@/acw/palette/paletteRegistry";
import {
  ACW_DOMAIN_CONTAINERS,
  findDomainContainerById,
} from "@/acw/palette/domainContainerSeed";
import { ACW_PALETTE_DATA_KEY } from "./PalettePanel";
import { StudioEdgeOverlay } from "@/components/acw/studio/StudioEdgeOverlay";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import {
  createEdge,
  createNode,
  deleteEdge,
  type AcwNode,
} from "@/acw/acwStore";
import { publishRefusal } from "@/acw/acwRefusalChannel";
import {
  clearFocusStack,
  getConnectMode,
  getConnectPendingSource,
  getFocusStack,
  getLensLayerVisibility,
  getLensLayers,
  getSelectedNodeId,
  popFocusFrame,
  pushFocusFrame,
  setConnectPendingSource,
  setSelectedNodeId,
  getSelectedEdgeId,
  setSelectedEdgeId,
  setCurrentDomain,
  subscribeViewState,
  getActiveLod,
  getShowOrgOverlay,
} from "@/acw/acwViewState";
import { isVisibleAtLod, type AcwDomainTag } from "@/acw/acwGrammar";
import { NodeContextMenu } from "@/components/acw/studio/NodeContextMenu";
import { cssForOu } from "@/acw/orgUnits/ouHue";
import { getOu, subscribeOus } from "@/acw/orgUnits/ouStore";
import { resolveLabel, resolveIcon } from "@/acw/semantic/techNodeBinding";

const SEAL_LABEL = "Sealed";
const QUADRANT_HINT = "Drop a palette tile here.";
const CONNECT_HINT = "Connect from this node";
const EDGE_DELETE_CONFIRM = "Delete this connection?";
// Phase 3 — fragment used to compose the OU-augmented aria-label
// (e.g. `"Postgres (organisational unit: Platform Tribe)"`).
// Asserted against the placeholder vocabulary so the parenthetical
// phrasing required by the brief cannot drift.
const OU_ARIA_PREFIX = "(organisational unit:";
// Task #161 — camera toolbar / minimap labels. Mirror the
// vocabulary used by the InteractiveCanvas2D camera toolbar so the
// two surfaces feel identical and the same placeholder-vocabulary
// guard applies.
const CAMERA_ZOOM_IN_LABEL = "Zoom in";
const CAMERA_ZOOM_OUT_LABEL = "Zoom out";
const CAMERA_RESET_LABEL = "Reset camera";
const CAMERA_FIT_LABEL = "Fit visible content";
const CAMERA_RECENTRE_LABEL = "Recentre on selection";
const CAMERA_ZOOM_LEVEL_LABEL = "Camera zoom level";
const CAMERA_PAN_HINT_LABEL =
  "Hold space, Alt, or the middle mouse button to pan. Hold Ctrl or Cmd while scrolling to pinch-zoom toward the cursor. Press F to recentre on the selection.";
const MINIMAP_LABEL = "Canvas minimap";
// Canvas Enhancements — focus mode floating bar labels (mirror
// InteractiveCanvas2D so both studio surfaces feel identical).
const FOCUS_FOCUSED_LABEL = "Focused on";
const FOCUS_SHOW_ALL_LABEL = "Show all";

assertAllAcwPlaceholderLanguage([
  SEAL_LABEL,
  QUADRANT_HINT,
  CONNECT_HINT,
  EDGE_DELETE_CONFIRM,
  OU_ARIA_PREFIX,
  CAMERA_ZOOM_IN_LABEL,
  CAMERA_ZOOM_OUT_LABEL,
  CAMERA_RESET_LABEL,
  CAMERA_FIT_LABEL,
  CAMERA_RECENTRE_LABEL,
  CAMERA_ZOOM_LEVEL_LABEL,
  CAMERA_PAN_HINT_LABEL,
  MINIMAP_LABEL,
  FOCUS_FOCUSED_LABEL,
  FOCUS_SHOW_ALL_LABEL,
]);

// Local view state shape — same convention as
// InteractiveCanvas2D so a reader who knows one knows the other.
// `panX` / `panY` is the canonical store field; we keep `x` / `y`
// internally to match the math vocabulary.
interface DomainGridView {
  x: number;
  y: number;
  zoom: number;
}
const DG_INITIAL_VIEW: DomainGridView = {
  x: ACW_CANVAS_CAMERA_DEFAULT.panX,
  y: ACW_CANVAS_CAMERA_DEFAULT.panY,
  zoom: ACW_CANVAS_CAMERA_DEFAULT.zoom,
};
function dgViewFromCamera(c: AcwCanvasCameraState): DomainGridView {
  return { x: c.panX, y: c.panY, zoom: c.zoom };
}
function dgCameraFromView(v: DomainGridView): AcwCanvasCameraState {
  return { panX: v.x, panY: v.y, zoom: v.zoom };
}
const DG_CAMERA_ZOOM_BUTTON_STEP = 1.2;
const DG_CAMERA_WHEEL_PINCH_SCALE = 0.0015;

export interface DomainGridProps {
  readonly lensId: string;
}

export function DomainGrid({ lensId }: DomainGridProps) {
  const workspace = useAcwWorkspace();
  // Re-read view-state on subscriber tick so highlighting tracks
  // the active domain and the unified-overlay's selected-edge slice.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;
  // Re-render when OU registry mutates (Add / Remove / rename) so
  // the overlay tint and aria augmentation track the current store.
  const [ouTick, setOuTick] = useState(0);
  useEffect(() => subscribeOus(() => setOuTick((t) => t + 1)), []);
  // Canvas Enhancements — focus mode invalidation tick. Bumped whenever
  // the per-lens focus stack changes so the descendants filter and the
  // floating "Show all" bar both re-read the current stack.
  const [focusTick, setFocusTick] = useState(0);
  void ouTick;
  // Phase 3 OU overlay slice — when ON we tint each NodeCard whose
  // `organisationalUnitId` is set with `cssForOu(id)` (S=35%, L=22%).
  // The slice is per-lens; the toggle lives in StudioTopBar.
  const showOrgOverlay = getShowOrgOverlay(lensId);
  // Phase 3 right-click "Swap technology" menu — host-owned popover
  // state. The menu is portal-positioned at the cursor coordinates;
  // outside-click and Escape both dismiss. The host owns the state
  // so the menu component itself stays a presentational leaf and
  // never reaches into the view-state singleton.
  const [ctxMenu, setCtxMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (ctxMenu === null) return;
    const onDocClick = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);
  const selectedEdgeId = getSelectedEdgeId(lensId);
  const selectedNodeId = getSelectedNodeId(lensId);
  const connectOn = getConnectMode(lensId);
  const pendingSource = getConnectPendingSource(lensId);
  // EAStudio Phase 2 (LoS framework) — current Level of Specification
  // for this lens. Used below to drop nodes whose declared `lodRange`
  // does not include the active level (e.g. L3-only generated nodes
  // must not appear in the L1 / L2 flat grids).
  const activeLod = getActiveLod(lensId);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // Task #161 — camera viewport (the camera-transformed surface
  // the user pans / zooms across). The four-quadrant grid plus
  // StudioEdgeOverlay live inside this viewport; the toolbar and
  // minimap sit OUTSIDE it (absolutely positioned over the wrap)
  // so they ignore the camera transform.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Persistent per-(org, workItem, lensId) camera state. The store
  // is the source of persistence; React state mirrors it at runtime
  // and `commitView` is the single mutation point.
  const [view, setViewRaw] = useState<DomainGridView>(() =>
    dgViewFromCamera(getAcwCanvasCamera(lensId)),
  );
  // Canvas Enhancements — stable ref to the current view so that the
  // fitToSelectedCard callback (used in the F-key handler, which is
  // bound once at mount) always reads the latest pan / zoom without
  // needing to be rebound on every camera update.
  const viewRef = useRef<DomainGridView>(view);
  viewRef.current = view;
  useEffect(() => {
    setViewRaw(dgViewFromCamera(getAcwCanvasCamera(lensId)));
  }, [lensId]);
  useEffect(() => {
    return subscribeAcwCanvasCameraReload(() => {
      setViewRaw(dgViewFromCamera(getAcwCanvasCamera(lensId)));
    });
  }, [lensId]);
  // Flush any pending debounced server write when the canvas
  // unmounts or the lens identity changes, so the last-known view
  // is durable on the api-server before tear-down.
  useEffect(() => {
    return () => {
      flushAcwCanvasCameraWrites();
    };
  }, [lensId]);
  // Canvas Enhancements — clear the per-lens focus stack on lens
  // change or unmount so a stale stack never bleeds into a future
  // session or a different lens reusing the same lensId path.
  useEffect(() => {
    return () => {
      clearFocusStack(lensId);
    };
  }, [lensId]);
  const commitView = useCallback(
    (next: DomainGridView | ((prev: DomainGridView) => DomainGridView)) => {
      setViewRaw((prev) => {
        const candidate = typeof next === "function" ? next(prev) : next;
        const safe: DomainGridView = {
          x: Number.isFinite(candidate.x) ? candidate.x : prev.x,
          y: Number.isFinite(candidate.y) ? candidate.y : prev.y,
          zoom: clampAcwCameraZoom(candidate.zoom),
        };
        setAcwCanvasCamera(lensId, dgCameraFromView(safe));
        return safe;
      });
    },
    [lensId],
  );

  // Spacebar-pan modifier (mirrors InteractiveCanvas2D / CTAD).
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);
  useEffect(() => {
    spaceHeldRef.current = spaceHeld;
  }, [spaceHeld]);

  // Pan-drag scratch state. Held in a ref so mouse handlers stay
  // synchronous and never need a render to observe the latest pan
  // origin (matching the InteractiveCanvas2D pattern).
  const panRef = useRef<{
    startX: number;
    startY: number;
    vx: number;
    vy: number;
  } | null>(null);

  // ---- Camera viewport pan / pinch handlers --------------------
  const isPanGesture = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) =>
      e.button === 1 || (e.button === 0 && (e.altKey || spaceHeldRef.current)),
    [],
  );
  const onViewportMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanGesture(e)) return;
    // Stop propagation so the page selection never starts when the
    // user pans, and so the underlying card click handlers never
    // fire on a pan-intent left-click.
    e.preventDefault();
    e.stopPropagation();
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      vx: view.x,
      vy: view.y,
    };
  };
  const onViewportMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan === null) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    commitView((v) => ({ ...v, x: pan.vx + dx, y: pan.vy + dy }));
  };
  const onViewportMouseUp = () => {
    panRef.current = null;
  };
  // Native (non-passive) wheel handler — Ctrl/Cmd + wheel = pinch
  // zoom toward cursor; bare wheel = identity-preserving zoom.
  // Kept in a useEffect so we can pass `{passive: false}` and call
  // preventDefault to suppress the host page scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (ev: globalThis.WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      if (ev.ctrlKey || ev.metaKey) {
        commitView((v) => {
          const factor = Math.exp(-ev.deltaY * DG_CAMERA_WHEEL_PINCH_SCALE);
          const nextZoom = clampAcwCameraZoom(v.zoom * factor);
          if (nextZoom === v.zoom) return v;
          const ax = (cx - v.x) / v.zoom;
          const ay = (cy - v.y) / v.zoom;
          return { x: cx - ax * nextZoom, y: cy - ay * nextZoom, zoom: nextZoom };
        });
        return;
      }
      const delta = -ev.deltaY * 0.001;
      commitView((v) => ({ ...v, zoom: clampAcwCameraZoom(v.zoom + delta) }));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [commitView]);

  // ---- Camera helpers (toolbar / F-key) ------------------------
  const viewportSize = useCallback((): { w: number; h: number } => {
    const el = viewportRef.current;
    if (!el) return { w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }, []);
  const gridLayoutSize = useCallback((): { w: number; h: number } => {
    const g = gridRef.current;
    if (!g) return { w: 0, h: 0 };
    // offsetWidth / offsetHeight are the UNtransformed layout box
    // — exactly what we need to compute the fit-to-content zoom
    // (transform: scale(...) does not change offsetWidth).
    return { w: g.offsetWidth, h: g.offsetHeight };
  }, []);
  const fitContent = useCallback(() => {
    const { w: vw, h: vh } = viewportSize();
    const { w: gw, h: gh } = gridLayoutSize();
    if (vw === 0 || vh === 0 || gw === 0 || gh === 0) return;
    const margin = 0.05;
    const targetW = vw * (1 - margin * 2);
    const targetH = vh * (1 - margin * 2);
    const zoom = clampAcwCameraZoom(Math.min(targetW / gw, targetH / gh));
    const x = (vw - gw * zoom) / 2;
    const y = (vh - gh * zoom) / 2;
    commitView({ x, y, zoom });
  }, [commitView, gridLayoutSize, viewportSize]);
  const recentreOnSelection = useCallback(() => {
    // Recentre = keep current zoom, translate so the selected
    // node's centre is in the viewport centre. Falls back to fit-
    // content when no node is selected (the closest "show me what
    // there is" affordance available without a selection).
    const { w: vw, h: vh } = viewportSize();
    if (vw === 0 || vh === 0) {
      fitContent();
      return;
    }
    const grid = gridRef.current;
    const vp = viewportRef.current;
    if (!grid || !vp || selectedNodeId === null) {
      fitContent();
      return;
    }
    const target = grid.querySelector<HTMLElement>(
      `[data-acw-node-id="${CSS.escape(selectedNodeId)}"]`,
    );
    if (target === null) {
      fitContent();
      return;
    }
    const cardRect = target.getBoundingClientRect();
    const vpRect = vp.getBoundingClientRect();
    // Card centre, in viewport-screen coordinates (already includes
    // the current pan / zoom).
    const cardCenterScreenX = cardRect.left + cardRect.width / 2 - vpRect.left;
    const cardCenterScreenY = cardRect.top + cardRect.height / 2 - vpRect.top;
    // Desired: card centre at viewport centre. Shift pan by the
    // delta. Zoom stays the same.
    commitView((v) => ({
      x: v.x + (vw / 2 - cardCenterScreenX),
      y: v.y + (vh / 2 - cardCenterScreenY),
      zoom: v.zoom,
    }));
  }, [commitView, fitContent, selectedNodeId, viewportSize]);
  const zoomAroundCentre = useCallback(
    (factor: number) => {
      const { w: vw, h: vh } = viewportSize();
      if (vw === 0 || vh === 0) return;
      commitView((v) => {
        const nextZoom = clampAcwCameraZoom(v.zoom * factor);
        if (nextZoom === v.zoom) return v;
        const cx = vw / 2;
        const cy = vh / 2;
        const ax = (cx - v.x) / v.zoom;
        const ay = (cy - v.y) / v.zoom;
        return { x: cx - ax * nextZoom, y: cy - ay * nextZoom, zoom: nextZoom };
      });
    },
    [commitView, viewportSize],
  );
  const resetCamera = useCallback(() => {
    commitView(DG_INITIAL_VIEW);
  }, [commitView]);

  // Keyboard listener: spacebar = pan modifier; F = recentre on
  // selection. Skipped while the user is typing in an input /
  // textarea / contenteditable so the Properties panel never loses
  // a keystroke.
  //
  // The handler must always invoke the LATEST `recentreOnSelection`
  // (its useCallback identity depends on `selectedNodeId`,
  // `viewportSize`, and `commitView` — any of those changing would
  // otherwise add+remove window listeners on every render). To avoid
  // that listener churn during high-frequency pan/zoom/drag, we hold
  // the latest closure in a ref, refresh that ref on every render,
  // and bind the window listeners exactly once on mount.
  const recentreOnSelectionRef = useRef(recentreOnSelection);
  recentreOnSelectionRef.current = recentreOnSelection;
  // Canvas Enhancements — stable lensId ref so the keyboard handler
  // (bound once at mount with empty deps) always reads the current
  // lensId without needing to be rebound on every render.
  const lensIdRef = useRef(lensId);
  lensIdRef.current = lensId;
  // Canvas Enhancements — zoom-to-fit the selected card in the
  // DomainGrid viewport. Called immediately after pushFocusFrame so
  // the focused node fills the screen. Falls back to fitContent when
  // no node is selected or the card cannot be found in the DOM.
  const fitToSelectedCard = useCallback(() => {
    if (selectedNodeId === null) {
      fitContent();
      return;
    }
    const grid = gridRef.current;
    const vp = viewportRef.current;
    if (!grid || !vp) {
      fitContent();
      return;
    }
    const card = grid.querySelector<HTMLElement>(
      `[data-acw-node-id="${CSS.escape(selectedNodeId)}"]`,
    );
    if (card === null) {
      fitContent();
      return;
    }
    const cardRect = card.getBoundingClientRect();
    const vpRect = vp.getBoundingClientRect();
    const vw = vpRect.width;
    const vh = vpRect.height;
    if (vw === 0 || vh === 0) return;
    // Card dimensions in canvas (un-zoomed) space.
    const cardW = cardRect.width / viewRef.current.zoom;
    const cardH = cardRect.height / viewRef.current.zoom;
    // Card centre in canvas space (undoes current pan + zoom).
    const cardCenterSx = cardRect.left + cardRect.width / 2 - vpRect.left;
    const cardCenterSy = cardRect.top + cardRect.height / 2 - vpRect.top;
    const cardCenterCx = (cardCenterSx - viewRef.current.x) / viewRef.current.zoom;
    const cardCenterCy = (cardCenterSy - viewRef.current.y) / viewRef.current.zoom;
    // Zoom to fit with 15% margin on each side.
    const margin = 0.15;
    const nextZoom = clampAcwCameraZoom(
      Math.min(
        (vw * (1 - margin * 2)) / Math.max(cardW, 1),
        (vh * (1 - margin * 2)) / Math.max(cardH, 1),
      ),
    );
    const x = vw / 2 - cardCenterCx * nextZoom;
    const y = vh / 2 - cardCenterCy * nextZoom;
    commitView({ x, y, zoom: nextZoom });
  }, [commitView, fitContent, selectedNodeId]);
  const fitToSelectedCardRef = useRef(fitToSelectedCard);
  fitToSelectedCardRef.current = fitToSelectedCard;
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space") {
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          setSpaceHeld(true);
        }
        e.preventDefault();
        return;
      }
      if (
        (e.key === "f" || e.key === "F") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const lid = lensIdRef.current;
        const selId = getSelectedNodeId(lid);
        if (selId !== null) {
          // Canvas Enhancements — focus mode: push the selected node
          // onto the per-lens stack and zoom to fit it immediately.
          pushFocusFrame(lid, [selId]);
          setFocusTick((t) => t + 1);
          fitToSelectedCardRef.current();
        } else {
          recentreOnSelectionRef.current();
        }
        return;
      }
      if (e.key === "Escape" && !e.ctrlKey && !e.metaKey) {
        // Canvas Enhancements — pop the focus stack. Only fires when
        // there is a stack to pop and connect mode is inactive
        // (chained after StudioCanvas Escape for L3 exit).
        const lid = lensIdRef.current;
        const stack = getFocusStack(lid);
        if (stack.length > 0 && !getConnectMode(lid)) {
          e.preventDefault();
          popFocusFrame(lid);
          setFocusTick((t) => t + 1);
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const nodeById = useMemo(() => {
    const m = new Map<string, AcwNode>();
    for (const node of workspace.structureGraph.nodes) m.set(node.id, node);
    return m;
  }, [workspace.structureGraph.nodes]);

  // Edge click handler — per Task #99 step 7 the prototype binds a
  // click on an edge path to a confirm dialog that deletes the
  // edge through the validator. We route the destructive call
  // exclusively through the validator-gated `deleteEdge` store
  // mutation; the dialog is the only confirm UX (no inline SVG
  // pill).
  const onEdgeOverlayClick = (id: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(EDGE_DELETE_CONFIRM);
      if (!ok) return;
    }
    const r = deleteEdge(id);
    setSelectedEdgeId(lensId, null);
    if (!r.ok) publishRefusal(r.reason);
  };
  // Retained for the overlay's existing `onEdgeDelete` API surface;
  // the confirm dialog above is the canonical entry point now, so
  // this just forwards through the validator.
  const onEdgeOverlayDelete = (id: string) => {
    const r = deleteEdge(id);
    setSelectedEdgeId(lensId, null);
    if (!r.ok) publishRefusal(r.reason);
  };

  // Click on a node card. Connect mode + connect-button click both
  // route through this so source-then-destination semantics live in
  // one place.
  const onNodeClick = (
    id: string,
    explicitConnect: boolean,
  ) => {
    if (explicitConnect || connectOn) {
      if (pendingSource === null) {
        setConnectPendingSource(lensId, id);
        return;
      }
      if (pendingSource === id) {
        setConnectPendingSource(lensId, null);
        return;
      }
      const r = createEdge({
        kind: "CONNECTS",
        fromId: pendingSource,
        toId: id,
      });
      setConnectPendingSource(lensId, null);
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    // Idle click: select the node so the right-side panel opens.
    if (selectedNodeId === id) {
      setSelectedNodeId(lensId, null);
    } else {
      setSelectedNodeId(lensId, id);
      setSelectedEdgeId(lensId, null);
    }
  };

  // Minimap geometry (Task #161). Renders one rectangle per zone
  // (the four immutable domain quadrants are the natural minimap
  // landmarks here) plus a viewport rectangle showing what's
  // currently visible in the camera. The minimap is read-only —
  // no click-to-pan — so the camera viewport's existing pan / pinch
  // / drop semantics remain unambiguous.
  const minimapDescriptor = (() => {
    const grid = gridRef.current;
    const vp = viewportRef.current;
    if (!grid || !vp) return null;
    const gw = grid.offsetWidth;
    const gh = grid.offsetHeight;
    if (gw === 0 || gh === 0) return null;
    const vpRect = vp.getBoundingClientRect();
    const vw = vpRect.width;
    const vh = vpRect.height;
    if (vw === 0 || vh === 0) return null;
    // Viewport rectangle in grid (untransformed) coordinates.
    const vbX = view.zoom > 0 ? -view.x / view.zoom : 0;
    const vbY = view.zoom > 0 ? -view.y / view.zoom : 0;
    const vbW = view.zoom > 0 ? vw / view.zoom : gw;
    const vbH = view.zoom > 0 ? vh / view.zoom : gh;
    const worldMinX = Math.min(0, vbX);
    const worldMinY = Math.min(0, vbY);
    const worldMaxX = Math.max(gw, vbX + vbW);
    const worldMaxY = Math.max(gh, vbY + vbH);
    const worldW = Math.max(1, worldMaxX - worldMinX);
    const worldH = Math.max(1, worldMaxY - worldMinY);
    const MM_W = 140;
    const MM_H = 90;
    const scale = Math.min(MM_W / worldW, MM_H / worldH);
    const offsetX = (MM_W - worldW * scale) / 2;
    const offsetY = (MM_H - worldH * scale) / 2;
    const project = (x: number, y: number, w: number, h: number) => ({
      x: offsetX + (x - worldMinX) * scale,
      y: offsetY + (y - worldMinY) * scale,
      w: Math.max(1, w * scale),
      h: Math.max(1, h * scale),
    });
    const grid4 = project(0, 0, gw, gh);
    const halfW = grid4.w / 2;
    const halfH = grid4.h / 2;
    const quadrants = [
      { key: "tl", x: grid4.x, y: grid4.y, w: halfW, h: halfH },
      { key: "tr", x: grid4.x + halfW, y: grid4.y, w: halfW, h: halfH },
      { key: "bl", x: grid4.x, y: grid4.y + halfH, w: halfW, h: halfH },
      { key: "br", x: grid4.x + halfW, y: grid4.y + halfH, w: halfW, h: halfH },
    ];
    const viewportBox = project(vbX, vbY, vbW, vbH);
    return {
      MM_W,
      MM_H,
      gridProjected: grid4,
      quadrants,
      viewportBox,
    };
  })();

  // Canvas Enhancements — layer visibility filter.
  // Computed once per render (cheap) and shared by every domain zone
  // so all four grids see the same filter without duplicating the
  // layer-state read. `null` means "no filter active".
  const dgVisibleLayerIds = (() => {
    const layers = getLensLayers(lensId);
    if (layers.length === 0) return null;
    const vis = getLensLayerVisibility(lensId);
    if (!layers.some((l) => vis[l.id] === false)) return null;
    return new Set(layers.filter((l) => vis[l.id] !== false).map((l) => l.id));
  })();

  // Canvas Enhancements — focus mode node filter.
  // When the per-lens focus stack is non-empty, only the nodes in the
  // topmost frame are rendered. `null` means "not in focus mode".
  void focusTick;
  const dgFocusStack = getFocusStack(lensId);
  const dgFocusedNodeIds: ReadonlySet<string> | null =
    dgFocusStack.length > 0
      ? new Set(dgFocusStack[dgFocusStack.length - 1])
      : null;

  return (
    <div className="es-canvas-wrap" style={{ overflow: "hidden" }}>
      {/* Camera toolbar (Task #161). Top-left so it never collides
          with StudioTopBar affordances and stays visible at every
          zoom level. */}
      <div
        className="absolute z-20 flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1 py-0.5 backdrop-blur-sm"
        style={{ position: "absolute", top: 8, left: 8 }}
        data-testid="acw-studio-camera-toolbar"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomAroundCentre(DG_CAMERA_ZOOM_BUTTON_STEP)}
          disabled={view.zoom >= ACW_CANVAS_CAMERA_MAX_ZOOM - 1e-6}
          className="p-1 rounded hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
          title={CAMERA_ZOOM_IN_LABEL}
          aria-label={CAMERA_ZOOM_IN_LABEL}
          data-testid="acw-studio-camera-zoom-in"
        >
          <ZoomIn aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={() => zoomAroundCentre(1 / DG_CAMERA_ZOOM_BUTTON_STEP)}
          disabled={view.zoom <= ACW_CANVAS_CAMERA_MIN_ZOOM + 1e-6}
          className="p-1 rounded hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
          title={CAMERA_ZOOM_OUT_LABEL}
          aria-label={CAMERA_ZOOM_OUT_LABEL}
          data-testid="acw-studio-camera-zoom-out"
        >
          <ZoomOut aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={resetCamera}
          className="p-1 rounded hover:bg-muted/40"
          title={CAMERA_RESET_LABEL}
          aria-label={CAMERA_RESET_LABEL}
          data-testid="acw-studio-camera-reset"
        >
          <RefreshCcw aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={fitContent}
          className="p-1 rounded hover:bg-muted/40"
          title={CAMERA_FIT_LABEL}
          aria-label={CAMERA_FIT_LABEL}
          data-testid="acw-studio-camera-fit"
        >
          <Maximize aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={recentreOnSelection}
          disabled={selectedNodeId === null}
          className="p-1 rounded hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
          title={CAMERA_RECENTRE_LABEL}
          aria-label={CAMERA_RECENTRE_LABEL}
          data-testid="acw-studio-camera-recentre"
        >
          <Locate aria-hidden="true" size={12} />
        </button>
        <span
          className="px-1 text-[10px] tabular-nums tracking-tight text-muted-foreground"
          data-testid="acw-studio-camera-zoom-readout"
          aria-label={CAMERA_ZOOM_LEVEL_LABEL}
          title={CAMERA_ZOOM_LEVEL_LABEL}
        >
          {Math.round(view.zoom * 100)}%
        </span>
      </div>
      {/* Pan-hint for discoverability — bottom-left, low priority. */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 8,
          zIndex: 20,
          fontSize: 9,
          letterSpacing: "0.04em",
          color: "var(--text3)",
          pointerEvents: "none",
        }}
        data-testid="acw-studio-camera-pan-hint"
        title={CAMERA_PAN_HINT_LABEL}
      >
        {CAMERA_PAN_HINT_LABEL}
      </div>
      {/* Camera viewport. Captures pan / pinch gestures; the
          transformed `.es-zones` grid lives inside. */}
      <div
        ref={viewportRef}
        data-testid="acw-studio-camera-viewport"
        onMouseDown={onViewportMouseDown}
        onMouseMove={onViewportMouseMove}
        onMouseUp={onViewportMouseUp}
        onMouseLeave={onViewportMouseUp}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          cursor: panRef.current
            ? "grabbing"
            : spaceHeld
              ? "grab"
              : "default",
        }}
      >
        <div
          data-testid="acw-studio-camera-transform"
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
            // Without an explicit width/height the inner grid would
            // collapse because the parent is positioned (inset:0
            // gives it size, the transform inherits it).
          }}
        >
      <div
        ref={gridRef}
        data-testid="acw-studio-domain-grid"
        className="es-zones"
        style={{ position: "relative", width: "100%", height: "100%" }}
      >
        {ACW_DOMAIN_CONTAINERS.map((spec) => {
          const container = findDomainContainerById(spec.id);
          // Per Task #99 step 6: each zone renders every leaf
          // descendant of its domain container as a flat list,
          // matching the prototype. Walk the parent chain for
          // every non-container node and include those whose
          // ancestry hits this domain container. Sealed domain
          // containers themselves are excluded.
          const allNodes = workspace.structureGraph.nodes;
          const nodeById = new Map(allNodes.map((n) => [n.id, n] as const));
          const descendants = allNodes.filter((n) => {
            if (n.id === spec.id) return false;
            if (n.isDomainContainer === true) return false;
            // EAStudio Phase 2 (LoS framework) — drop nodes whose
            // declared `lodRange` does not include the active LoS.
            // L3-only generated nodes (`lodRange: [3, 3]`) must
            // never leak into the L1 / L2 flat grids; legacy nodes
            // without a `lodRange` always pass.
            if (!isVisibleAtLod(n, activeLod)) return false;
            // Canvas Enhancements — layer visibility filter.
            // A node with a non-empty layerIds array must intersect
            // the active layer set; empty / absent → always visible.
            if (dgVisibleLayerIds !== null) {
              if (n.layerIds && n.layerIds.length > 0) {
                if (!n.layerIds.some((id) => dgVisibleLayerIds.has(id))) {
                  return false;
                }
              }
            }
            // Canvas Enhancements — focus mode filter.
            // When the stack is non-empty only nodes in the top frame
            // are rendered so the user sees only their selection.
            if (dgFocusedNodeIds !== null && !dgFocusedNodeIds.has(n.id)) {
              return false;
            }
            let cursor: string | null = n.parentId;
            let guard = 0;
            while (cursor !== null && guard < 1024) {
              if (cursor === spec.id) return true;
              const parent = nodeById.get(cursor);
              if (parent === undefined) return false;
              cursor = parent.parentId;
              guard += 1;
            }
            return false;
          });
          return (
            <Zone
              key={spec.id}
              lensId={lensId}
              domain={spec.domain}
              containerId={spec.id}
              containerNode={container}
              children={descendants}
              onNodeClick={onNodeClick}
              selectedNodeId={selectedNodeId}
              pendingSource={pendingSource}
              showOrgOverlay={showOrgOverlay}
              onNodeContextMenu={(id, x, y) =>
                setCtxMenu({ nodeId: id, x, y })
              }
            />
          );
        })}
        <StudioEdgeOverlay
          gridRef={gridRef}
          edges={workspace.structureGraph.edges}
          selectedEdgeId={selectedEdgeId}
          pendingSourceId={pendingSource}
          onEdgeClick={onEdgeOverlayClick}
          onEdgeDelete={onEdgeOverlayDelete}
        />
      </div>
        </div>
      </div>
      {/* Camera minimap (Task #161). Bottom-right; read-only. */}
      {minimapDescriptor !== null ? (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            zIndex: 20,
            background: "var(--bg1)",
            border: "1px solid var(--border2)",
            borderRadius: 6,
            padding: 4,
            pointerEvents: "none",
          }}
          data-testid="acw-studio-camera-minimap"
          aria-label={MINIMAP_LABEL}
          title={MINIMAP_LABEL}
        >
          <svg
            width={minimapDescriptor.MM_W}
            height={minimapDescriptor.MM_H}
            style={{ display: "block" }}
            aria-hidden="true"
          >
            {minimapDescriptor.quadrants.map((q) => (
              <rect
                key={q.key}
                x={q.x}
                y={q.y}
                width={q.w}
                height={q.h}
                fill="var(--bg2)"
                stroke="var(--border2)"
                strokeWidth={0.5}
              />
            ))}
            <rect
              data-testid="acw-studio-camera-minimap-viewport"
              x={minimapDescriptor.viewportBox.x}
              y={minimapDescriptor.viewportBox.y}
              width={minimapDescriptor.viewportBox.w}
              height={minimapDescriptor.viewportBox.h}
              fill="rgba(120, 180, 240, 0.18)"
              stroke="var(--accent, #6aa6ff)"
              strokeWidth={1}
            />
          </svg>
        </div>
      ) : null}
      {/*
        Phase 3 right-click "Swap technology" menu — anchored at the
        cursor coordinates the host captured. The host listens for
        outside-click and Escape and clears `ctxMenu`; the menu
        component itself is a presentational leaf.
      */}
      {ctxMenu !== null
        ? (() => {
            const node = workspace.structureGraph.nodes.find(
              (n) => n.id === ctxMenu.nodeId,
            );
            if (node === undefined) return null;
            return (
              <NodeContextMenu
                node={node}
                x={ctxMenu.x}
                y={ctxMenu.y}
                activeLod={activeLod}
                lensId={lensId}
                onClose={() => setCtxMenu(null)}
              />
            );
          })()
        : null}
      {/* Canvas Enhancements — focus mode floating bar. Mirrors the
          IC2D floating bar: appears at the top-centre when the per-
          lens focus stack is non-empty. "Show all" clears the stack. */}
      {dgFocusedNodeIds !== null ? (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 25,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg1, hsl(var(--background)))",
            border: "1px solid var(--border2, hsl(var(--border)))",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            whiteSpace: "nowrap",
            pointerEvents: "auto",
          }}
          data-testid="acw-studio-dg-focus-bar"
        >
          <span>
            {FOCUS_FOCUSED_LABEL} {dgFocusedNodeIds.size} node
            {dgFocusedNodeIds.size !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              clearFocusStack(lensId);
              setFocusTick((t) => t + 1);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 4px",
              fontSize: 11,
              textDecoration: "underline",
            }}
            data-testid="acw-studio-dg-focus-show-all"
          >
            {FOCUS_SHOW_ALL_LABEL}
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ZoneProps {
  readonly lensId: string;
  readonly domain: AcwDomainTag;
  readonly containerId: string;
  readonly containerNode: AcwNode | undefined;
  readonly children: readonly AcwNode[];
  readonly onNodeClick: (id: string, explicitConnect: boolean) => void;
  readonly selectedNodeId: string | null;
  readonly pendingSource: string | null;
  readonly showOrgOverlay: boolean;
  readonly onNodeContextMenu: (
    nodeId: string,
    x: number,
    y: number,
  ) => void;
}

function Zone(props: ZoneProps) {
  const {
    lensId,
    domain,
    containerId,
    containerNode,
    children,
    onNodeClick,
    selectedNodeId,
    pendingSource,
    showOrgOverlay,
    onNodeContextMenu,
  } = props;
  const Icon = ACW_DOMAIN_ICON[domain];
  const [isOver, setIsOver] = useState(false);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(ACW_PALETTE_DATA_KEY)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isOver) setIsOver(true);
  };
  const onDragLeave = () => {
    if (isOver) setIsOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const paletteKind = e.dataTransfer.getData(ACW_PALETTE_DATA_KEY);
    if (paletteKind === "") return;
    e.preventDefault();
    setIsOver(false);
    if (containerNode === undefined) {
      publishRefusal(
        "The domain container is not present. Reload the workspace to re-seed it.",
      );
      return;
    }
    setCurrentDomain(lensId, domain);

    const item = paletteItemByKind(paletteKind);
    if (item === undefined) {
      publishRefusal(`The palette item "${paletteKind}" is not registered.`);
      return;
    }
    if (item.domain !== domain) {
      publishRefusal(
        `The palette item "${item.label}" belongs to the ${item.domain} domain and is not permitted inside the ${domain} domain quadrant.`,
      );
      return;
    }
    // EAStudio Path B Phase 1 (Task #113) — forward the palette
    // tile's default semantic bindings onto the new node when the
    // tile declares them. Spread is used so an undefined default
    // stays absent on the request (and therefore on the persisted
    // node), preserving byte-identical shape for tiles that do not
    // ship a binding.
    const r = createNode({
      type: item.elementType,
      parentId: containerId,
      label: item.label,
      domainTag: domain,
      ...(item.boundTechnologyCategory !== undefined
        ? { boundTechnologyCategory: item.boundTechnologyCategory }
        : {}),
      ...(item.boundParam !== undefined
        ? { boundParam: item.boundParam }
        : {}),
    });
    if (!r.ok) publishRefusal(r.reason);
  };

  return (
    <section
      role="region"
      aria-label={ACW_DOMAIN_LABEL[domain]}
      data-testid={`acw-studio-quadrant-${domain}`}
      data-domain={domain}
      data-container-id={containerId}
      data-drop-active={isOver ? "true" : "false"}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="es-zone"
    >
      <header className="es-zone-head">
        <div className="es-zone-title">
          <Icon className="w-3.5 h-3.5" />
          <span>{ACW_DOMAIN_LABEL[domain]}</span>
        </div>
        {/* Per Task #99 step 6, the zone header carries a live
            descendant count badge (matching the prototype's
            `.zone-badge` element). The container itself remains
            sealed; the lock pictogram moves to a tooltip on the
            badge so the constraint is still discoverable without
            crowding the title row. */}
        <span
          className="es-zone-badge"
          data-testid={`acw-studio-quadrant-badge-${domain}`}
          data-count={children.length}
          title={SEAL_LABEL}
        >
          <Lock className="w-3 h-3" aria-hidden="true" />
          <span>{children.length}</span>
        </span>
      </header>
      <div
        className="es-zone-nodes"
        data-testid={`acw-studio-quadrant-body-${domain}`}
      >
        {children.length === 0 ? (
          <p className="es-zone-empty">{QUADRANT_HINT}</p>
        ) : (
          children.map((node) => {
            const ouId = node.organisationalUnitId;
            const ouName =
              ouId !== undefined ? getOu(ouId)?.name ?? null : null;
            // Overlay tint is applied only when (a) the per-lens
            // overlay slice is ON and (b) the node carries an OU id
            // and (c) the id resolves to a present unit. A dangling
            // id (the reading validator already rejects this on
            // load, but a removed-then-undo race could theoretically
            // surface one) silently skips tinting.
            const overlayCss =
              showOrgOverlay && ouId !== undefined && ouName !== null
                ? cssForOu(ouId)
                : null;
            return (
              <NodeCard
                key={node.id}
                node={node}
                domain={domain}
                isSelected={selectedNodeId === node.id}
                isPendingSource={pendingSource === node.id}
                overlayCss={overlayCss}
                ouName={ouName}
                onClick={() => onNodeClick(node.id, false)}
                onConnect={() => onNodeClick(node.id, true)}
                onContextMenu={(x, y) => onNodeContextMenu(node.id, x, y)}
                hasBoundParam={node.boundParam !== undefined}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

interface NodeCardProps {
  readonly node: AcwNode;
  readonly domain: AcwDomainTag;
  readonly isSelected: boolean;
  readonly isPendingSource: boolean;
  // Phase 3 OU overlay — `null` means no tint (overlay off, or
  // node has no OU bound). When set, the host has already resolved
  // it through `cssForOu` (S=35%, L=22%, categorical-only).
  readonly overlayCss: string | null;
  // Phase 3 OU overlay — display name of the bound unit (when
  // resolvable). Used to augment the card's aria-label so screen
  // readers announce the assignment without depending on colour.
  readonly ouName: string | null;
  readonly onClick: () => void;
  readonly onConnect: () => void;
  // Phase 3 right-click "Swap technology" menu — receives the
  // viewport coordinates the host should anchor the popover at.
  readonly onContextMenu: (x: number, y: number) => void;
  // Phase 3 — gate the swap menu to nodes that actually carry a
  // CTAD binding. For unbound nodes the host releases the native
  // browser context menu rather than presenting an empty popover.
  readonly hasBoundParam: boolean;
}

// Resolve which palette tile (if any) was used to materialise this
// node. Used for the icon and the secondary `subLabel` line; falls
// back to the first tile of the same domain so a node materialised
// outside the palette still gets a sensible icon and a domain-level
// sub-line rather than rendering the literal element type token.
function resolveTile(node: AcwNode, domain: AcwDomainTag): PaletteItem {
  const byLabel = paletteItemByLabel(node.label);
  if (byLabel !== undefined && byLabel.domain === domain) return byLabel;
  const fallback = ACW_PALETTE.find((p) => p.domain === domain);
  // ACW_PALETTE always contains at least one tile per domain; the
  // module-load assertion in paletteRegistry guarantees this.
  return fallback as PaletteItem;
}

function NodeCard(p: NodeCardProps) {
  const tile = resolveTile(p.node, p.domain);
  // Phase 3 — Studio cards now derive their label and icon from the
  // semantic-binding resolvers (`resolveLabel` / `resolveIcon`) so
  // a right-click "Swap technology" mutation that changes only
  // `boundParam.optionValue` is reflected on the card in the same
  // gesture. `resolveLabel` falls back to `node.label` when no
  // bound option is available; `resolveIcon` returns `undefined`
  // when no `boundTechnologyCategory` is set, in which case we
  // keep the palette tile's icon (the pre-Phase-5 affordance) so
  // unbound nodes still render an appropriate glyph.
  const displayLabel = resolveLabel(p.node);
  const iconEntry = resolveIcon(p.node);
  const Icon = iconEntry !== undefined ? iconEntry.Icon : tile.Icon;
  // ARIA augmentation for the OU overlay. Colour is categorical so
  // the assistive label MUST carry the unit name independently —
  // never rely on hue to convey membership. The augmentation is
  // applied ONLY when the overlay is actually rendered (overlayCss
  // !== null) so an OU bound to a node while the overlay is OFF
  // does not leak through assistive tech in a context where no
  // visual signal accompanies it. Phrasing is parenthetical so
  // screen readers announce the (semantic) node label first, then
  // the membership clause.
  const ariaLabel =
    p.overlayCss !== null && p.ouName !== null
      ? `${displayLabel} (organisational unit: ${p.ouName})`
      : undefined;
  // The categorical hue lives on backgroundColor; CSS handles
  // hover / selected affordances on its own classes. We do NOT
  // touch foreground colour — the L=22% guarantees AA contrast
  // against the inherited near-white text without further
  // computation.
  const cardStyle =
    p.overlayCss !== null ? { backgroundColor: p.overlayCss } : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      style={cardStyle}
      onClick={(e) => {
        e.stopPropagation();
        p.onClick();
      }}
      onContextMenu={(e) => {
        // Phase 3: only intercept the native context menu when the
        // node carries a CTAD binding — there is nothing to swap on
        // an unbound node, so opening an empty popover would be a
        // dead-end UX. For unbound nodes we let the browser show
        // its default menu (or the host's parent handler take over).
        if (!p.hasBoundParam) return;
        e.preventDefault();
        e.stopPropagation();
        p.onContextMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        // role="button" elements must respond to Enter and Space
        // the way a native <button> would. preventDefault on Space
        // stops the page from scrolling when a card is focused.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          p.onClick();
        }
      }}
      data-testid={`acw-studio-node-${p.node.id}`}
      data-acw-node-id={p.node.id}
      data-domain={p.domain}
      data-selected={p.isSelected ? "true" : "false"}
      data-pending-source={p.isPendingSource ? "true" : "false"}
      data-ou-id={p.node.organisationalUnitId ?? ""}
      data-ou-overlay={p.overlayCss !== null ? "true" : "false"}
      className="es-cnode"
    >
      <span className="es-cnode-icon" aria-hidden="true">
        <Icon className="w-3 h-3" />
      </span>
      <span className="es-cnode-text">
        <span className="es-cnode-label">{displayLabel}</span>
        <span className="es-cnode-sub es-mono">{tile.subLabel}</span>
      </span>
      <span className="es-cnode-actions">
        <button
          type="button"
          className="es-cnode-btn"
          onClick={(e) => {
            e.stopPropagation();
            p.onConnect();
          }}
          aria-label={CONNECT_HINT}
          title={CONNECT_HINT}
          data-testid={`acw-studio-node-${p.node.id}-connect`}
        >
          <ArrowLeftRight className="w-3 h-3" />
        </button>
      </span>
    </div>
  );
}

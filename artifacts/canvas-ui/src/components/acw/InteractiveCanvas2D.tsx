// ACW v2 — full-scale interactive 2D canvas.
//
// Adds visual usability on top of the v1 grammar foundation WITHOUT
// adding meaning. Every visual operation that touches structure is
// validator-gated: drag-to-reparent calls `updateNodeParent`
// (which calls `canCreateNode` under the hood); group calls the
// same path; collapse / expand never touches the persisted graph
// at all (it lives in the per-lens view-state slice).
//
// Master prompt §11 says grammar always wins over visuals. This
// component never fabricates structural change: an illegal drag
// snaps the node back, surfaces the validator's neutral refusal
// string in the shared banner via the refusal channel, and leaves
// the workspace unchanged.
//
// Forbidden semantics (per task #50 brief):
//   - No colour mapped to judgement (red/green/amber). Container
//     outlines are neutral; the selection highlight is the same
//     colour for every node type.
//   - No size mapped to importance. Every node renders at the same
//     box size regardless of type, child count, or any computed
//     weight.
//   - No temporal cues / arrowheads / animation suggesting flow,
//     sequence, or future / past.
//   - No labels implying judgement (the static labels in this
//     module are asserted against ACW_PLACEHOLDER_FORBIDDEN at
//     module load).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Locate, Maximize, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_ELEMENT_TYPE_LABEL,
  ACW_ELEMENT_TYPES,
  permittedParentsFor,
  type AcwElementType,
} from "@/acw/acwGrammar";
import { canCreateNode, type ValidatorWorkspaceView } from "@/acw/acwValidator";
import type { AcwNode, AcwEdge } from "@/acw/acwStore";
import { updateNodePosition, updateNodeParent, createNode } from "@/acw/acwStore";
import { publishRefusal } from "@/acw/acwRefusalChannel";
import {
  getActiveLod,
  getCollapsedIds,
  isCollapsed,
  subscribeViewState,
  toggleCollapsed,
} from "@/acw/acwViewState";
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
// v3 — structural enumeration is shared with the 3D renderer so
// neither canvas can fabricate visibility the other does not also
// surface. The build-time structural-identity invariant
// (`acw3DStructureInvariants.test-shape.ts`) verifies both
// renderers consume this helper.
import { enumerateLensVisibility } from "@/acw/acwLensStructure";
// Phase 5 — semantic resolution. The renderer reads (never writes)
// the bound option label and icon through these helpers; the helpers
// are the only ACW surface permitted to import the CTAD registry.
import { resolveLabel, resolveIcon } from "@/acw/semantic/techNodeBinding";

const EMPTY_TITLE = "Empty 2D canvas";
const EMPTY_SUBTITLE = "Add systems to begin";
const ZOOM_LABEL = "Zoom";
const RESET_LABEL = "Reset view";
const GROUP_LABEL = "Group selection";
const GROUP_HINT_NEED_COMPUTE =
  "Select at least two siblings of the same type whose grammar permits a shared container.";
const PAN_LABEL = "Hold Alt, space, or middle button to pan; drag the background to select an area.";
const COLLAPSE_LABEL = "Collapse";
const EXPAND_LABEL = "Expand";
const CONTAINED_PREFIX = "contained";
const SELECTION_LABEL = "Selection";
const NEW_ZONE_LABEL = "Zone";
// Task #161 — camera toolbar labels (mirroring the CTAD design
// shell vocabulary so the two surfaces feel identical). Each
// string is asserted against `ACW_PLACEHOLDER_FORBIDDEN` at module
// load so a future edit cannot silently introduce judgement
// vocabulary into the camera affordances.
const CAMERA_ZOOM_IN_LABEL = "Zoom in";
const CAMERA_ZOOM_OUT_LABEL = "Zoom out";
const CAMERA_RESET_LABEL = "Reset camera";
const CAMERA_FIT_LABEL = "Fit visible content";
const CAMERA_RECENTRE_LABEL = "Recentre on selection";
const CAMERA_ZOOM_LEVEL_LABEL = "Camera zoom level";
const CAMERA_PAN_HINT_LABEL =
  "Hold space, Alt, or the middle mouse button to pan. Hold Ctrl or Cmd while scrolling to pinch-zoom toward the cursor. Press F to recentre on the selection.";
const MINIMAP_LABEL = "Canvas minimap";

assertAllAcwPlaceholderLanguage([
  EMPTY_TITLE,
  EMPTY_SUBTITLE,
  ZOOM_LABEL,
  RESET_LABEL,
  GROUP_LABEL,
  GROUP_HINT_NEED_COMPUTE,
  PAN_LABEL,
  COLLAPSE_LABEL,
  EXPAND_LABEL,
  CONTAINED_PREFIX,
  SELECTION_LABEL,
  NEW_ZONE_LABEL,
  CAMERA_ZOOM_IN_LABEL,
  CAMERA_ZOOM_OUT_LABEL,
  CAMERA_RESET_LABEL,
  CAMERA_FIT_LABEL,
  CAMERA_RECENTRE_LABEL,
  CAMERA_ZOOM_LEVEL_LABEL,
  CAMERA_PAN_HINT_LABEL,
  MINIMAP_LABEL,
]);

// Visual constants. Pure rendering geometry — no semantics.
const NODE_W = 96;
const NODE_H = 32;
const GRID = 24; // matches the dotted background spacing
const CONTAINER_PADDING = 24;
const ALIGN_TOLERANCE = 4; // px in canvas-space

// View state mirrors the camera store's shape, but we keep the
// terser `x` / `y` aliases internally so the existing clientToCanvas
// and transform math remain pixel-identical to the pre-Task-#161
// implementation. The camera store keeps the canonical `panX` /
// `panY` field names; the helpers below are the single conversion
// point between the two shapes.
interface ViewState {
  x: number;
  y: number;
  zoom: number;
}
const INITIAL_VIEW: ViewState = {
  x: ACW_CANVAS_CAMERA_DEFAULT.panX,
  y: ACW_CANVAS_CAMERA_DEFAULT.panY,
  zoom: ACW_CANVAS_CAMERA_DEFAULT.zoom,
};
function viewFromCamera(c: AcwCanvasCameraState): ViewState {
  return { x: c.panX, y: c.panY, zoom: c.zoom };
}
function cameraFromView(v: ViewState): AcwCanvasCameraState {
  return { panX: v.x, panY: v.y, zoom: v.zoom };
}
// Multiplicative zoom step matching the CTAD design shell so a
// click on the camera toolbar's zoom buttons feels the same in
// both surfaces.
const CAMERA_ZOOM_BUTTON_STEP = 1.2;
// Ctrl/Cmd+wheel pinch tunable. CTAD uses an exponential factor
// keyed to deltaY so high-resolution trackpads do not overshoot
// when the user makes a slow pinch gesture; we mirror it here.
const CAMERA_WHEEL_PINCH_SCALE = 0.0015;
function clampViewZoom(z: number): number {
  return clampAcwCameraZoom(z);
}

export interface InteractiveCanvas2DProps {
  /** Lens identity used to scope per-lens view-state (collapse). */
  lensId: string;
  /** All nodes the lens has decided to surface. The canvas filters
   *  by the lens's current depth path before rendering. */
  nodes: readonly AcwNode[];
  /** All edges the lens has decided to surface. */
  edges: readonly AcwEdge[];
  /** Node id whose contents are currently displayed (depth focus).
   *  `null` means the workspace root. */
  focusedParentId: string | null;
  /** Drill-down callback when the user double-clicks a container. */
  onDrillDown?: (nodeId: string) => void;
  emptyHint?: string;
  height?: number | string;
  testId?: string;
  /**
   * Optional lens-aware filter on which container types the Group
   * affordance may materialise. The grammar is the legality
   * authority; this predicate is a UX scope so that, for example,
   * the Application lens does not silently spawn a Technology-lens
   * container (which would then be filtered out of the current
   * lens, making the grouped nodes appear to vanish). When omitted
   * every grammar-permitted container is offered.
   */
  permitContainerType?: (type: AcwElementType) => boolean;
  // -------------------- EAStudio Phase 2 (additive) --------------
  /**
   * When true, single-click on a leaf node fires
   * `onNodeConnectClick` instead of starting a drag or replacing
   * the marquee selection. The canvas itself stores no mutable
   * connect state; the host page owns the source / pending lens
   * slice and drives this prop.
   */
  connectMode?: boolean;
  /** Pending source node id when the host is mid-Connect. The
   *  canvas highlights this node with a distinct stroke. */
  pendingSourceId?: string | null;
  /** Currently externally-selected edge id; rendered with thicker
   *  stroke so the host's properties / delete affordance has a
   *  visible target. */
  selectedEdgeId?: string | null;
  /** Single-node selection callback (fires after a non-drag click).
   *  The host should mirror this to its own lens-keyed slice so the
   *  Properties panel can re-read it. */
  onNodeSelect?: (nodeId: string) => void;
  /** Connect-mode click callback. Fired in place of drag/select
   *  whenever `connectMode === true`. */
  onNodeConnectClick?: (nodeId: string) => void;
  /** Edge click callback. The host decides what selection means;
   *  the canvas just surfaces the user's intent. */
  onEdgeClick?: (edgeId: string) => void;
  /** Edge delete callback fired by the in-canvas confirm pill.
   *  Hosts that wire `selectedEdgeId` should also wire this so the
   *  user can complete the delete gesture without leaving the
   *  canvas. The pill renders only for the currently-selected edge
   *  so unselected edges remain inert. */
  onEdgeDelete?: (edgeId: string) => void;
  /** EAStudio Phase 2 (post-validation) — when true, this canvas
   *  does NOT render its own edge layer or in-canvas confirm pill.
   *  The host is then responsible for rendering edges in a single
   *  unified overlay positioned above all canvases (necessary so
   *  cross-quadrant CONNECTS edges, whose endpoints sit in
   *  different `InteractiveCanvas2D` instances, are visible and
   *  selectable). The host queries this canvas's rendered nodes by
   *  the `data-acw-node-id` attribute on each node `<g>`. Default
   *  false preserves single-canvas lens behaviour for every other
   *  consumer. */
  suppressEdgeRendering?: boolean;
}

interface DragState {
  nodeId: string;
  // Pointer-to-node anchor (canvas coords)
  anchorX: number;
  anchorY: number;
  // Original position (canvas coords) for snap-back on refusal
  originX: number;
  originY: number;
  // Live position during drag (pre-snap)
  liveX: number;
  liveY: number;
  // Snapped position currently rendered
  snapX: number;
  snapY: number;
}

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export function InteractiveCanvas2D(props: InteractiveCanvas2DProps) {
  const {
    lensId,
    nodes,
    edges,
    focusedParentId,
    onDrillDown,
    emptyHint,
    height = 460,
    testId = "acw-canvas-2d",
    permitContainerType,
    connectMode = false,
    pendingSourceId = null,
    selectedEdgeId = null,
    onNodeSelect,
    onNodeConnectClick,
    onEdgeClick,
    onEdgeDelete,
    suppressEdgeRendering = false,
  } = props;

  // Camera state is persisted per (org, workItem, lensId) via the
  // ACW canvas camera store (Task #161). On mount we hydrate from
  // the store; the React state is the source of truth at runtime
  // and `commitView` is the single mutation point so persistence
  // and clamp can never drift.
  const [view, setViewRaw] = useState<ViewState>(() =>
    viewFromCamera(getAcwCanvasCamera(lensId)),
  );
  // Re-hydrate when the lens identity changes (the lens id is
  // routing-scoped, so this fires when the user navigates to a
  // different ACW lens that mounts a fresh InteractiveCanvas2D
  // instance) and when the underlying scope changes (org / work-
  // item switch or hydration response from the api-server lands).
  useEffect(() => {
    setViewRaw(viewFromCamera(getAcwCanvasCamera(lensId)));
  }, [lensId]);
  useEffect(() => {
    return subscribeAcwCanvasCameraReload(() => {
      setViewRaw(viewFromCamera(getAcwCanvasCamera(lensId)));
    });
  }, [lensId]);
  // Flush any pending debounced server write when this canvas
  // unmounts (e.g. user navigates to a different lens) or when the
  // lens identity changes mid-session, so the last-known view is
  // durable on the api-server before the React tree tears down.
  useEffect(() => {
    return () => {
      flushAcwCanvasCameraWrites();
    };
  }, [lensId]);
  // Single mutation point. Funnels every camera write through the
  // store so a future addition (debounce, telemetry, undo) only
  // needs to be added in one place. Accepts either a direct value
  // or an updater function so existing call-sites that previously
  // used the React functional setter shape continue to work.
  const commitView = useCallback(
    (next: ViewState | ((prev: ViewState) => ViewState)) => {
      setViewRaw((prev) => {
        const candidate = typeof next === "function" ? next(prev) : next;
        const safe: ViewState = {
          x: Number.isFinite(candidate.x) ? candidate.x : prev.x,
          y: Number.isFinite(candidate.y) ? candidate.y : prev.y,
          zoom: clampViewZoom(candidate.zoom),
        };
        setAcwCanvasCamera(lensId, cameraFromView(safe));
        return safe;
      });
    },
    [lensId],
  );
  const panRef = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Spacebar-held pan flag (Task #161). Mirrors the CTAD design
  // shell affordance so a user who learned the gesture in one
  // surface gets the same behaviour in the other. The ref form is
  // used inside event handlers that must read the latest value
  // without triggering a re-render; the React state form drives
  // the cursor: grab affordance.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);
  useEffect(() => {
    spaceHeldRef.current = spaceHeld;
  }, [spaceHeld]);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Marquee (drag-rectangle) selection state. Coordinates are in
  // CANVAS space (post-pan, post-zoom) so the rectangle stays
  // anchored to underlying nodes if the user pans mid-drag.
  // `additive` means shift was held at the start, so the marquee
  // extends the existing selection rather than replacing it.
  interface MarqueeState {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    baseSelection: readonly string[];
  }
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  // Re-render when view-state (collapse) changes
  // `viewTick` is the dependency we use to invalidate every memo
  // that derives from the per-lens view-state slice (notably
  // `collapsedIds`). Without consuming the value in a memo dep
  // list the memos would never recompute on collapse / expand,
  // and the rendered visibility would lag behind storage.
  const [viewTick, setViewTick] = useState(0);
  useEffect(() => subscribeViewState(() => setViewTick((t) => t + 1)), []);

  // ---- Visibility filtering --------------------------------------
  // Only nodes whose direct parent is the focused container are
  // rendered as siblings. Children of any *collapsed* sibling are
  // not rendered. Containers always render their direct children
  // unless the container is itself collapsed.
  const collapsedIds = useMemo(
    () => new Set(getCollapsedIds(lensId)),
    [lensId, viewTick],
  );
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);

  // Visibility comes from the v3 shared enumerator. Both 2D and 3D
  // renderers consume this helper, which is the build-time
  // guarantee that they cannot diverge on what is shown at a
  // given depth + collapse state.
  // EAStudio Phase 2 (LoS framework) — pass the lens-active LoS
  // through so `enumerateLensVisibility` filters out nodes whose
  // declared `lodRange` does not include the active level. Pre-Phase-2
  // nodes carry no `lodRange` and always pass; this keeps every
  // existing lens (Track 3, authored 2D lenses) pixel-identical.
  const activeLod = getActiveLod(lensId);
  const visibility = useMemo(
    () =>
      enumerateLensVisibility(
        nodes,
        edges,
        focusedParentId,
        collapsedIds,
        activeLod,
      ),
    [nodes, edges, focusedParentId, collapsedIds, activeLod],
  );
  const directSiblings = visibility.directSiblings;

  // Total-children-by-parent count used only for the collapsed
  // container's "+N" label — this is total descendants directly
  // parented to the container, regardless of the collapse state
  // (so the label always tells the truth about what is hidden).
  const totalChildCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of nodes) {
      if (m.parentId !== null) {
        counts.set(m.parentId, (counts.get(m.parentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [nodes]);

  // Drawable view-model: the enumerator's per-sibling record plus
  // the live drag override so the in-flight node renders at its
  // current pointer position rather than its persisted coords.
  interface Drawable {
    node: AcwNode;
    x: number;
    y: number;
    isContainer: boolean;
    isCollapsedHere: boolean;
    childRefs: readonly AcwNode[];
  }
  const drawables = useMemo<Drawable[]>(() => {
    return visibility.drawables.map((d) => {
      const live =
        drag !== null && drag.nodeId === d.node.id
          ? { x: drag.snapX, y: drag.snapY }
          : { x: d.node.x, y: d.node.y };
      return {
        node: d.node,
        x: live.x,
        y: live.y,
        isContainer: d.isContainer,
        isCollapsedHere: d.isCollapsedHere,
        childRefs: d.childRefs,
      };
    });
  }, [visibility, drag]);

  // Compute a container's bounding box from its visible direct
  // children. If a container has no laid-out children it falls back
  // to the node's own coords.
  function containerBox(d: Drawable): { x: number; y: number; w: number; h: number } {
    if (d.isCollapsedHere || d.childRefs.length === 0) {
      return { x: d.x - NODE_W / 2, y: d.y - NODE_H / 2, w: NODE_W, h: NODE_H };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of d.childRefs) {
      const cx = c.x;
      const cy = c.y;
      minX = Math.min(minX, cx - NODE_W / 2);
      minY = Math.min(minY, cy - NODE_H / 2);
      maxX = Math.max(maxX, cx + NODE_W / 2);
      maxY = Math.max(maxY, cy + NODE_H / 2);
    }
    return {
      x: minX - CONTAINER_PADDING,
      y: minY - CONTAINER_PADDING,
      w: maxX - minX + CONTAINER_PADDING * 2,
      h: maxY - minY + CONTAINER_PADDING * 2 + 18, // +18 for header strip
    };
  }

  // ---- Pointer math ---------------------------------------------
  function clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.zoom,
      y: (clientY - rect.top - view.y) / view.zoom,
    };
  }

  // ---- Pan & marquee --------------------------------------------
  // Background-drag intent dispatch:
  //   - Middle button OR Alt+left = pan the viewport
  //   - Plain left button = marquee (drag-rectangle) selection
  //   - Shift+left = additive marquee (extends current selection)
  // Pan is unchanged from v1; marquee is the v2 addition that
  // satisfies the "single-select / marquee-select" requirement.
  // Task #161 — spacebar-held pan also counts as a pan gesture, in
  // addition to the long-standing Alt+left and middle-button paths.
  // The CTAD design shell uses the same "modifier-or-space" rule
  // so the affordance is portable across the two surfaces.
  const isPanGesture = (e: MouseEvent) =>
    e.button === 1 ||
    (e.button === 0 && (e.altKey || spaceHeldRef.current));
  const onBgMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (drag !== null) return;
    if (isPanGesture(e)) {
      panRef.current = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (e.button !== 0) return;
    // Plain left-click on background starts a marquee. We seed the
    // marquee at the cursor's CANVAS-space coordinates so it
    // remains anchored to underlying nodes if the user pans the
    // viewport during the drag (we currently disable pan during a
    // marquee, but the math still holds).
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    setMarquee({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      additive: e.shiftKey,
      baseSelection: e.shiftKey ? selection : [],
    });
    if (!e.shiftKey) setSelection([]);
  };
  const onBgMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (drag !== null) return;
    // Snapshot panRef.current into a local before calling setView. React
    // may execute the state-updater asynchronously, by which time a
    // mouseup handler can have cleared panRef.current to null — reading
    // `.vx` off the ref inside the updater would then throw and crash
    // the InteractiveCanvas2D subtree.
    const pan = panRef.current;
    if (pan) {
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      commitView((v) => ({ ...v, x: pan.vx + dx, y: pan.vy + dy }));
      return;
    }
    if (marquee) {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      setMarquee({ ...marquee, currentX: x, currentY: y });
    }
  };
  const onBgMouseUp = () => {
    panRef.current = null;
    if (marquee) {
      // Compute marquee rect (canvas space).
      const x1 = Math.min(marquee.startX, marquee.currentX);
      const x2 = Math.max(marquee.startX, marquee.currentX);
      const y1 = Math.min(marquee.startY, marquee.currentY);
      const y2 = Math.max(marquee.startY, marquee.currentY);
      // A near-zero-area marquee is treated as a click on empty
      // background → clear selection (already done on mousedown
      // for non-additive). Skip hit-test to avoid selecting
      // something the user merely clicked past.
      const tinyDrag = Math.abs(x2 - x1) < 4 && Math.abs(y2 - y1) < 4;
      if (!tinyDrag) {
        const hits = new Set<string>(marquee.baseSelection);
        for (const d of drawables) {
          const box = d.isContainer ? containerBox(d) : leafBox(d);
          // Intersection (AABB overlap) — anything the rectangle
          // touches is selected. This matches the convention
          // most vector tools use.
          const overlaps =
            box.x < x2 && box.x + box.w > x1 && box.y < y2 && box.y + box.h > y1;
          if (overlaps) hits.add(d.node.id);
        }
        setSelection(Array.from(hits));
      }
      setMarquee(null);
    }
  };

  // Native wheel handler for zoom (Task #161 update).
  //
  //   - Bare wheel: identity-preserving incremental zoom (the
  //     pre-Task-#161 behaviour) so muscle memory is preserved.
  //   - Ctrl OR Meta + wheel: exponential pinch-zoom anchored to
  //     the cursor — the canvas point under the cursor stays put
  //     while the zoom scales around it. Mirrors the CTAD design
  //     shell's pinch gesture.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (ev: globalThis.WheelEvent) => {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        // Pinch toward cursor. Solve for new pan such that the
        // canvas-space point under the cursor before the zoom is
        // also under the cursor after the zoom.
        const rect = el.getBoundingClientRect();
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        commitView((v) => {
          const factor = Math.exp(-ev.deltaY * CAMERA_WHEEL_PINCH_SCALE);
          const nextZoom = clampViewZoom(v.zoom * factor);
          if (nextZoom === v.zoom) return v;
          // Canvas-space anchor (using the OLD view).
          const ax = (cx - v.x) / v.zoom;
          const ay = (cy - v.y) / v.zoom;
          // Solve: cx = nextX + ax * nextZoom  =>  nextX = cx - ax * nextZoom
          const nextX = cx - ax * nextZoom;
          const nextY = cy - ay * nextZoom;
          return { x: nextX, y: nextY, zoom: nextZoom };
        });
        return;
      }
      const delta = -ev.deltaY * 0.001;
      commitView((v) => ({ ...v, zoom: clampViewZoom(v.zoom + delta) }));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [commitView]);

  // ---- Camera helpers (Task #161) -------------------------------
  // The camera affordances all derive from `drawables` (already
  // memoised above with full pan/zoom-independent canvas-space
  // coordinates) and from the live container size, so they stay
  // correct after any combination of pan, zoom, drag-to-reparent,
  // collapse / expand, or marquee selection.
  function visibleContentBounds():
    | { x: number; y: number; w: number; h: number }
    | null {
    if (drawables.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of drawables) {
      const box = d.isContainer ? containerBox(d) : leafBox(d);
      if (box.x < minX) minX = box.x;
      if (box.y < minY) minY = box.y;
      if (box.x + box.w > maxX) maxX = box.x + box.w;
      if (box.y + box.h > maxY) maxY = box.y + box.h;
    }
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return null;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  function selectionBounds():
    | { x: number; y: number; w: number; h: number }
    | null {
    if (selection.length === 0) return null;
    const drawableById = new Map<string, Drawable>();
    for (const d of drawables) drawableById.set(d.node.id, d);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hits = 0;
    for (const id of selection) {
      const d = drawableById.get(id);
      if (!d) continue;
      const box = d.isContainer ? containerBox(d) : leafBox(d);
      if (box.x < minX) minX = box.x;
      if (box.y < minY) minY = box.y;
      if (box.x + box.w > maxX) maxX = box.x + box.w;
      if (box.y + box.h > maxY) maxY = box.y + box.h;
      hits += 1;
    }
    if (hits === 0) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  function viewportSize(): { w: number; h: number } {
    const el = containerRef.current;
    if (!el) return { w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  function fitView(box: { x: number; y: number; w: number; h: number }) {
    const { w: vw, h: vh } = viewportSize();
    if (vw === 0 || vh === 0 || box.w === 0 || box.h === 0) return;
    // Leave a small margin (10% on each side) so the content never
    // butts up against the viewport edges.
    const margin = 0.1;
    const targetW = vw * (1 - margin * 2);
    const targetH = vh * (1 - margin * 2);
    const zoom = clampViewZoom(Math.min(targetW / box.w, targetH / box.h));
    // Centre `box` (in canvas space) inside the viewport.
    const cxCanvas = box.x + box.w / 2;
    const cyCanvas = box.y + box.h / 2;
    const x = vw / 2 - cxCanvas * zoom;
    const y = vh / 2 - cyCanvas * zoom;
    commitView({ x, y, zoom });
  }
  function recentreOnSelection() {
    const sb = selectionBounds();
    if (sb !== null) {
      // Keep the current zoom, just translate so the selection
      // centroid sits in the viewport centre. Recentre — not a
      // re-fit — matches the CTAD `f`-key UX exactly.
      const { w: vw, h: vh } = viewportSize();
      if (vw === 0 || vh === 0) return;
      commitView((v) => {
        const cx = sb.x + sb.w / 2;
        const cy = sb.y + sb.h / 2;
        return { x: vw / 2 - cx * v.zoom, y: vh / 2 - cy * v.zoom, zoom: v.zoom };
      });
      return;
    }
    // No selection → fall through to fit-content, which is the
    // closest "show me everything" affordance available.
    const cb = visibleContentBounds();
    if (cb !== null) fitView(cb);
  }
  function fitContent() {
    const cb = visibleContentBounds();
    if (cb !== null) fitView(cb);
  }
  function zoomAroundCentre(factor: number) {
    const { w: vw, h: vh } = viewportSize();
    if (vw === 0 || vh === 0) return;
    commitView((v) => {
      const nextZoom = clampViewZoom(v.zoom * factor);
      if (nextZoom === v.zoom) return v;
      // Anchor at viewport centre so a click on +/- doesn't drift
      // the canvas content sideways.
      const cx = vw / 2;
      const cy = vh / 2;
      const ax = (cx - v.x) / v.zoom;
      const ay = (cy - v.y) / v.zoom;
      return { x: cx - ax * nextZoom, y: cy - ay * nextZoom, zoom: nextZoom };
    });
  }
  function resetCamera() {
    commitView(INITIAL_VIEW);
  }

  // Keyboard listener: spacebar holds the pan modifier; F recenters
  // on the selection. Keys are intercepted only when the active
  // element is NOT a text input / textarea / contenteditable, so
  // typing in the Properties panel never accidentally pans.
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
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        recentreOnSelection();
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
    // recentreOnSelection captures live `selection` and `drawables`
    // through closure; we re-bind every render so the F-key always
    // operates on the latest state.
  });

  // ---- Drag a node ----------------------------------------------
  function onNodeMouseDown(e: MouseEvent, node: AcwNode) {
    e.stopPropagation();
    // EAStudio Phase 2 — Connect mode short-circuits drag and
    // marquee selection so the click reads as "connect intent" only.
    // Sealed domain containers are still skipped here; the host
    // refuses sealed-container connect attempts at the validator
    // level, but suppressing the click locally avoids a no-op
    // refusal banner. Containers in general fall through to the
    // standard drag path because Connect targets leaves only.
    if (connectMode && !node.isDomainContainer) {
      onNodeConnectClick?.(node.id);
      return;
    }
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    setDrag({
      nodeId: node.id,
      anchorX: x - node.x,
      anchorY: y - node.y,
      originX: node.x,
      originY: node.y,
      liveX: node.x,
      liveY: node.y,
      snapX: node.x,
      snapY: node.y,
    });
    // Also select on mousedown (overwriting selection unless shift)
    setSelection(e.shiftKey ? Array.from(new Set([...selection, node.id])) : [node.id]);
    // EAStudio Phase 2 — broadcast the single-node primary
    // selection so the host's Properties panel can re-read.
    // Domain containers are excluded because they are sealed and
    // the panel refuses to display them.
    if (!node.isDomainContainer) onNodeSelect?.(node.id);
  }
  function onWindowMouseMove(e: globalThis.MouseEvent) {
    if (!drag) return;
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    const lx = x - drag.anchorX;
    const ly = y - drag.anchorY;
    setDrag({ ...drag, liveX: lx, liveY: ly, snapX: snap(lx), snapY: snap(ly) });
  }
  // Drop-target resolution for drag-to-reparent.
  //
  // The validator — not current visual occupancy — is the
  // authority on which sibling can host the dragged node. We hit-
  // test the cursor against EVERY visible sibling (containers and
  // leaves alike), and only nominate a sibling as the drop target
  // if `canCreateNode(draggedType, sibling)` returns ok. Empty-
  // but-grammatically-valid containers therefore work as drop
  // zones, and overlapping leaf-siblings whose grammar would
  // refuse the nesting are silently passed over (no spurious
  // refusal banner — the drag is treated as plain reposition).
  //
  // If nothing matches, the drop target is the focused parent
  // (i.e. "the area the user is currently looking at", which may
  // be the root). The validator surface is consulted again inside
  // `updateNodeParent`, so this method's verdict is advisory: a
  // refusal is still possible (e.g. cycle prevention) and the
  // banner will surface it.
  const validatorView = useMemo<ValidatorWorkspaceView>(
    () => ({
      getNodeType(nodeId: string): AcwElementType | undefined {
        return byId.get(nodeId)?.type as AcwElementType | undefined;
      },
    }),
    [byId],
  );
  function leafBox(d: Drawable): { x: number; y: number; w: number; h: number } {
    return { x: d.x - NODE_W / 2, y: d.y - NODE_H / 2, w: NODE_W, h: NODE_H };
  }
  function findDropTarget(snapX: number, snapY: number, draggedId: string): string | null {
    const draggedType = byId.get(draggedId)?.type as AcwElementType | undefined;
    if (!draggedType) return focusedParentId;
    // Iterate back-to-front (containers render first; leaves
    // render on top in the JSX, so leaves take pickup priority).
    for (let i = drawables.length - 1; i >= 0; i -= 1) {
      const d = drawables[i];
      if (d.node.id === draggedId) continue;
      const box = d.isContainer ? containerBox(d) : leafBox(d);
      const inside =
        snapX >= box.x &&
        snapX <= box.x + box.w &&
        snapY >= box.y &&
        snapY <= box.y + box.h;
      if (!inside) continue;
      const verdict = canCreateNode(draggedType, d.node.id, validatorView);
      if (verdict.ok) return d.node.id;
    }
    return focusedParentId;
  }

  function onWindowMouseUp() {
    if (!drag) return;
    const finalX = drag.snapX;
    const finalY = drag.snapY;
    const node = byId.get(drag.nodeId);
    const movedPosition = finalX !== drag.originX || finalY !== drag.originY;
    if (!node) {
      setDrag(null);
      return;
    }
    // Resolve drop target FIRST so that a refused reparent skips
    // the position write — the node visibly snaps back to its
    // original location, matching what we surfaced via the refusal
    // banner.
    const dropTargetId = findDropTarget(finalX, finalY, drag.nodeId);
    const wantsReparent = dropTargetId !== node.parentId;
    if (wantsReparent) {
      const r = updateNodeParent(drag.nodeId, dropTargetId);
      if (!r.ok) {
        publishRefusal(r.reason);
        setDrag(null);
        return;
      }
    }
    if (movedPosition) {
      const r = updateNodePosition(drag.nodeId, finalX, finalY);
      if (!r.ok) {
        publishRefusal(r.reason);
      }
    }
    setDrag(null);
  }
  useEffect(() => {
    if (!drag) return;
    const move = (e: globalThis.MouseEvent) => onWindowMouseMove(e);
    const up = () => onWindowMouseUp();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  // ---- Alignment guides (transient, render-only) ----------------
  // When dragging, draw a vertical guide line whenever the dragged
  // node's centre x is within tolerance of any other sibling's
  // centre x; same for horizontal y. Pure visual aid; no
  // auto-arrange.
  const alignmentGuides = useMemo<{ kind: "v" | "h"; pos: number }[]>(() => {
    if (!drag) return [];
    const others = directSiblings.filter((s) => s.id !== drag.nodeId);
    const guides: { kind: "v" | "h"; pos: number }[] = [];
    for (const o of others) {
      if (Math.abs(o.x - drag.snapX) <= ALIGN_TOLERANCE) {
        guides.push({ kind: "v", pos: o.x });
      }
      if (Math.abs(o.y - drag.snapY) <= ALIGN_TOLERANCE) {
        guides.push({ kind: "h", pos: o.y });
      }
    }
    return guides;
  }, [drag, directSiblings]);

  // ---- Group affordance ----------------------------------------
  // Generalized for v2: instead of hardcoding ComputeNode → Zone,
  // we ask the grammar which container type (if any) can host the
  // current selection AS siblings of one another at the focused
  // level. The rule:
  //   1. selection size >= 2
  //   2. all selected nodes are siblings (parent === focusedParentId)
  //   3. all selected nodes share the same element type T
  //   4. there exists a type P such that:
  //        - P appears in `permittedParentsFor(T)` (P can host T)
  //        - `canCreateNode(P, focusedParentId)` is permitted by
  //          the validator (P is itself legal at the focus level)
  // If found, the group action creates a P at the centroid of the
  // selection and reparents every selected node into it. Each
  // mutation is validator-gated; on refusal we publish the
  // neutral reason and stop. The container's label is
  // `ACW_ELEMENT_TYPE_LABEL[P]`, never invented per call.
  const selectionAtFocus = selection.filter((id) => {
    const n = byId.get(id);
    return n !== undefined && n.parentId === focusedParentId;
  });
  const groupContainerType = useMemo<AcwElementType | null>(() => {
    if (selectionAtFocus.length < 2) return null;
    const firstType = byId.get(selectionAtFocus[0])?.type as AcwElementType | undefined;
    if (!firstType) return null;
    if (!selectionAtFocus.every((id) => byId.get(id)?.type === firstType)) return null;
    for (const candidate of ACW_ELEMENT_TYPES) {
      if (candidate === firstType) continue; // disallow same-type wrapping
      const permits = permittedParentsFor(firstType).includes(candidate);
      if (!permits) continue;
      const canHost = canCreateNode(candidate, focusedParentId, validatorView);
      if (!canHost.ok) continue;
      // Lens-aware UX scope: skip container types the active lens
      // would filter out, so grouping never makes the user's nodes
      // appear to disappear behind an invisible parent. The
      // grammar still rules legality; this only narrows the menu.
      if (permitContainerType && !permitContainerType(candidate)) continue;
      return candidate;
    }
    return null;
  }, [selectionAtFocus, byId, focusedParentId, validatorView, permitContainerType]);
  const canGroup = groupContainerType !== null;

  function onGroup() {
    if (!canGroup || !groupContainerType) {
      publishRefusal(GROUP_HINT_NEED_COMPUTE);
      return;
    }
    // Preflight: simulate the post-mutation graph (the new
    // container exists and has groupContainerType) and verify
    // every reparent would pass the validator. Only mutate if
    // every step is provably ok. This makes the group action
    // effectively atomic — no partial commit can produce a
    // half-grouped graph plus an orphan container, even if a
    // future grammar change tightens canCreateNode.
    const PRESERVED_PENDING_ID = "__acw_pending_group_container__";
    const preflightView: ValidatorWorkspaceView = {
      getNodeType(nodeId: string) {
        if (nodeId === PRESERVED_PENDING_ID) return groupContainerType;
        return validatorView.getNodeType(nodeId);
      },
    };
    for (const id of selectionAtFocus) {
      const t = byId.get(id)?.type as AcwElementType | undefined;
      if (!t) {
        publishRefusal(GROUP_HINT_NEED_COMPUTE);
        return;
      }
      const verdict = canCreateNode(t, PRESERVED_PENDING_ID, preflightView);
      if (!verdict.ok) {
        publishRefusal(verdict.reason);
        return;
      }
    }
    // Position the new container at the centroid of the selection,
    // snapped to grid. Pure layout convenience; carries no meaning.
    let cx = 0;
    let cy = 0;
    for (const id of selectionAtFocus) {
      const n = byId.get(id)!;
      cx += n.x;
      cy += n.y;
    }
    cx = snap(cx / selectionAtFocus.length);
    cy = snap(cy / selectionAtFocus.length);
    const created = createNode({
      type: groupContainerType,
      parentId: focusedParentId,
      label: ACW_ELEMENT_TYPE_LABEL[groupContainerType],
      x: cx,
      y: cy,
    });
    if (!created.ok) {
      publishRefusal(created.reason);
      return;
    }
    // Deterministic: `createNode` returns the freshly-minted id
    // (v2 contract). No scanning, no "newest empty container"
    // heuristic — this is the only correct way to address the
    // node we just made, especially when other empty containers
    // of the same type may already exist at this level.
    const containerId = created.id;
    for (const id of selectionAtFocus) {
      const r = updateNodeParent(id, containerId);
      if (!r.ok) {
        publishRefusal(r.reason);
        return;
      }
    }
    setSelection([]);
  }

  // ---- Background / empty state --------------------------------
  const isEmpty = directSiblings.length === 0;
  const transformStyle: CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    transformOrigin: "0 0",
  };

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      onMouseDown={onBgMouseDown}
      onMouseMove={onBgMouseMove}
      onMouseUp={onBgMouseUp}
      onMouseLeave={onBgMouseUp}
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        cursor: drag
          ? "grabbing"
          : panRef.current
            ? "grabbing"
            : spaceHeld
              ? "grab"
              : "default",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: `${GRID}px ${GRID}px`,
      }}
      className="rounded-md border border-border/40 bg-muted/10"
    >
      {/* HUD. We stop mousedown from bubbling so that clicking
          buttons (Reset, Group) or the selection counter does NOT
          start a marquee on the canvas background — which would
          otherwise clear the selection right before the click
          activates and disable the affordance the user just
          targeted. */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-hud`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span>
          {ZOOM_LABEL} {view.zoom.toFixed(2)}×
        </span>
        <button
          type="button"
          onClick={resetCamera}
          className="px-2 py-0.5 border border-border/60 rounded hover:text-primary hover:border-primary/60 transition-colors"
          data-testid={`${testId}-reset`}
        >
          {RESET_LABEL}
        </button>
        <button
          type="button"
          onClick={onGroup}
          disabled={!canGroup}
          className="px-2 py-0.5 border border-border/60 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:text-primary hover:border-primary/60 transition-colors"
          data-testid={`${testId}-group`}
        >
          {GROUP_LABEL}
        </button>
        {selection.length > 0 ? (
          <span data-testid={`${testId}-selection-count`}>
            {SELECTION_LABEL} {selection.length}
          </span>
        ) : null}
      </div>
      {/* Pan / marquee hint, kept out of the HUD strip so the
          selection count remains the prominent right-side affordance. */}
      <div
        className="absolute bottom-1 left-2 z-10 text-[9px] tracking-wide text-muted-foreground/60 pointer-events-none normal-case"
        data-testid={`${testId}-pan-hint`}
        title={CAMERA_PAN_HINT_LABEL}
      >
        {PAN_LABEL}
      </div>

      {/* Camera toolbar (Task #161). Top-left so it does not
          collide with the existing top-right HUD (Reset / Group /
          selection count). Buttons are vector-only icons so the
          surface stays icon-driven; titles carry the label text. */}
      <div
        className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1 py-0.5 backdrop-blur-sm"
        data-testid={`${testId}-camera-toolbar`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomAroundCentre(CAMERA_ZOOM_BUTTON_STEP)}
          disabled={view.zoom >= ACW_CANVAS_CAMERA_MAX_ZOOM - 1e-6}
          className="p-1 rounded hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
          title={CAMERA_ZOOM_IN_LABEL}
          aria-label={CAMERA_ZOOM_IN_LABEL}
          data-testid={`${testId}-camera-zoom-in`}
        >
          <ZoomIn aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={() => zoomAroundCentre(1 / CAMERA_ZOOM_BUTTON_STEP)}
          disabled={view.zoom <= ACW_CANVAS_CAMERA_MIN_ZOOM + 1e-6}
          className="p-1 rounded hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
          title={CAMERA_ZOOM_OUT_LABEL}
          aria-label={CAMERA_ZOOM_OUT_LABEL}
          data-testid={`${testId}-camera-zoom-out`}
        >
          <ZoomOut aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={resetCamera}
          className="p-1 rounded hover:bg-muted/40"
          title={CAMERA_RESET_LABEL}
          aria-label={CAMERA_RESET_LABEL}
          data-testid={`${testId}-camera-reset`}
        >
          <RefreshCcw aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={fitContent}
          disabled={drawables.length === 0}
          className="p-1 rounded hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
          title={CAMERA_FIT_LABEL}
          aria-label={CAMERA_FIT_LABEL}
          data-testid={`${testId}-camera-fit`}
        >
          <Maximize aria-hidden="true" size={12} />
        </button>
        <button
          type="button"
          onClick={recentreOnSelection}
          disabled={selection.length === 0 && drawables.length === 0}
          className="p-1 rounded hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
          title={CAMERA_RECENTRE_LABEL}
          aria-label={CAMERA_RECENTRE_LABEL}
          data-testid={`${testId}-camera-recentre`}
        >
          <Locate aria-hidden="true" size={12} />
        </button>
        <span
          className="px-1 text-[10px] tabular-nums tracking-tight text-muted-foreground"
          data-testid={`${testId}-camera-zoom-readout`}
          aria-label={CAMERA_ZOOM_LEVEL_LABEL}
          title={CAMERA_ZOOM_LEVEL_LABEL}
        >
          {Math.round(view.zoom * 100)}%
        </span>
      </div>

      {/* Minimap (Task #161). Bottom-right. Renders one rectangle
          per visible drawable plus a viewport box that tracks the
          current camera. Read-only — no click-to-pan — so the
          existing marquee / pan / drag gestures inside the canvas
          remain unambiguous. */}
      {(() => {
        const cb = visibleContentBounds();
        if (cb === null) return null;
        const { w: vw, h: vh } = viewportSize();
        // Stable minimap size; sized so it never crowds the
        // bottom-right pan-hint or the top-right HUD.
        const MM_W = 140;
        const MM_H = 90;
        // Inflate the world bounds so the minimap viewport is a
        // window onto the same coordinate space the user can pan
        // away into. We pick max(content-bounds, current-viewport-
        // in-canvas-space) so panning beyond the content still
        // moves the viewport rectangle.
        const vbX = view.zoom > 0 ? -view.x / view.zoom : 0;
        const vbY = view.zoom > 0 ? -view.y / view.zoom : 0;
        const vbW = view.zoom > 0 ? vw / view.zoom : cb.w;
        const vbH = view.zoom > 0 ? vh / view.zoom : cb.h;
        const worldMinX = Math.min(cb.x, vbX);
        const worldMinY = Math.min(cb.y, vbY);
        const worldMaxX = Math.max(cb.x + cb.w, vbX + vbW);
        const worldMaxY = Math.max(cb.y + cb.h, vbY + vbH);
        const worldW = Math.max(1, worldMaxX - worldMinX);
        const worldH = Math.max(1, worldMaxY - worldMinY);
        const scale = Math.min(MM_W / worldW, MM_H / worldH);
        const offsetX = (MM_W - worldW * scale) / 2;
        const offsetY = (MM_H - worldH * scale) / 2;
        const project = (
          x: number,
          y: number,
          w: number,
          h: number,
        ): { x: number; y: number; w: number; h: number } => ({
          x: offsetX + (x - worldMinX) * scale,
          y: offsetY + (y - worldMinY) * scale,
          w: Math.max(1, w * scale),
          h: Math.max(1, h * scale),
        });
        return (
          <div
            className="absolute bottom-2 right-2 z-10 rounded-md border border-border/60 bg-background/80 p-1 backdrop-blur-sm pointer-events-none"
            data-testid={`${testId}-minimap`}
            aria-label={MINIMAP_LABEL}
            title={MINIMAP_LABEL}
          >
            <svg width={MM_W} height={MM_H} role="img" aria-hidden="true">
              <rect
                x={0}
                y={0}
                width={MM_W}
                height={MM_H}
                fill="rgba(255,255,255,0.02)"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={0.5}
              />
              {drawables.map((d) => {
                const box = d.isContainer ? containerBox(d) : leafBox(d);
                const p = project(box.x, box.y, box.w, box.h);
                return (
                  <rect
                    key={`mm-${d.node.id}`}
                    x={p.x}
                    y={p.y}
                    width={p.w}
                    height={p.h}
                    fill={d.isContainer ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={0.4}
                  />
                );
              })}
              {(() => {
                const p = project(vbX, vbY, vbW, vbH);
                return (
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.w}
                    height={p.h}
                    fill="rgba(255,255,255,0)"
                    stroke="rgba(120,180,255,0.85)"
                    strokeWidth={1}
                    data-testid={`${testId}-minimap-viewport`}
                  />
                );
              })()}
            </svg>
          </div>
        );
      })()}

      {isEmpty ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
          data-testid={`${testId}-empty`}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {EMPTY_TITLE}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1 italic">
            {emptyHint ?? EMPTY_SUBTITLE}
          </p>
        </div>
      ) : (
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
          onMouseDown={(e) => {
            // Click on bare svg clears selection
            if (e.target === e.currentTarget) {
              setSelection([]);
            }
          }}
        >
          <g style={transformStyle as Record<string, string | number>}>
            {/* Container nested boxes (drawn behind everything) */}
            {drawables
              .filter((d) => d.isContainer)
              .map((d) => {
                const box = containerBox(d);
                const collapsed = d.isCollapsedHere;
                const total = totalChildCount.get(d.node.id) ?? 0;
                return (
                  <g key={`container-${d.node.id}`} data-testid={`${testId}-container-${d.node.id}`}>
                    {/* Bounding rect and header strip are pure
                        decoration — they must not catch pointer
                        events, otherwise they intercept clicks
                        meant for the collapse toggle or the leaf
                        nodes that visually sit on top of them. */}
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.w}
                      height={box.h}
                      rx={6}
                      fill="rgba(255,255,255,0.02)"
                      stroke="rgba(255,255,255,0.25)"
                      strokeDasharray={collapsed ? "4 4" : "2 4"}
                      strokeWidth={1}
                      pointerEvents="none"
                    />
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.w}
                      height={18}
                      fill="rgba(255,255,255,0.04)"
                      pointerEvents="none"
                    />
                    <text
                      x={box.x + 8}
                      y={box.y + 13}
                      fontSize="9"
                      fontFamily="monospace"
                      fill="rgba(255,255,255,0.7)"
                      pointerEvents="none"
                    >
                      {ACW_ELEMENT_TYPE_LABEL[d.node.type]}: {resolveLabel(d.node)}
                      {" — "}
                      {total} {CONTAINED_PREFIX}
                    </text>
                    {/* Collapse toggle: explicitly enabled for
                        pointer events so it wins against any
                        ancestor that turned them off. */}
                    {/* EAStudio Phase 2 — Connect-mode click overlay
                        over the container header strip. Only mounted
                        while connectMode is armed AND the container
                        is not a sealed domain root, so the affordance
                        does not exist outside the connect flow and
                        cannot be used to author an edge with a
                        sealed endpoint. The overlay is transparent
                        and sits above the decorative header rect
                        (which has pointerEvents="none"); leaf
                        children render on a higher z and remain
                        clickable on top of it. */}
                    {connectMode && d.node.isDomainContainer !== true && (
                      <rect
                        x={box.x}
                        y={box.y}
                        width={box.w - 64}
                        height={18}
                        fill="transparent"
                        style={{ cursor: "pointer", pointerEvents: "all" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onNodeConnectClick?.(d.node.id);
                        }}
                        data-testid={`${testId}-connect-target-${d.node.id}`}
                      />
                    )}
                    <g
                      style={{ cursor: "pointer", pointerEvents: "all" }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapsed(lensId, d.node.id);
                      }}
                      data-testid={`${testId}-collapse-${d.node.id}`}
                    >
                      <rect
                        x={box.x + box.w - 60}
                        y={box.y + 2}
                        width={56}
                        height={14}
                        fill="rgba(255,255,255,0.08)"
                        stroke="rgba(255,255,255,0.4)"
                        rx={2}
                      />
                      <text
                        x={box.x + box.w - 32}
                        y={box.y + 12}
                        textAnchor="middle"
                        fontSize="8"
                        fontFamily="monospace"
                        fill="rgba(255,255,255,0.9)"
                        pointerEvents="none"
                      >
                        {collapsed ? EXPAND_LABEL : COLLAPSE_LABEL}
                      </text>
                    </g>
                  </g>
                );
              })}

            {/* Arrowhead marker — declared once per canvas. The
                triangle is sized to the leaf-node footprint so it
                reads at the same visual weight regardless of zoom. */}
            <defs>
              <marker
                id={`${testId}-arrowhead`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  fill="rgba(255,255,255,0.55)"
                />
              </marker>
              <marker
                id={`${testId}-arrowhead-selected`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  fill="rgba(120,200,255,0.95)"
                />
              </marker>
            </defs>
            {/* Edges between visible siblings or visible children.
                EAStudio Phase 2 — rendered as cubic Bezier curves
                with an arrowhead at the destination. Click selects
                the edge; the host owns the delete affordance.
                EAStudio Phase 2 (post-validation) — when
                `suppressEdgeRendering` is true, all edge rendering
                is delegated to a host-level overlay so cross-canvas
                edges (whose endpoints sit in different
                InteractiveCanvas2D instances, e.g. across the four
                EAStudio domain quadrants) remain visible and
                selectable. Single-canvas lenses leave it false and
                continue rendering edges in-canvas as before. */}
            {!suppressEdgeRendering && (() => {
              // Resolve endpoints by their visible position. An edge
              // is drawn iff both endpoints are currently visible
              // (direct sibling at the focus level or visible child
              // of a non-collapsed container at this level).
              const visibleAt = new Map<string, { x: number; y: number }>();
              for (const d of drawables) {
                visibleAt.set(d.node.id, { x: d.x, y: d.y });
                for (const c of d.childRefs) {
                  visibleAt.set(c.id, { x: c.x, y: c.y });
                }
              }
              return edges.map((e) => {
                const a = visibleAt.get(e.fromId);
                const b = visibleAt.get(e.toId);
                if (!a || !b) return null;
                // Cubic Bezier with horizontal-leaning control
                // points. The handle distance scales with the
                // straight-line gap so short edges stay tight and
                // long edges arc gently.
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const handle = Math.max(20, Math.min(120, dist * 0.4));
                // Stop the curve at the edge of the destination
                // rectangle so the arrowhead does not punch into
                // the node card. We retract along the unit vector.
                const len = Math.max(dist, 1);
                const ux = dx / len;
                const uy = dy / len;
                const RETRACT = NODE_W / 2 + 2;
                const ex = b.x - ux * RETRACT;
                const ey = b.y - uy * RETRACT;
                const sx = a.x + ux * (NODE_W / 2 + 2);
                const sy = a.y + uy * (NODE_H / 2 + 2);
                const path = `M ${sx} ${sy} C ${sx + handle} ${sy} ${ex - handle} ${ey} ${ex} ${ey}`;
                const isSelected = selectedEdgeId === e.id;
                // Midpoint of the cubic Bezier evaluated at t=0.5
                // gives a stable anchor for the in-canvas confirm
                // pill. Approximation via segment midpoint is good
                // enough for short orthogonal-ish CONNECTS edges.
                const midX = (sx + ex) / 2;
                const midY = (sy + ey) / 2;
                return (
                  <g
                    key={e.id}
                    data-testid={`${testId}-edge-${e.id}`}
                    style={{ cursor: "pointer" }}
                    onMouseDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEdgeClick?.(e.id);
                    }}
                    onContextMenu={(ev) => {
                      // Right-click also selects the edge so the
                      // confirm pill appears. Hosts that ignore
                      // `onEdgeClick` get the same behavior they
                      // would have on a left click.
                      ev.preventDefault();
                      ev.stopPropagation();
                      onEdgeClick?.(e.id);
                    }}
                  >
                    {/* Invisible fat hit-line for easier picking. */}
                    <path
                      d={path}
                      stroke="rgba(0,0,0,0)"
                      strokeWidth={10}
                      fill="none"
                    />
                    <path
                      d={path}
                      stroke={
                        isSelected
                          ? "rgba(120,200,255,0.95)"
                          : "rgba(255,255,255,0.55)"
                      }
                      strokeWidth={isSelected ? 1.6 : 1}
                      fill="none"
                      markerEnd={`url(#${testId}-arrowhead${isSelected ? "-selected" : ""})`}
                    />
                    {isSelected ? (
                      // EAStudio Phase 2 — in-canvas confirm pill.
                      // Rendered only for the currently-selected
                      // edge so the rest of the graph stays inert.
                      // Click "Delete" fires `onEdgeDelete`; click
                      // "Cancel" simply re-fires `onEdgeClick` on
                      // the same edge, which the host treats as a
                      // toggle-off (same convention as nodes and
                      // pending Connect sources).
                      <g
                        data-testid={`${testId}-edge-${e.id}-confirm`}
                        transform={`translate(${midX - 28}, ${midY - 9})`}
                      >
                        <rect
                          x={0}
                          y={0}
                          width={56}
                          height={18}
                          rx={4}
                          ry={4}
                          fill="rgba(20,28,40,0.96)"
                          stroke="rgba(120,200,255,0.95)"
                          strokeWidth={0.6}
                        />
                        <g
                          data-testid={`${testId}-edge-${e.id}-delete`}
                          style={{ cursor: "pointer" }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onEdgeDelete?.(e.id);
                          }}
                        >
                          <rect
                            x={1}
                            y={1}
                            width={36}
                            height={16}
                            rx={3}
                            ry={3}
                            fill="rgba(180,60,60,0.0)"
                          />
                          <text
                            x={19}
                            y={12}
                            textAnchor="middle"
                            fontSize={9}
                            fill="rgba(255,180,180,0.95)"
                            fontFamily="ui-sans-serif, system-ui, sans-serif"
                          >
                            Delete
                          </text>
                        </g>
                        <line
                          x1={38}
                          y1={3}
                          x2={38}
                          y2={15}
                          stroke="rgba(120,200,255,0.4)"
                          strokeWidth={0.4}
                        />
                        <g
                          data-testid={`${testId}-edge-${e.id}-cancel`}
                          style={{ cursor: "pointer" }}
                          onClick={(ev) => {
                            // Cancel = toggle the selection off via
                            // the host. Reuses `onEdgeClick`, which
                            // hosts implement as a toggle, so we
                            // need not add a third callback.
                            ev.stopPropagation();
                            onEdgeClick?.(e.id);
                          }}
                        >
                          <rect
                            x={39}
                            y={1}
                            width={16}
                            height={16}
                            rx={3}
                            ry={3}
                            fill="rgba(0,0,0,0)"
                          />
                          <text
                            x={47}
                            y={12}
                            textAnchor="middle"
                            fontSize={9}
                            fill="rgba(220,220,220,0.85)"
                            fontFamily="ui-sans-serif, system-ui, sans-serif"
                          >
                            ×
                          </text>
                        </g>
                      </g>
                    ) : null}
                  </g>
                );
              });
            })()}

            {/* Children inside non-collapsed containers, then leaf
                siblings on top */}
            {drawables.flatMap((d) =>
              d.childRefs.map((child) => {
                const dx = drag?.nodeId === child.id ? drag.snapX : child.x;
                const dy = drag?.nodeId === child.id ? drag.snapY : child.y;
                return renderNodeBox(child, false, dx, dy);
              }),
            )}
            {drawables.map((d) => {
              if (d.isContainer) return null;
              return renderNodeBox(d.node, selection.includes(d.node.id), d.x, d.y);
            })}

            {/* Marquee rectangle (drawn under guides). Coordinates
                are already in canvas space because the parent <g>
                applies the view transform; we render directly. */}
            {marquee ? (
              <rect
                x={Math.min(marquee.startX, marquee.currentX)}
                y={Math.min(marquee.startY, marquee.currentY)}
                width={Math.abs(marquee.currentX - marquee.startX)}
                height={Math.abs(marquee.currentY - marquee.startY)}
                fill="rgba(120,200,255,0.10)"
                stroke="rgba(120,200,255,0.7)"
                strokeWidth={0.6}
                strokeDasharray="2 2"
                data-testid={`${testId}-marquee`}
                pointerEvents="none"
              />
            ) : null}

            {/* Alignment guides (drawn last so they sit on top) */}
            {alignmentGuides.map((g, i) =>
              g.kind === "v" ? (
                <line
                  key={`guide-${i}`}
                  x1={g.pos}
                  y1={-4000}
                  x2={g.pos}
                  y2={4000}
                  stroke="rgba(120,200,255,0.5)"
                  strokeWidth={0.6}
                  strokeDasharray="2 3"
                  data-testid={`${testId}-guide-v`}
                />
              ) : (
                <line
                  key={`guide-${i}`}
                  x1={-4000}
                  y1={g.pos}
                  x2={4000}
                  y2={g.pos}
                  stroke="rgba(120,200,255,0.5)"
                  strokeWidth={0.6}
                  strokeDasharray="2 3"
                  data-testid={`${testId}-guide-h`}
                />
              ),
            )}
          </g>
        </svg>
      )}
    </div>
  );

  // Inline helper so it can close over selection / drag handlers.
  function renderNodeBox(
    n: AcwNode,
    selected: boolean,
    overrideX?: number,
    overrideY?: number,
  ) {
    const x = overrideX ?? n.x;
    const y = overrideY ?? n.y;
    const isDragging = drag?.nodeId === n.id;
    const isSelected = selection.includes(n.id);
    // EAStudio Phase 2 — pending Connect source gets a distinct
    // accent so the user knows where the destination click lands.
    const isPendingSource = pendingSourceId === n.id;
    // Phase 5 — bound-binding visuals. The icon (when the node has
    // a recognised `boundTechnologyCategory`) is rendered as a
    // nested <svg> in the top-left corner; the lower line of text
    // uses the bound-option label when present, falling back to
    // the node's own `label`.
    const iconEntry = resolveIcon(n);
    const displayLabel = resolveLabel(n);
    return (
      <g
        key={n.id}
        data-testid={`${testId}-node-${n.id}`}
        data-acw-node-id={n.id}
        style={{ cursor: "grab" }}
        onMouseDown={(e) => onNodeMouseDown(e, n)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDrillDown?.(n.id);
        }}
      >
        <rect
          x={x - NODE_W / 2}
          y={y - NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx={4}
          fill={isDragging ? "rgba(120,200,255,0.12)" : "rgba(255,255,255,0.06)"}
          stroke={
            isPendingSource
              ? "rgba(255,200,80,0.95)"
              : isSelected || selected
                ? "rgba(120,200,255,0.85)"
                : "rgba(255,255,255,0.45)"
          }
          strokeWidth={isPendingSource || isSelected || selected ? 1.5 : 1}
          strokeDasharray={isPendingSource ? "3 2" : undefined}
        />
        {iconEntry ? (
          <g
            transform={`translate(${x - NODE_W / 2 + 3}, ${y - NODE_H / 2 + 3})`}
            data-testid={`${testId}-node-icon-${n.id}`}
            pointerEvents="none"
          >
            <iconEntry.Icon
              width={10}
              height={10}
              color="rgba(255,255,255,0.85)"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </g>
        ) : null}
        <text
          x={x}
          y={y - 1}
          textAnchor="middle"
          fontSize="9"
          fontFamily="monospace"
          fill="rgba(255,255,255,0.85)"
        >
          {ACW_ELEMENT_TYPE_LABEL[n.type as AcwElementType]}
        </text>
        <text
          x={x}
          y={y + 10}
          textAnchor="middle"
          fontSize="9"
          fontFamily="monospace"
          fill="rgba(255,255,255,0.7)"
          data-testid={`${testId}-node-label-${n.id}`}
        >
          {displayLabel}
        </text>
      </g>
    );
  }
}

// Re-export the sentinel for build-time invariant probing without
// pulling all the React internals — `isCollapsed` proves the
// collapse predicate is wired to the per-lens key.
export const __interactiveCanvasInternals = Object.freeze({ isCollapsed });

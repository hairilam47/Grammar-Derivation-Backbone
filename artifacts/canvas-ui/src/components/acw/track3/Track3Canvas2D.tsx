// ACW Track 3 — 2D derived canvas.
//
// Reads only the props passed by the shell (no workspace hook,
// no store import). Computes visibility through the shared
// `enumerateLensVisibility` helper so the 2D and 3D renderers
// surface the same structure. The render is purely structural:
// SVG primitives, neutral palette, no inline styling that would
// imply judgement, status, or semantics beyond containment +
// adjacency.
//
// Zoom + pan: mouse-wheel adjusts zoom; mouse-drag pans the
// view. Camera state is owned by the shell (persisted in
// `acw.track3.viewprefs.v1`) and pushed back via
// `onCameraChange`. No animation, no easing — pure functional
// camera math.
//
// Focus / isolate: clicking a node fires `onNodeClick(id)`. The
// shell decides what to do with it (typically: set
// `focusedParentId` so the shared visibility helper isolates it
// and its neighbours).
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import {
  enumerateLensVisibility,
  type AcwNode,
  type AcwEdge,
} from "@/acw/acwLensStructure";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";

const EMPTY_HINT = "No selections yet — open the bound CTAD shell to add some.";
const LEGEND_LABEL = "Containment + adjacency view";

assertAllAcwTrack3Language([EMPTY_HINT, LEGEND_LABEL]);

export interface Track3Canvas2DProps {
  readonly nodes: readonly AcwNode[];
  readonly edges: readonly AcwEdge[];
  readonly collapsedIds: ReadonlySet<string>;
  // Highlight target only. Visibility filtering happens in the
  // shell BEFORE this component is invoked (see Track3Shell);
  // the helper below is therefore called with focusedParentId
  // === null and simply enumerates everything in `nodes`/`edges`.
  readonly selectedNodeId: string | null;
  readonly cameraX?: number;
  readonly cameraY?: number;
  readonly cameraZoom?: number;
  readonly onCameraChange?: (
    cameraX: number,
    cameraY: number,
    cameraZoom: number,
  ) => void;
  readonly onNodeClick?: (nodeId: string) => void;
  readonly testId?: string;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

function clampZoom(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function Track3Canvas2D(props: Track3Canvas2DProps) {
  const {
    nodes,
    edges,
    collapsedIds,
    selectedNodeId,
    onCameraChange,
    onNodeClick,
  } = props;
  const cameraX = props.cameraX ?? 0;
  const cameraY = props.cameraY ?? 0;
  const cameraZoom = clampZoom(props.cameraZoom ?? 1);
  const testId = props.testId ?? "track3-canvas-2d";

  const visibility = useMemo(
    // Visibility was already isolated in the shell; pass null so
    // the helper is a pure pass-through across the input set.
    () => enumerateLensVisibility(nodes, edges, null, collapsedIds),
    [nodes, edges, collapsedIds],
  );
  const visibleNodes: AcwNode[] = useMemo(() => {
    const visible = new Set(visibility.visibleNodeIds);
    return nodes.filter((n) => visible.has(n.id));
  }, [nodes, visibility]);
  const visibleEdges = visibility.visibleEdges;

  // Compute base viewport bounds from visible node positions
  // (with a padded margin so labels do not clip). Camera is
  // applied on top of that base box.
  const padding = 80;
  const labelHeight = 28;
  const labelWidth = 140;
  const baseBox = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { x: 0, y: 0, w: 600, h: 300 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of visibleNodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + labelWidth > maxX) maxX = n.x + labelWidth;
      if (n.y + labelHeight > maxY) maxY = n.y + labelHeight;
    }
    return {
      x: minX - padding,
      y: minY - padding,
      w: maxX - minX + padding * 2,
      h: maxY - minY + padding * 2,
    };
  }, [visibleNodes]);

  // Camera applies pan (cameraX/Y) and zoom (cameraZoom) to the
  // viewBox. Higher zoom → smaller viewBox → content appears
  // bigger. The camera centres on baseBox + camera pan offset.
  const viewBox = useMemo(() => {
    const w = baseBox.w / cameraZoom;
    const h = baseBox.h / cameraZoom;
    const cx = baseBox.x + baseBox.w / 2 + cameraX;
    const cy = baseBox.y + baseBox.h / 2 + cameraY;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [baseBox, cameraX, cameraY, cameraZoom]);

  const isEmpty = visibleNodes.length === 0;

  // Pan/zoom interaction. We track local drag state in a ref so
  // we don't fight React's re-render. Camera writes go through
  // `onCameraChange` which the shell persists.
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startCamX: number;
    startCamY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [, setRenderTick] = useState(0);

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    // Only left-button drag for pan.
    if (e.button !== 0) return;
    // Avoid hijacking node clicks: nodes set their own
    // pointerdown handler with stopPropagation.
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startCamX: cameraX,
      startCamY: cameraY,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Convert pixel delta into viewBox units, scaled by current zoom.
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    const unitsPerPxX = baseBox.w / cameraZoom / rect.width;
    const unitsPerPxY = baseBox.h / cameraZoom / rect.height;
    const nextX = d.startCamX - dxPx * unitsPerPxX;
    const nextY = d.startCamY - dyPx * unitsPerPxY;
    onCameraChange?.(nextX, nextY, cameraZoom);
  }
  function handlePointerUp(e: PointerEvent<SVGSVGElement>) {
    if (dragRef.current) dragRef.current.active = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }
  function handleWheel(e: WheelEvent<SVGSVGElement>) {
    // Negative deltaY = zoom in (typical mouse-wheel up).
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = clampZoom(cameraZoom * factor);
    if (next !== cameraZoom) {
      onCameraChange?.(cameraX, cameraY, next);
      // Force a render in case parent isn't re-rendering us.
      setRenderTick((t) => t + 1);
    }
  }

  return (
    <div
      data-testid={testId}
      className="relative rounded-md border border-border/40 bg-card/30 overflow-hidden"
      style={{ minHeight: 360 }}
    >
      {isEmpty ? (
        <div
          data-testid={`${testId}-empty`}
          className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground italic"
        >
          {EMPTY_HINT}
        </div>
      ) : (
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          style={{ height: 360, cursor: dragRef.current?.active ? "grabbing" : "grab", touchAction: "none" }}
          data-testid={`${testId}-svg`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          {visibleEdges.map((e) => {
            const a = visibleNodes.find((n) => n.id === e.fromId);
            const b = visibleNodes.find((n) => n.id === e.toId);
            if (!a || !b) return null;
            return (
              <line
                key={e.id}
                x1={a.x + labelWidth / 2}
                y1={a.y + labelHeight / 2}
                x2={b.x + labelWidth / 2}
                y2={b.y + labelHeight / 2}
                stroke="#64748b"
                strokeWidth={1}
                strokeOpacity={0.6}
                data-testid={`${testId}-edge-${e.id}`}
              />
            );
          })}
          {visibleNodes.map((n) => {
            const isFocused = selectedNodeId === n.id;
            return (
              <g
                key={n.id}
                data-testid={`${testId}-node-${n.id}`}
                style={{ cursor: "pointer" }}
                onPointerDown={(ev) => {
                  // Stop the pan-drag from starting on a node.
                  ev.stopPropagation();
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onNodeClick?.(n.id);
                }}
              >
                <rect
                  x={n.x}
                  y={n.y}
                  width={labelWidth}
                  height={labelHeight}
                  rx={4}
                  ry={4}
                  fill={n.type === "Zone" ? "#1e293b" : "#0f172a"}
                  stroke={isFocused ? "#fbbf24" : n.type === "Zone" ? "#94a3b8" : "#475569"}
                  strokeWidth={isFocused ? 2 : 1}
                />
                <text
                  x={n.x + labelWidth / 2}
                  y={n.y + labelHeight / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#e2e8f0"
                  fontFamily="ui-monospace, monospace"
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <div
        className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-legend`}
      >
        {LEGEND_LABEL}
      </div>
      <div
        className="absolute bottom-2 right-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-zoom`}
      >
        {Math.round(cameraZoom * 100)}%
      </div>
    </div>
  );
}

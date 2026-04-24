// ACW Track 3 — 2D derived canvas.
//
// Reads only the props passed by the shell (no workspace hook,
// no store import). The shell drives a DiagramSpec compile +
// ELK layout pipeline and hands this renderer pre-laid-out
// positioned nodes; this component never touches the layout
// engine. Computes visibility through the shared
// `enumerateLensVisibility` helper so the 2D and 3D renderers
// surface the same structure.
//
// 2D projects the multi-stratum scene onto a single XY plane.
// Stratum is encoded by a small Y offset so containment context
// remains legible; the layer-toggle filter is visibility-only
// and never re-runs ELK.
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import {
  enumerateLensVisibility,
  type AcwNode,
  type AcwEdge,
} from "@/acw/acwLensStructure";
import {
  STRATUM_INDEX,
  type DiagramStratum,
} from "@workspace/diagramspec";
import type { PositionedDiagram } from "@workspace/diagram-layout";
import { ctadSectionOfNodeId } from "@/acw/track3/track3DiagramAdapter";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";

const EMPTY_HINT = "No selections yet — open the bound CTAD shell to add some.";
const LEGEND_LABEL = "Containment + stratum view";

assertAllAcwTrack3Language([EMPTY_HINT, LEGEND_LABEL]);

export interface Track3Canvas2DProps {
  readonly positionedDiagrams: readonly PositionedDiagram[];
  readonly hiddenSections: ReadonlySet<string>;
  // Visibility-isolation: kept node id set produced by the shell
  // via `isolateAroundNode(selectedNodeId)`. null means no
  // isolation is active. Treated as an additional visibility
  // filter on top of `hiddenSections` so a click isolates the
  // node + its neighbours.
  readonly isolatedKeptIds?: ReadonlySet<string> | null;
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
  // Phase 4 (Task #81): when "fill", the canvas grows to 100%
  // of its container (used by the full-page floating-overlay
  // mode). Default keeps the historical 360px height so any
  // legacy / inline embedding renders unchanged.
  readonly containerHeight?: number | "fill";
}

interface FlatNode extends AcwNode {
  readonly stratum: DiagramStratum;
  readonly section: string | null;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const STRATUM_Y_OFFSET = 240;

function clampZoom(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function flattenDiagrams(
  pds: readonly PositionedDiagram[],
): { nodes: readonly FlatNode[]; edges: readonly AcwEdge[] } {
  const nodes: FlatNode[] = [];
  const edges: AcwEdge[] = [];
  for (const pd of pds) {
    const yOffset = STRATUM_INDEX[pd.stratum] * STRATUM_Y_OFFSET;
    for (const n of pd.nodes) {
      nodes.push({
        id: n.id,
        type: n.parentId === null ? "Zone" : "Component",
        parentId: n.parentId,
        label: n.label,
        x: n.x,
        y: n.y + yOffset,
        stratum: pd.stratum,
        section: ctadSectionOfNodeId(n.id),
      });
    }
    for (const e of pd.edges) {
      edges.push({
        id: e.id,
        kind: "CONNECTS",
        fromId: e.from,
        toId: e.to,
      });
    }
  }
  return { nodes, edges };
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export function Track3Canvas2D(props: Track3Canvas2DProps) {
  const {
    positionedDiagrams,
    hiddenSections,
    isolatedKeptIds,
    selectedNodeId,
    onCameraChange,
    onNodeClick,
  } = props;
  const cameraX = props.cameraX ?? 0;
  const cameraY = props.cameraY ?? 0;
  const cameraZoom = clampZoom(props.cameraZoom ?? 1);
  const testId = props.testId ?? "track3-canvas-2d";

  const flat = useMemo(
    () => flattenDiagrams(positionedDiagrams),
    [positionedDiagrams],
  );

  // Pure pass-through to satisfy the structural-identity
  // invariant. Section-filter is applied below.
  const visibility = useMemo(
    () => enumerateLensVisibility(flat.nodes, flat.edges, null, EMPTY_SET),
    [flat],
  );
  const visibleIds = useMemo(
    () => new Set(visibility.visibleNodeIds),
    [visibility],
  );

  const visibleNodes = useMemo(
    () =>
      flat.nodes.filter((n) => {
        if (!visibleIds.has(n.id)) return false;
        if (n.section !== null && hiddenSections.has(n.section)) return false;
        if (
          isolatedKeptIds !== null &&
          isolatedKeptIds !== undefined &&
          !isolatedKeptIds.has(n.id)
        )
          return false;
        return true;
      }),
    [flat.nodes, visibleIds, hiddenSections, isolatedKeptIds],
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );
  const visibleEdges = useMemo(
    () =>
      visibility.visibleEdges.filter(
        (e) => visibleNodeIds.has(e.fromId) && visibleNodeIds.has(e.toId),
      ),
    [visibility, visibleNodeIds],
  );

  const padding = 80;
  const labelHeight = 28;
  const labelWidth = 140;
  // baseBox MUST be computed from the full positioned set, not
  // the visibility-filtered subset. If baseBox depended on
  // `visibleNodes`, hiding a layer would re-fit the viewBox and
  // visually translate every remaining node — re-purposing the
  // layer toggle into a re-layout, breaking the visibility-only
  // contract that distinguishes Track 3 from a derivation.
  const baseBox = useMemo(() => {
    if (flat.nodes.length === 0) {
      return { x: 0, y: 0, w: 600, h: 300 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of flat.nodes) {
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
  }, [flat.nodes]);

  const viewBox = useMemo(() => {
    const w = baseBox.w / cameraZoom;
    const h = baseBox.h / cameraZoom;
    const cx = baseBox.x + baseBox.w / 2 + cameraX;
    const cy = baseBox.y + baseBox.h / 2 + cameraY;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [baseBox, cameraX, cameraY, cameraZoom]);

  const isEmpty = visibleNodes.length === 0;

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
    if (e.button !== 0) return;
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
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = clampZoom(cameraZoom * factor);
    if (next !== cameraZoom) {
      onCameraChange?.(cameraX, cameraY, next);
      setRenderTick((t) => t + 1);
    }
  }

  return (
    <div
      data-testid={testId}
      className="relative rounded-md border border-border/40 bg-card/30 overflow-hidden"
      style={
        props.containerHeight === "fill"
          ? { width: "100%", height: "100%" }
          : { minHeight: props.containerHeight ?? 360 }
      }
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
          style={{
            height: props.containerHeight === "fill" ? "100%" : (props.containerHeight ?? 360),
            cursor: dragRef.current?.active ? "grabbing" : "grab",
            touchAction: "none",
          }}
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
        className="pointer-events-none absolute bottom-2 left-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-legend`}
      >
        {LEGEND_LABEL}
      </div>
      <div
        className="pointer-events-none absolute bottom-2 right-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-zoom`}
      >
        {Math.round(cameraZoom * 100)}%
      </div>
    </div>
  );
}

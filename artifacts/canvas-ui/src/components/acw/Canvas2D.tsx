// ACW Workspace Builder — reusable 2D canvas primitive.
//
// Empty by default: renders an instructional empty state and a
// neutral grid background. Supports pan via mouse drag and zoom via
// wheel. No example shapes, no auto-layout templates, no inferred
// connections. Any nodes / edges passed in are rendered exactly as
// supplied; the primitive does not invent or arrange content.
//
// Generic placeholder vocabulary only (`Domain`, `System`,
// `Connection`, `Zone`, `Interface`). All static labels asserted
// against ACW_PLACEHOLDER_FORBIDDEN at module load.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, WheelEvent } from "react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const EMPTY_TITLE = "Empty 2D canvas";
const EMPTY_SUBTITLE = "Add systems to begin";
const ZOOM_LABEL = "Zoom";
const RESET_LABEL = "Reset view";
const NODE_FALLBACK_LABEL = "Node";

assertAllAcwPlaceholderLanguage([
  EMPTY_TITLE,
  EMPTY_SUBTITLE,
  ZOOM_LABEL,
  RESET_LABEL,
  NODE_FALLBACK_LABEL,
]);

export interface Canvas2DNode {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface Canvas2DEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

export interface Canvas2DProps {
  nodes?: readonly Canvas2DNode[];
  edges?: readonly Canvas2DEdge[];
  emptyHint?: string;
  height?: number | string;
  testId?: string;
  /**
   * Drill-down navigation contract. When supplied, every rendered
   * node becomes a clickable affordance that invokes
   * `onNodeDrillDown(nodeId)` so the host lens can step into a deeper
   * level of decomposition. The primitive itself does not maintain
   * the depth path or invent hierarchy — it only surfaces the click.
   * Lenses that wire this prop are responsible for their own depth
   * model, breadcrumb, and back affordance.
   */
  onNodeDrillDown?: (nodeId: string) => void;
}

interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

const INITIAL_VIEW: ViewState = { x: 0, y: 0, zoom: 1 };

export function Canvas2D(props: Canvas2DProps) {
  const {
    nodes = [],
    edges = [],
    emptyHint,
    height = 360,
    testId = "acw-canvas-2d",
    onNodeDrillDown,
  } = props;
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const dragRef = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isEmpty = nodes.length === 0 && edges.length === 0;

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setView((v) => ({ ...v, x: dragRef.current!.vx + dx, y: dragRef.current!.vy + dy }));
  };
  const onMouseUp = () => {
    dragRef.current = null;
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setView((v) => ({ ...v, zoom: Math.min(4, Math.max(0.25, v.zoom + delta)) }));
  };

  // Native wheel listener with passive:false so preventDefault works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (ev: globalThis.WheelEvent) => {
      ev.preventDefault();
      const delta = -ev.deltaY * 0.001;
      setView((v) => ({ ...v, zoom: Math.min(4, Math.max(0.25, v.zoom + delta)) }));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const transformStyle: CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    transformOrigin: "0 0",
  };

  // Resolve edge endpoints by node id; skip dangling edges silently.
  const nodesById = new Map(nodes.map((n) => [n.id, n] as const));

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        cursor: dragRef.current ? "grabbing" : "grab",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
      className="rounded-md border border-border/40 bg-muted/10"
    >
      {/* HUD: zoom level + reset */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-hud`}
      >
        <span>
          {ZOOM_LABEL} {view.zoom.toFixed(2)}×
        </span>
        <button
          type="button"
          onClick={() => setView(INITIAL_VIEW)}
          className="px-2 py-0.5 border border-border/60 rounded hover:text-primary hover:border-primary/60 transition-colors"
          data-testid={`${testId}-reset`}
        >
          {RESET_LABEL}
        </button>
      </div>

      {/* Empty state */}
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
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <g style={transformStyle as Record<string, string | number>}>
            {edges.map((e) => {
              const a = nodesById.get(e.fromId);
              const b = nodesById.get(e.toId);
              if (!a || !b) return null;
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1}
                />
              );
            })}
            {nodes.map((n) => {
              const drillable = typeof onNodeDrillDown === "function";
              return (
                <g
                  key={n.id}
                  data-testid={`${testId}-node-${n.id}`}
                  data-drillable={drillable ? "true" : "false"}
                  style={{
                    cursor: drillable ? "pointer" : "default",
                    pointerEvents: drillable ? "auto" : "none",
                  }}
                  onClick={
                    drillable
                      ? (ev) => {
                          ev.stopPropagation();
                          onNodeDrillDown!(n.id);
                        }
                      : undefined
                  }
                >
                  <rect
                    x={n.x - 36}
                    y={n.y - 14}
                    width={72}
                    height={28}
                    rx={4}
                    fill="rgba(255,255,255,0.06)"
                    stroke="rgba(255,255,255,0.4)"
                  />
                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="rgba(255,255,255,0.85)"
                  >
                    {n.label ?? NODE_FALLBACK_LABEL}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

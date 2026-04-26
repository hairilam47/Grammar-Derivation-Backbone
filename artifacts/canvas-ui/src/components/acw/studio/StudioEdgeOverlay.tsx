// EAStudio Phase 2 (post-validation) — single edge overlay.
//
// The four-quadrant studio canvas embeds one `InteractiveCanvas2D`
// instance per immutable domain container. Each per-quadrant canvas
// owns its own SVG and viewport, and its built-in edge layer can
// only see endpoints that resolve to a node visible *within that
// canvas*. CONNECTS edges whose source and destination sit in
// different quadrants therefore never rendered (the edge existed in
// the store; neither canvas's `visibleAt` map contained both
// endpoints), and could not be selected or deleted from the
// surface. The validator allows such edges between any two non-
// sealed nodes regardless of domain, so the gap was a pure UI
// rendering hole.
//
// This overlay closes that hole by rendering ALL EAStudio edges in
// a single SVG positioned absolutely over the entire domain grid.
// The per-quadrant canvases are mounted with
// `suppressEdgeRendering={true}` so they no longer draw edges or
// the in-canvas confirm pill — both responsibilities move here.
//
// Visual styling notes (Task #99):
//   - All stroke / fill colors come from the scoped `.eastudio-root`
//     CSS palette via the `es-edge-*` classes. The wrapper sits
//     inside `.eastudio-root`, so the cascade resolves the tokens
//     to the prototype's `var(--border3)` / `var(--accent)`.
//
// How it stays accurate without instrumenting every layout source:
//   - Each rendered node `<g>` carries `data-acw-node-id` (added in
//     `InteractiveCanvas2D`). The overlay queries the grid-rooted
//     subtree for those elements every animation frame, snapshots
//     each one's bounding rect translated into grid-local
//     coordinates, and re-renders only when the snapshot changes.
//   - This single rAF loop covers every position-changing event
//     (drag, scroll, collapse / expand, drilldown push / pop,
//     window resize, quadrant resize, etc.) without needing per-
//     source observers. The change-detection key is small and
//     hashing it per frame is well under one ms even with hundreds
//     of nodes; React only renders when the key actually changes.
//
// Selection / delete UX:
//   - Click an edge path → `onEdgeClick(id)` (the host implements a
//     toggle so clicking the already-selected edge dismisses it).
//   - Right-click an edge path → also fires `onEdgeClick(id)` so
//     the keyboard-light user gets the same selection gesture they
//     would on left click; matches the in-canvas convention.
//   - When `selectedEdgeId === e.id`, a confirm pill renders next
//     to the path with Delete and Cancel hot zones. Delete fires
//     `onEdgeDelete(id)`; Cancel re-fires `onEdgeClick(id)` (the
//     host's toggle clears the selection).
//
// Constitutional discipline:
//   - No mutations performed here. All store calls go through the
//     host's `onEdgeClick` / `onEdgeDelete` props, which route
//     through the validator-gated store API and refusal channel.
//   - Vector primitives only (SVG paths). No emoji, no animation.
//   - Static labels asserted against ACW_PLACEHOLDER_FORBIDDEN.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import type { AcwEdge } from "@/acw/acwStore";

const DELETE_LABEL = "Delete";
const CANCEL_LABEL = "Cancel";
assertAllAcwPlaceholderLanguage([DELETE_LABEL, CANCEL_LABEL]);

interface NodeRect {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

interface OverlaySize {
  readonly w: number;
  readonly h: number;
}

export interface StudioEdgeOverlayProps {
  /** Ref to the grid container all per-quadrant canvases live
   *  inside. Used as the coordinate origin for the overlay's SVG
   *  and as the query root for `data-acw-node-id` lookups. */
  readonly gridRef: RefObject<HTMLDivElement | null>;
  /** Every CONNECTS edge in the workspace — the overlay filters
   *  internally to those whose endpoints have rendered DOM. */
  readonly edges: readonly AcwEdge[];
  readonly selectedEdgeId: string | null;
  readonly onEdgeClick: (edgeId: string) => void;
  readonly onEdgeDelete: (edgeId: string) => void;
}

// Half-edge retract distance (px) so the arrow head stops just
// outside a node card rather than punching into it.
const RETRACT = 6;

export function StudioEdgeOverlay(props: StudioEdgeOverlayProps) {
  const { gridRef, edges, selectedEdgeId, onEdgeClick, onEdgeDelete } = props;
  const [positions, setPositions] = useState<ReadonlyMap<string, NodeRect>>(
    () => new Map(),
  );
  const [size, setSize] = useState<OverlaySize>({ w: 0, h: 0 });
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const grid = gridRef.current;
      if (grid !== null) {
        const gridRect = grid.getBoundingClientRect();
        const next = new Map<string, NodeRect>();
        const els = grid.querySelectorAll<SVGGraphicsElement>(
          "[data-acw-node-id]",
        );
        els.forEach((el) => {
          const id = el.getAttribute("data-acw-node-id");
          if (id === null) return;
          const r = el.getBoundingClientRect();
          // Skip elements with zero rendered area (e.g. the node
          // exists in the DOM but its enclosing canvas is hidden
          // behind an empty-state placeholder). Drawing a path to
          // a (0,0)-sized rect would put a stray edge in the
          // top-left corner of the overlay.
          if (r.width === 0 && r.height === 0) return;
          next.set(id, {
            cx: r.left - gridRect.left + r.width / 2,
            cy: r.top - gridRect.top + r.height / 2,
            w: r.width,
            h: r.height,
          });
        });
        // Cheap change key: sorted (id, cx, cy) tuples rounded to
        // tenths of a px. Equality on this key means no visible
        // movement; we skip the React update in that case.
        const entries: string[] = [];
        next.forEach((v, k) => {
          entries.push(`${k}:${v.cx.toFixed(1)},${v.cy.toFixed(1)}`);
        });
        entries.sort();
        const key = `${gridRect.width.toFixed(1)}x${gridRect.height.toFixed(1)}|${entries.join("|")}`;
        if (key !== prevKeyRef.current) {
          prevKeyRef.current = key;
          setPositions(next);
          setSize({ w: gridRect.width, h: gridRect.height });
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [gridRef]);

  // The overlay's <svg> covers the entire grid. The wrapper has
  // `pointer-events: none` so it does not intercept node drags or
  // marquee gestures inside the per-quadrant canvases; the edge
  // hit-paths and the confirm pill explicitly opt back in via
  // `pointerEvents="all"` on their own elements.
  return (
    <svg
      data-testid="acw-studio-edge-overlay"
      className="es-edge-svg"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
    >
      <defs>
        <marker
          id="acw-studio-overlay-arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border3)" />
        </marker>
        <marker
          id="acw-studio-overlay-arrowhead-selected"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const a = positions.get(e.fromId);
        const b = positions.get(e.toId);
        if (a === undefined || b === undefined) return null;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) return null;
        const ux = dx / dist;
        const uy = dy / dist;
        // Retract endpoints so the path starts/ends at the rim of
        // each node's bounding rect rather than its centre. We
        // compute the rim-intersection along the unit vector by
        // bounding by the node's half-width and half-height; this
        // is a cheap approximation that handles the common
        // rectangular cards well enough.
        const halfWa = a.w / 2 + RETRACT;
        const halfHa = a.h / 2 + RETRACT;
        const halfWb = b.w / 2 + RETRACT;
        const halfHb = b.h / 2 + RETRACT;
        const rimA = Math.min(
          ux !== 0 ? halfWa / Math.abs(ux) : Infinity,
          uy !== 0 ? halfHa / Math.abs(uy) : Infinity,
        );
        const rimB = Math.min(
          ux !== 0 ? halfWb / Math.abs(ux) : Infinity,
          uy !== 0 ? halfHb / Math.abs(uy) : Infinity,
        );
        const sx = a.cx + ux * rimA;
        const sy = a.cy + uy * rimA;
        const ex = b.cx - ux * rimB;
        const ey = b.cy - uy * rimB;
        const handle = Math.max(20, Math.min(120, dist * 0.4));
        const path = `M ${sx} ${sy} C ${sx + handle} ${sy} ${ex - handle} ${ey} ${ex} ${ey}`;
        const isSelected = selectedEdgeId === e.id;
        const midX = (sx + ex) / 2;
        const midY = (sy + ey) / 2;
        return (
          <g
            key={e.id}
            data-testid={`acw-studio-edge-${e.id}`}
            data-edge-id={e.id}
            data-edge-selected={isSelected ? "true" : "false"}
          >
            {/* Invisible fat hit-line for easier picking. Pointer
                events explicitly enabled so the overlay's
                `pointer-events: none` wrapper does not swallow
                clicks meant for edges. */}
            <path
              className="es-edge-hit"
              d={path}
              onClick={(ev) => {
                ev.stopPropagation();
                onEdgeClick(e.id);
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onEdgeClick(e.id);
              }}
            />
            <path
              className="es-edge-line"
              data-selected={isSelected ? "true" : "false"}
              d={path}
              markerEnd={`url(#acw-studio-overlay-arrowhead${isSelected ? "-selected" : ""})`}
            />
            {isSelected ? (
              <g
                data-testid={`acw-studio-edge-${e.id}-confirm`}
                transform={`translate(${midX - 28}, ${midY - 9})`}
                style={{ pointerEvents: "all" }}
              >
                <rect
                  x={0}
                  y={0}
                  width={56}
                  height={18}
                  rx={4}
                  ry={4}
                  fill="var(--bg2)"
                  stroke="var(--accent)"
                  strokeWidth={0.6}
                />
                <g
                  data-testid={`acw-studio-edge-${e.id}-delete`}
                  style={{ cursor: "pointer" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEdgeDelete(e.id);
                  }}
                >
                  <rect
                    x={1}
                    y={1}
                    width={36}
                    height={16}
                    rx={3}
                    ry={3}
                    fill="rgba(0,0,0,0)"
                  />
                  <text
                    x={19}
                    y={12}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--danger)"
                    fontFamily="'DM Mono', ui-monospace, monospace"
                  >
                    {DELETE_LABEL}
                  </text>
                </g>
                <line
                  x1={38}
                  y1={3}
                  x2={38}
                  y2={15}
                  stroke="var(--border2)"
                  strokeWidth={0.4}
                />
                <g
                  data-testid={`acw-studio-edge-${e.id}-cancel`}
                  style={{ cursor: "pointer" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEdgeClick(e.id);
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
                    fill="var(--text1)"
                    fontFamily="'DM Mono', ui-monospace, monospace"
                  >
                    {CANCEL_LABEL}
                  </text>
                </g>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

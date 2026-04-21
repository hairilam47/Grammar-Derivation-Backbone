// ACW Track 3 — 2D derived canvas.
//
// Reads only the props passed by the shell (no workspace hook,
// no store import). Computes visibility through the shared
// `enumerateLensVisibility` helper so the 2D and 3D renderers
// surface the same structure. The render is purely structural:
// SVG primitives, neutral palette, no inline styling that would
// imply judgement, status, or semantics beyond containment +
// adjacency.
import { useMemo } from "react";
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
  readonly focusedParentId: string | null;
  readonly testId?: string;
}

export function Track3Canvas2D(props: Track3Canvas2DProps) {
  const { nodes, edges, collapsedIds, focusedParentId } = props;
  const testId = props.testId ?? "track3-canvas-2d";
  const visibility = useMemo(
    () => enumerateLensVisibility(nodes, edges, focusedParentId, collapsedIds),
    [nodes, edges, focusedParentId, collapsedIds],
  );
  const visibleNodes: AcwNode[] = useMemo(() => {
    const visible = new Set(visibility.visibleNodeIds);
    return nodes.filter((n) => visible.has(n.id));
  }, [nodes, visibility]);
  const visibleEdges = visibility.visibleEdges;

  // Compute viewport bounds from visible node positions, with a
  // padded margin so labels do not clip at the boundary.
  const padding = 80;
  const labelHeight = 28;
  const labelWidth = 140;
  const layoutBox = useMemo(() => {
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

  const isEmpty = visibleNodes.length === 0;

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
          width="100%"
          viewBox={`${layoutBox.x} ${layoutBox.y} ${layoutBox.w} ${layoutBox.h}`}
          style={{ height: 360 }}
          data-testid={`${testId}-svg`}
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
          {visibleNodes.map((n) => (
            <g key={n.id} data-testid={`${testId}-node-${n.id}`}>
              <rect
                x={n.x}
                y={n.y}
                width={labelWidth}
                height={labelHeight}
                rx={4}
                ry={4}
                fill={n.type === "Zone" ? "#1e293b" : "#0f172a"}
                stroke={n.type === "Zone" ? "#94a3b8" : "#475569"}
                strokeWidth={1}
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
          ))}
        </svg>
      )}
      <div
        className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-legend`}
      >
        {LEGEND_LABEL}
      </div>
    </div>
  );
}

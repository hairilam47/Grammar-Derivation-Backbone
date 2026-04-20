// ACW lens — System Landscape (TOGAF Application).
//
// Empty system nodes and placeholder connections on the 2D canvas
// primitive. Instructional empty state. No lifecycle, legacy
// labels, or quality indicators.
//
// Drill-down contract: this lens owns its own depth-path state and
// passes a callback into Canvas2D so that any node placed on the
// canvas in a later iteration becomes a clickable affordance for
// stepping into a deeper level of decomposition. The contract is
// wired today against an empty node set so the API surface is
// demonstrably present; clicking is a no-op until nodes exist.
import { useMemo, useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Canvas2D, type Canvas2DNode, type Canvas2DEdge } from "@/components/acw/Canvas2D";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { ACW_ELEMENT_TYPE_LABEL } from "@/acw/acwGrammar";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "System Landscape";
const LENS_LAYER = "TOGAF Application";
const LENS_HINT =
  "Empty 2D canvas. Pan with mouse drag, zoom with mouse wheel. Add systems to begin.";
const EMPTY_HINT = "Add systems to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  EMPTY_HINT,
  ROOT_CRUMB,
  BACK_LABEL,
  DEPTH_LABEL,
]);

// Lens filter for the Application layer: Systems and Components.
// The Application lens shows the application landscape; Zones /
// ComputeNodes belong to the Technology lens (see Deployment).
const APPLICATION_TYPES = new Set(["System", "Component"] as const);

// Auto-position any node that lacks user-set coordinates so the
// Canvas2D primitive (which is render-only and never invents
// arrangement) still has something to display. Deterministic and
// purely positional; conveys no priority or ordering meaning.
function autoPosition(index: number): { x: number; y: number } {
  const cols = 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: 80 + col * 120, y: 60 + row * 80 };
}

export default function SystemLandscape() {
  // Depth path: each entry is a system id the reader has stepped
  // into. An empty array means we are at the root level.
  const [depthPath, setDepthPath] = useState<readonly string[]>([]);
  const workspace = useAcwWorkspace();

  const handleDrillDown = (nodeId: string) => {
    setDepthPath((prev) => [...prev, nodeId]);
  };
  const handleStepOut = () => {
    setDepthPath((prev) => prev.slice(0, -1));
  };

  // Filter nodes for the Application lens; further filter by depth
  // path (only show nodes whose parent matches the current depth
  // frame, OR roots when depthPath is empty).
  const visibleNodes = useMemo(() => {
    const currentParent = depthPath.length === 0 ? null : depthPath[depthPath.length - 1];
    return workspace.structureGraph.nodes
      .filter((n) => APPLICATION_TYPES.has(n.type as "System" | "Component"))
      .filter((n) => n.parentId === currentParent);
  }, [workspace, depthPath]);

  const canvasNodes: Canvas2DNode[] = useMemo(
    () =>
      visibleNodes.map((n, i) => {
        const pos = n.x === 0 && n.y === 0 ? autoPosition(i) : { x: n.x, y: n.y };
        return {
          id: n.id,
          x: pos.x,
          y: pos.y,
          label: `${ACW_ELEMENT_TYPE_LABEL[n.type]}: ${n.label}`,
        };
      }),
    [visibleNodes],
  );

  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const canvasEdges: Canvas2DEdge[] = useMemo(
    () =>
      workspace.structureGraph.edges
        .filter((e) => visibleNodeIds.has(e.fromId) && visibleNodeIds.has(e.toId))
        .map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId })),
    // Recompute when underlying edge or visibility set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.structureGraph.edges, Array.from(visibleNodeIds).join("|")],
  );

  return (
    <WorkspaceShell>
      <Card data-testid="acw-landscape-header">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider">
            {LENS_TITLE}
          </CardTitle>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {LENS_LAYER}
          </p>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {LENS_HINT}
        </CardContent>
      </Card>

      <div
        className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid="acw-landscape-breadcrumb"
      >
        <span>{DEPTH_LABEL}:</span>
        <span data-testid="acw-landscape-breadcrumb-path">
          {[ROOT_CRUMB, ...depthPath].join(" / ")}
        </span>
        {depthPath.length > 0 ? (
          <button
            type="button"
            onClick={handleStepOut}
            className="px-2 py-0.5 border border-border/60 rounded hover:text-primary hover:border-primary/60 transition-colors"
            data-testid="acw-landscape-step-out"
          >
            {BACK_LABEL}
          </button>
        ) : null}
      </div>

      <Canvas2D
        nodes={canvasNodes}
        edges={canvasEdges}
        emptyHint={EMPTY_HINT}
        height={420}
        testId="acw-landscape-canvas"
        onNodeDrillDown={handleDrillDown}
      />

      <LiveStructurePanel
        testIdPrefix="acw-landscape-structure"
        nodeFilter={(n) => APPLICATION_TYPES.has(n.type as "System" | "Component")}
        edgeFilter={(e) => e.kind === "CONNECTS" || e.kind === "INTERFACES_WITH"}
      />
    </WorkspaceShell>
  );
}

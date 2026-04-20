// ACW lens — System Landscape (TOGAF Application).
//
// v2: the lens now hosts the InteractiveCanvas2D primitive, which
// adds drag-to-move (snap-to-grid), drag-to-reparent (validator-
// gated), manual grouping into a Zone container, per-lens
// collapse / expand, nested containment cues, and transient
// alignment guides. The structureGraph schema is unchanged
// (`acw-1.0`); per-lens collapse state lives in the separate
// `acw-view-1.0` document.
//
// Drill-down contract: double-clicking a node descends into it,
// matching the v1 contract. Step-out walks the depth path back.
//
// Empty / instructional vocabulary is asserted against
// ACW_PLACEHOLDER_FORBIDDEN at module load.
import { useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LensCanvas } from "@/components/acw/LensCanvas";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { ACW_ELEMENT_TYPE_LABEL } from "@/acw/acwGrammar";
import { updateNodePosition } from "@/acw/acwStore";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "System Landscape";
const LENS_LAYER = "TOGAF Application";
const LENS_HINT =
  "2D canvas. Pan with mouse drag, zoom with mouse wheel. Drag nodes to position; group selected compute nodes into a Zone; collapse containers to focus.";
const EMPTY_HINT = "Add systems to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";
const LENS_PATH = "/workspace/landscape";

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
// Zones / ComputeNodes belong to the Technology lens (Deployment).
const APPLICATION_TYPES = new Set(["System", "Component"] as const);

// Auto-place any node that lacks user-set coordinates so a freshly
// added node is visible. Pure layout convenience; carries no
// priority or ordering meaning. The auto-place writes back through
// `updateNodePosition` so the next render reads the canonical
// coords from the store and so subsequent drags compose with it.
function autoPosition(index: number): { x: number; y: number } {
  const cols = 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: 80 + col * 144, y: 80 + row * 96 };
}

export default function SystemLandscape() {
  const [depthPath, setDepthPath] = useState<readonly string[]>([]);
  const workspace = useAcwWorkspace();

  const handleDrillDown = (nodeId: string) => {
    setDepthPath((prev) => [...prev, nodeId]);
  };
  const handleStepOut = () => {
    setDepthPath((prev) => prev.slice(0, -1));
  };

  // The Application lens surfaces System + Component across the
  // whole tree so the canvas can render containment cues for
  // Systems whose Components are visible inside them.
  const lensNodes = useMemo(
    () =>
      workspace.structureGraph.nodes.filter((n) =>
        APPLICATION_TYPES.has(n.type as "System" | "Component"),
      ),
    [workspace],
  );

  const focusedParentId =
    depthPath.length === 0 ? null : depthPath[depthPath.length - 1];

  // Auto-place any sibling at the focus level whose stored
  // coordinates are still (0, 0) — the v1 store seeds new nodes at
  // the origin. We write back via the validator-gated mutation so
  // the canonical coords live in the workspace document.
  useEffect(() => {
    const siblings = lensNodes.filter((n) => n.parentId === focusedParentId);
    let i = 0;
    for (const s of siblings) {
      if (s.x === 0 && s.y === 0) {
        const p = autoPosition(i);
        updateNodePosition(s.id, p.x, p.y);
      }
      i += 1;
    }
  }, [lensNodes, focusedParentId]);

  // Edges are filtered to those between any two visible nodes
  // (lens-scoped). The canvas itself decides whether to actually
  // draw an edge based on whether both endpoints are visible at the
  // current depth + collapse state.
  const visibleIds = useMemo(() => new Set(lensNodes.map((n) => n.id)), [lensNodes]);
  const lensEdges = useMemo(
    () =>
      workspace.structureGraph.edges.filter(
        (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId),
      ),
    [workspace, visibleIds],
  );

  // Crumb labels resolve depth ids to readable names.
  const crumbs = useMemo(() => {
    const acc: string[] = [ROOT_CRUMB];
    for (const id of depthPath) {
      const n = workspace.structureGraph.nodes.find((x) => x.id === id);
      acc.push(n ? `${ACW_ELEMENT_TYPE_LABEL[n.type]}: ${n.label}` : id);
    }
    return acc;
  }, [depthPath, workspace]);

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
        <CardContent className="text-xs text-muted-foreground">{LENS_HINT}</CardContent>
      </Card>

      <div
        className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid="acw-landscape-breadcrumb"
      >
        <span>{DEPTH_LABEL}:</span>
        <span data-testid="acw-landscape-breadcrumb-path">{crumbs.join(" / ")}</span>
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

      <LensCanvas
        lensId={LENS_PATH}
        nodes={lensNodes}
        edges={lensEdges}
        focusedParentId={focusedParentId}
        emptyHint={EMPTY_HINT}
        height={460}
        testId="acw-landscape-canvas"
        onDrillDown={handleDrillDown}
        permitContainerType={(t) =>
          APPLICATION_TYPES.has(t as "System" | "Component")
        }
      />

      <LiveStructurePanel
        testIdPrefix="acw-landscape-structure"
        nodeFilter={(n) => APPLICATION_TYPES.has(n.type as "System" | "Component")}
        edgeFilter={(e) => e.kind === "CONNECTS" || e.kind === "INTERFACES_WITH"}
      />
    </WorkspaceShell>
  );
}

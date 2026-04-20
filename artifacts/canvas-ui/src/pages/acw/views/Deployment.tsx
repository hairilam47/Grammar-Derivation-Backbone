// ACW lens — Deployment & Infrastructure (TOGAF Technology).
//
// v2: this lens now hosts the InteractiveCanvas2D primitive, the
// same one the System Landscape uses. The Technology lens is the
// natural home for the manual-grouping affordance: at the
// workspace root the user can scatter ComputeNodes (a v2 grammar
// widening permits ComputeNode at root, additive only) and then
// group them into a Zone via the canvas's Group action — the
// validator owns whether that materialisation is well-formed.
//
// Inside a Zone the lens surfaces ComputeNodes; inside a
// ComputeNode it surfaces nested Systems. The 3D primitive moves
// to v3; for v2 the 2D canvas is the deterministic visual surface
// across both lenses.
//
// The static empty zones / slots shown by the v1 placeholder card
// have been retired so the lens has a single source of truth for
// what the user has authored.
import { useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LensCanvas } from "@/components/acw/LensCanvas";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { ACW_ELEMENT_TYPE_LABEL } from "@/acw/acwGrammar";
import { updateNodePosition } from "@/acw/acwStore";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Deployment & Infrastructure";
const LENS_LAYER = "TOGAF Technology";
const LENS_HINT =
  "2D canvas. Pan with Alt-drag or middle button, zoom with the mouse wheel. Drag the background to select an area; group selected siblings into a permitted container.";
const EMPTY_HINT = "Add zones or compute nodes to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";
const LENS_PATH = "/workspace/deployment";

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  EMPTY_HINT,
  ROOT_CRUMB,
  BACK_LABEL,
  DEPTH_LABEL,
]);

// Lens filter for the Technology layer: Zones, ComputeNodes, and
// any System that has been nested inside a ComputeNode (the v1
// grammar permits this — it's how a Technology lens sees an
// Application element placed onto infrastructure). Bare-root
// Systems remain owned by the Application lens.
const TECHNOLOGY_TYPES = new Set(["Zone", "ComputeNode", "System"] as const);

function autoPosition(index: number): { x: number; y: number } {
  const cols = 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: 80 + col * 144, y: 80 + row * 96 };
}

export default function Deployment() {
  const [depthPath, setDepthPath] = useState<readonly string[]>([]);
  const workspace = useAcwWorkspace();

  const handleDrillDown = (nodeId: string) => {
    setDepthPath((prev) => [...prev, nodeId]);
  };
  const handleStepOut = () => {
    setDepthPath((prev) => prev.slice(0, -1));
  };

  const lensNodes = useMemo(
    () =>
      workspace.structureGraph.nodes.filter((n) => {
        if (!TECHNOLOGY_TYPES.has(n.type as "Zone" | "ComputeNode" | "System")) {
          return false;
        }
        // Bare-root Systems belong to the Application lens.
        if (n.type === "System" && n.parentId === null) return false;
        return true;
      }),
    [workspace],
  );

  const focusedParentId =
    depthPath.length === 0 ? null : depthPath[depthPath.length - 1];

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

  const visibleIds = useMemo(() => new Set(lensNodes.map((n) => n.id)), [lensNodes]);
  const lensEdges = useMemo(
    () =>
      workspace.structureGraph.edges.filter(
        (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId),
      ),
    [workspace, visibleIds],
  );

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
      <Card data-testid="acw-deployment-header">
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
        data-testid="acw-deployment-breadcrumb"
      >
        <span>{DEPTH_LABEL}:</span>
        <span data-testid="acw-deployment-breadcrumb-path">{crumbs.join(" / ")}</span>
        {depthPath.length > 0 ? (
          <button
            type="button"
            onClick={handleStepOut}
            className="px-2 py-0.5 border border-border/60 rounded hover:text-primary hover:border-primary/60 transition-colors"
            data-testid="acw-deployment-step-out"
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
        testId="acw-deployment-canvas"
        onDrillDown={handleDrillDown}
        permitContainerType={(t) =>
          TECHNOLOGY_TYPES.has(t as "Zone" | "ComputeNode" | "System")
        }
      />

      <LiveStructurePanel
        testIdPrefix="acw-deployment-structure"
        nodeFilter={(n) => {
          if (n.type === "Zone" || n.type === "ComputeNode") return true;
          return n.type === "System" && n.parentId !== null;
        }}
        edgeFilter={(e) => e.kind === "CONNECTS"}
      />
    </WorkspaceShell>
  );
}

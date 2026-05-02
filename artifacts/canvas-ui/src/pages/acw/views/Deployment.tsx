// ACW lens — Deployment & Infrastructure (TOGAF Technology).
//
// v2: this lens hosts the InteractiveCanvas2D primitive, the same
// one the System Landscape uses. The Technology lens is the
// natural home for the manual-grouping affordance: at the
// workspace root the user can scatter ComputeNodes and group them
// into a Zone via the canvas's Group action. Inside a Zone the
// lens surfaces ComputeNodes; inside a ComputeNode it surfaces
// nested Systems.
//
// Task #86 (authored fullscreen lenses): the lens now runs in
// either a fullscreen layout — `LensCanvas` filling the viewport
// with all non-canvas UI floating in a `WorkspaceLensFloatingOverlay`
// — or the prior inline layout. The choice is per-lens, persisted
// via the `acw-workspace-viewprefs-1.0` slice. The Escape key
// toggles fullscreen in either direction (subject to the editable-
// target + defaultPrevented suppression discipline below); the
// floating overlay also exposes an explicit "Exit full-screen"
// control, and the inline header exposes an "Enter full-page
// canvas" button. The pre-Task-#86 inline layout is preserved as
// the `isFullscreen === false` branch.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Maximize2 } from "lucide-react";
import { WorkspaceShell } from "../WorkspaceShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LensCanvas } from "@/components/acw/LensCanvas";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { AuthoringPanel } from "@/components/acw/AuthoringPanel";
import { WorkspaceLensFloatingOverlay } from "@/components/acw/WorkspaceLensFloatingOverlay";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { ACW_ELEMENT_TYPE_LABEL } from "@/acw/acwGrammar";
import { updateNodePosition } from "@/acw/acwStore";
import { isDeploymentNode } from "@/acw/lens/acwLensFilters";
import {
  getDoc as getViewPrefsDoc,
  getLensPrefs,
  setLensFullscreen,
  subscribePrefs,
} from "@/acw/acwWorkspaceViewPrefs";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Deployment & Infrastructure";
const LENS_LAYER = "Technology";
const LENS_HINT =
  "2D canvas. Pan with Alt-drag or middle button, zoom with the mouse wheel. Drag the background to select an area; group selected siblings into a permitted container.";
const EMPTY_HINT = "Add zones or compute nodes to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";
const ENTER_FULLSCREEN_LABEL = "Enter full-page canvas";
const LENS_PATH = "/workspace/deployment";

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  EMPTY_HINT,
  ROOT_CRUMB,
  BACK_LABEL,
  DEPTH_LABEL,
  ENTER_FULLSCREEN_LABEL,
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

function useViewPrefsDoc(): unknown {
  return useSyncExternalStore(
    subscribePrefs,
    getViewPrefsDoc,
    getViewPrefsDoc,
  );
}

export default function Deployment() {
  useViewPrefsDoc();
  const isFullscreen = getLensPrefs(LENS_PATH).isFullscreen;
  const [depthPath, setDepthPath] = useState<readonly string[]>([]);
  const workspace = useAcwWorkspace();

  const handleDrillDown = useCallback((nodeId: string) => {
    setDepthPath((prev) => [...prev, nodeId]);
  }, []);
  const handleStepOut = useCallback(() => {
    setDepthPath((prev) => prev.slice(0, -1));
  }, []);
  const handleEnterFullscreen = useCallback(
    () => setLensFullscreen(LENS_PATH, true),
    [],
  );
  const handleExitFullscreen = useCallback(
    () => setLensFullscreen(LENS_PATH, false),
    [],
  );

  // Escape-key shortcut: toggles fullscreen in either direction.
  // Mirrors the editable-target + defaultPrevented suppression
  // discipline applied in System Landscape and in Track 3.
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      if (isEditableTarget(ev.target)) return;
      if (ev.defaultPrevented) return;
      setLensFullscreen(LENS_PATH, !isFullscreen);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // EAStudio Phase 4 (Task #170) — admission delegates to
  // `isDeploymentNode` from `@/acw/lens/acwLensFilters`. The shared
  // filter honours `domainTag` (a node tagged `technology` is
  // admitted regardless of element type; tags `business` /
  // `application` / `external` / `operations` are excluded) and
  // preserves the legacy "bare-root Systems belong to the
  // Application lens" rule.
  const lensNodes = useMemo(
    () => workspace.structureGraph.nodes.filter(isDeploymentNode),
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

  if (isFullscreen) {
    return (
      <WorkspaceShell hideShellChrome>
        {/* Locked deviation mirroring Track 3 + the System
            Landscape fullscreen z-index decision. */}
        <div
          className="fixed inset-0 z-0 bg-background"
          data-testid="acw-deployment-fullscreen-canvas"
        >
          <LensCanvas
            key={`deployment-fullscreen:${LENS_PATH}`}
            lensId={LENS_PATH}
            nodes={lensNodes}
            edges={lensEdges}
            focusedParentId={focusedParentId}
            emptyHint={EMPTY_HINT}
            height="100%"
            testId="acw-deployment-canvas"
            onDrillDown={handleDrillDown}
            permitContainerType={(t) =>
              TECHNOLOGY_TYPES.has(t as "Zone" | "ComputeNode" | "System")
            }
          />
          <WorkspaceLensFloatingOverlay
            testIdPrefix="acw-deployment-overlay"
            lensName={LENS_TITLE}
            lensLayer={LENS_LAYER}
            authoringSlot={<AuthoringPanel />}
            structureSlot={
              <LiveStructurePanel
                testIdPrefix="acw-deployment-structure"
                nodeFilter={isDeploymentNode}
                edgeFilter={(e) => e.kind === "CONNECTS"}
              />
            }
            bottomCenterSlot={
              <div
                className="inline-flex items-center gap-2"
                data-testid="acw-deployment-overlay-breadcrumb"
              >
                <span>{DEPTH_LABEL}:</span>
                <span
                  className="font-mono normal-case tracking-normal text-muted-foreground/80 truncate max-w-[40vw]"
                  data-testid="acw-deployment-overlay-breadcrumb-path"
                  title={crumbs.join(" / ")}
                >
                  {crumbs.join(" / ")}
                </span>
                {depthPath.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleStepOut}
                    className="px-1.5 py-0.5 border border-border/60 rounded text-[10px] hover:text-primary hover:border-primary/60 transition-colors"
                    data-testid="acw-deployment-overlay-step-out"
                  >
                    {BACK_LABEL}
                  </button>
                ) : null}
              </div>
            }
            onExitFullscreen={handleExitFullscreen}
          />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <Card data-testid="acw-deployment-header">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                {LENS_TITLE}
              </CardTitle>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {LENS_LAYER}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={handleEnterFullscreen}
              data-testid="acw-deployment-enter-fullscreen"
            >
              <Maximize2 className="w-3 h-3 mr-1" />
              {ENTER_FULLSCREEN_LABEL}
            </Button>
          </div>
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
        key={`deployment-inline:${LENS_PATH}`}
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
        nodeFilter={isDeploymentNode}
        edgeFilter={(e) => e.kind === "CONNECTS"}
      />
    </WorkspaceShell>
  );
}

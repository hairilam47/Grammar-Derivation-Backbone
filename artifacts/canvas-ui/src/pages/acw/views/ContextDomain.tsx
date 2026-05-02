// ACW lens — Context & Domain (TOGAF Business, structural only).
//
// EAStudio Phase 4 (Task #170) — the lens is now a live filtered
// view over the EAStudio workspace. The placeholder card grid was
// replaced by `LensCanvas` (the same primitive the System Landscape
// and Deployment lenses use) wired to the Business filter from
// `acwLensFilters`. The canvas surfaces BusinessEntity nodes plus
// Zone tiers under them and any node the user has tagged
// `business`. No new stores; pure UI filtering.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Maximize2 } from "lucide-react";
import { WorkspaceShell } from "../WorkspaceShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LensCanvas } from "@/components/acw/LensCanvas";
import { LayersPanel } from "@/components/acw/studio/LayersPanel";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { AuthoringPanel } from "@/components/acw/AuthoringPanel";
import { WorkspaceLensFloatingOverlay } from "@/components/acw/WorkspaceLensFloatingOverlay";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { ACW_ELEMENT_TYPE_LABEL } from "@/acw/acwGrammar";
import { updateNodePosition } from "@/acw/acwStore";
import {
  getDoc as getViewPrefsDoc,
  getLensPrefs,
  setLensFullscreen,
  subscribePrefs,
} from "@/acw/acwWorkspaceViewPrefs";
import {
  edgesWithinVisibleNodes,
  isContextDomainNode,
} from "@/acw/lens/acwLensFilters";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Context & Domain";
const LENS_LAYER = "Business — structural only";
const LENS_HINT =
  "Business chain. Pan with mouse drag, zoom with mouse wheel. Drag domain nodes to position; group selected siblings into a permitted container.";
const EMPTY_HINT = "Add domain entities to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";
const ENTER_FULLSCREEN_LABEL = "Enter full-page canvas";
const LENS_PATH = "/workspace/context";

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

export default function ContextDomain() {
  useViewPrefsDoc();
  const isFullscreen = getLensPrefs(LENS_PATH).isFullscreen;
  const [depthPath, setDepthPath] = useState<readonly string[]>([]);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
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
  // discipline applied in System Landscape and Deployment.
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

  const lensNodes = useMemo(
    () => workspace.structureGraph.nodes.filter(isContextDomainNode),
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

  const visibleIds = useMemo(
    () => new Set(lensNodes.map((n) => n.id)),
    [lensNodes],
  );
  const lensEdges = useMemo(
    () => edgesWithinVisibleNodes(workspace.structureGraph.edges, visibleIds),
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
        <div
          className="fixed inset-0 z-0 bg-background"
          data-testid="acw-context-fullscreen-canvas"
        >
          <LensCanvas
            key={`context-fullscreen:${LENS_PATH}`}
            lensId={LENS_PATH}
            nodes={lensNodes}
            edges={lensEdges}
            focusedParentId={focusedParentId}
            emptyHint={EMPTY_HINT}
            height="100%"
            testId="acw-context-canvas"
            onDrillDown={handleDrillDown}
            layersPanelOpen={layersPanelOpen}
            onLayersToggle={() => setLayersPanelOpen((v) => !v)}
          />
          {layersPanelOpen ? <LayersPanel lensId={LENS_PATH} /> : null}
          <WorkspaceLensFloatingOverlay
            testIdPrefix="acw-context-overlay"
            lensName={LENS_TITLE}
            lensLayer={LENS_LAYER}
            authoringSlot={<AuthoringPanel />}
            structureSlot={
              <LiveStructurePanel
                testIdPrefix="acw-context-structure"
                nodeFilter={isContextDomainNode}
              />
            }
            bottomCenterSlot={
              <div
                className="inline-flex items-center gap-2"
                data-testid="acw-context-overlay-breadcrumb"
              >
                <span>{DEPTH_LABEL}:</span>
                <span
                  className="font-mono normal-case tracking-normal text-muted-foreground/80 truncate max-w-[40vw]"
                  data-testid="acw-context-overlay-breadcrumb-path"
                  title={crumbs.join(" / ")}
                >
                  {crumbs.join(" / ")}
                </span>
                {depthPath.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleStepOut}
                    className="px-1.5 py-0.5 border border-border/60 rounded text-[10px] hover:text-primary hover:border-primary/60 transition-colors"
                    data-testid="acw-context-overlay-step-out"
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
      <Card data-testid="acw-context-header">
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
              data-testid="acw-context-enter-fullscreen"
            >
              <Maximize2 className="w-3 h-3 mr-1" />
              {ENTER_FULLSCREEN_LABEL}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {LENS_HINT}
        </CardContent>
      </Card>

      <div
        className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid="acw-context-breadcrumb"
      >
        <span>{DEPTH_LABEL}:</span>
        <span data-testid="acw-context-breadcrumb-path">
          {crumbs.join(" / ")}
        </span>
        {depthPath.length > 0 ? (
          <button
            type="button"
            onClick={handleStepOut}
            className="px-2 py-0.5 border border-border/60 rounded hover:text-primary hover:border-primary/60 transition-colors"
            data-testid="acw-context-step-out"
          >
            {BACK_LABEL}
          </button>
        ) : null}
      </div>

      <LensCanvas
        key={`context-inline:${LENS_PATH}`}
        lensId={LENS_PATH}
        nodes={lensNodes}
        edges={lensEdges}
        focusedParentId={focusedParentId}
        emptyHint={EMPTY_HINT}
        height={460}
        testId="acw-context-canvas"
        onDrillDown={handleDrillDown}
        layersPanelOpen={layersPanelOpen}
        onLayersToggle={() => setLayersPanelOpen((v) => !v)}
      />
      {layersPanelOpen ? <LayersPanel lensId={LENS_PATH} /> : null}

      <LiveStructurePanel
        testIdPrefix="acw-context-structure"
        nodeFilter={isContextDomainNode}
      />
    </WorkspaceShell>
  );
}

// ACW lens — Integration (Application + Data + cross-boundary).
//
// EAStudio Phase 4 (Task #170) — the lens is now a live filtered
// view over the EAStudio workspace. The placeholder card grid was
// replaced by `LensCanvas` (the same primitive the System Landscape
// and Deployment lenses use) wired to the Integration filter from
// `acwLensFilters`. Per the Phase 4 spec the lens is narrowed to
// **cross-domain `CONNECTS` edges** plus any node the user has
// tagged `external`. Same-domain `CONNECTS` and the
// `INTERFACES_WITH` / `DATA_FLOW` edge kinds belong to other
// lenses (Landscape / Operations) and are deliberately excluded
// here so the integration view focuses on cross-boundary
// connections only.
//
// "exchange" is used throughout in place of "flow" because "flow"
// embeds the substring "low", which is banned by the
// responsibility-lens tier the ACW vocabulary transitively
// inherits.
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
import { updateNodePosition, type AcwEdge, type AcwNode } from "@/acw/acwStore";
import {
  getDoc as getViewPrefsDoc,
  getLensPrefs,
  setLensFullscreen,
  subscribePrefs,
} from "@/acw/acwWorkspaceViewPrefs";
import {
  isIntegrationEdge,
  isIntegrationNode,
} from "@/acw/lens/acwLensFilters";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Integration";
const LENS_LAYER = "Application + Data";
const LENS_HINT =
  "Cross-domain integration canvas. Pan with mouse drag, zoom with mouse wheel. Surfaces external boundary nodes and cross-domain CONNECTS edges.";
const EMPTY_HINT = "Add cross-domain connections or external nodes to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";
const ENTER_FULLSCREEN_LABEL = "Enter full-page canvas";
const LENS_PATH = "/workspace/integration";

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

export default function Integration() {
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

  // Integration lens — Phase 4 spec (Step 6):
  //   - surface every `domainTag: 'external'` node;
  //   - surface every node touched by a cross-domain CONNECTS edge
  //     (different `domainTag` on each end, including `external`);
  //   - surface those cross-domain CONNECTS edges themselves.
  const baseLensNodes = useMemo(
    () => workspace.structureGraph.nodes.filter(isIntegrationNode),
    [workspace],
  );

  const nodeById = useMemo(() => {
    const m = new Map<string, AcwNode>();
    for (const n of workspace.structureGraph.nodes) m.set(n.id, n);
    return m;
  }, [workspace]);

  const lensEdges = useMemo<readonly AcwEdge[]>(() => {
    const out: AcwEdge[] = [];
    for (const e of workspace.structureGraph.edges) {
      const from = nodeById.get(e.fromId);
      const to = nodeById.get(e.toId);
      if (from === undefined || to === undefined) continue;
      if (isIntegrationEdge(e, from.domainTag, to.domainTag)) {
        out.push(e);
      }
    }
    return out;
  }, [workspace, nodeById]);

  const lensNodes = useMemo<readonly AcwNode[]>(() => {
    const ids = new Set(baseLensNodes.map((n) => n.id));
    for (const e of lensEdges) {
      ids.add(e.fromId);
      ids.add(e.toId);
    }
    const out: AcwNode[] = [];
    for (const n of workspace.structureGraph.nodes) {
      if (ids.has(n.id)) out.push(n);
    }
    return out;
  }, [workspace, baseLensNodes, lensEdges]);

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

  const crumbs = useMemo(() => {
    const acc: string[] = [ROOT_CRUMB];
    for (const id of depthPath) {
      const n = workspace.structureGraph.nodes.find((x) => x.id === id);
      acc.push(n ? `${ACW_ELEMENT_TYPE_LABEL[n.type]}: ${n.label}` : id);
    }
    return acc;
  }, [depthPath, workspace]);

  // LiveStructurePanel filters — node predicate mirrors the
  // expanded `lensNodes` set; edge predicate mirrors the same
  // `isIntegrationEdge` rule by reading domain tags off the
  // workspace graph.
  const visibleIdSet = useMemo(
    () => new Set(lensNodes.map((n) => n.id)),
    [lensNodes],
  );
  const liveNodeFilter = useCallback(
    (n: AcwNode) => visibleIdSet.has(n.id),
    [visibleIdSet],
  );
  const liveEdgeFilter = useCallback(
    (e: AcwEdge) => {
      const from = nodeById.get(e.fromId);
      const to = nodeById.get(e.toId);
      if (from === undefined || to === undefined) return false;
      return isIntegrationEdge(e, from.domainTag, to.domainTag);
    },
    [nodeById],
  );

  if (isFullscreen) {
    return (
      <WorkspaceShell hideShellChrome>
        <div
          className="fixed inset-0 z-0 bg-background"
          data-testid="acw-integration-fullscreen-canvas"
        >
          <LensCanvas
            key={`integration-fullscreen:${LENS_PATH}`}
            lensId={LENS_PATH}
            nodes={lensNodes}
            edges={lensEdges}
            focusedParentId={focusedParentId}
            emptyHint={EMPTY_HINT}
            height="100%"
            testId="acw-integration-canvas"
            onDrillDown={handleDrillDown}
            layersPanelOpen={layersPanelOpen}
            onLayersToggle={() => setLayersPanelOpen((v) => !v)}
          />
          {layersPanelOpen ? <LayersPanel lensId={LENS_PATH} /> : null}
          <WorkspaceLensFloatingOverlay
            testIdPrefix="acw-integration-overlay"
            lensName={LENS_TITLE}
            lensLayer={LENS_LAYER}
            authoringSlot={<AuthoringPanel />}
            structureSlot={
              <LiveStructurePanel
                testIdPrefix="acw-integration-structure"
                nodeFilter={liveNodeFilter}
                edgeFilter={liveEdgeFilter}
              />
            }
            bottomCenterSlot={
              <div
                className="inline-flex items-center gap-2"
                data-testid="acw-integration-overlay-breadcrumb"
              >
                <span>{DEPTH_LABEL}:</span>
                <span
                  className="font-mono normal-case tracking-normal text-muted-foreground/80 truncate max-w-[40vw]"
                  data-testid="acw-integration-overlay-breadcrumb-path"
                  title={crumbs.join(" / ")}
                >
                  {crumbs.join(" / ")}
                </span>
                {depthPath.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleStepOut}
                    className="px-1.5 py-0.5 border border-border/60 rounded text-[10px] hover:text-primary hover:border-primary/60 transition-colors"
                    data-testid="acw-integration-overlay-step-out"
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
      <Card data-testid="acw-integration-header">
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
              data-testid="acw-integration-enter-fullscreen"
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
        data-testid="acw-integration-breadcrumb"
      >
        <span>{DEPTH_LABEL}:</span>
        <span data-testid="acw-integration-breadcrumb-path">
          {crumbs.join(" / ")}
        </span>
        {depthPath.length > 0 ? (
          <button
            type="button"
            onClick={handleStepOut}
            className="px-2 py-0.5 border border-border/60 rounded hover:text-primary hover:border-primary/60 transition-colors"
            data-testid="acw-integration-step-out"
          >
            {BACK_LABEL}
          </button>
        ) : null}
      </div>

      <LensCanvas
        key={`integration-inline:${LENS_PATH}`}
        lensId={LENS_PATH}
        nodes={lensNodes}
        edges={lensEdges}
        focusedParentId={focusedParentId}
        emptyHint={EMPTY_HINT}
        height={460}
        testId="acw-integration-canvas"
        onDrillDown={handleDrillDown}
        layersPanelOpen={layersPanelOpen}
        onLayersToggle={() => setLayersPanelOpen((v) => !v)}
      />
      {layersPanelOpen ? <LayersPanel lensId={LENS_PATH} /> : null}

      <LiveStructurePanel
        testIdPrefix="acw-integration-structure"
        nodeFilter={liveNodeFilter}
        edgeFilter={liveEdgeFilter}
      />
    </WorkspaceShell>
  );
}

// ACW Track 3 — derived view shell scoped to a standalone
// architecture (Phase 3, Task #80; Phase 4, Task #81).
//
// Loads the architecture's CTAD state via `exportArchitectureState`
// and drives the DiagramSpec compiler + ELK layout pipeline (via
// `track3DiagramAdapter`) to produce a list of positioned diagrams
// — one per architecture stratum — that the renderers stack along
// the Z axis. Layer / perspective controls live here; both
// renderers receive the SAME `positionedDiagrams + hiddenSections`
// so visibility cannot diverge between them.
//
// Phase 4 (Task #81): the canvas now defaults to a full-page
// layout (`fixed inset-0 z-30`) with a `Track3FloatingOverlay`
// rendering all controls as absolutely-positioned quadrants. The
// `isFullscreen` preference is per-architecture and persisted
// via the v1.1 view-prefs schema. Pressing `Escape` toggles
// fullscreen off; an explicit "Exit full-screen" button does the
// same. The pre-Phase-4 inline layout is preserved as the
// `isFullscreen === false` branch so users who prefer the embedded
// view can keep it.
//
// Layout is async because ELK is async; the shell carries the
// positioned-diagrams in state and re-runs the pipeline only when
// the architecture state changes. Layer-toggle and perspective
// changes do NOT re-run ELK — they are passed straight through to
// the renderers as filter sets.
//
// The shell remains strictly read-only on every store: it never
// mutates the CTAD architecture nor (and this is the new Phase 3
// constraint) does it import the portfolio store at all. The only
// mutable storage Track 3 owns is `acw.track3.viewprefs.v1`,
// written through `track3ViewPrefs`.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRoute, Link } from "wouter";
import { Layers, Maximize2, RefreshCcw } from "lucide-react";
import {
  exportArchitectureState,
  type CtadArchitectureStateExport,
} from "@/ctad/ctadStore";
import { GlobalNav } from "@/components/governance/GlobalNav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";
import {
  compileTrack3Specs,
  layoutTrack3Specs,
} from "@/acw/track3/track3DiagramAdapter";
import type { PositionedDiagram } from "@workspace/diagram-layout";
import {
  TRACK3_LAYERS,
  type Track3Layer,
  type Track3Perspective,
} from "@/acw/track3/track3Types";
import { TRACK3_LAYER_LABEL } from "@/acw/track3/track3LabelRegistry";
import {
  getArchitecturePrefs,
  getDoc as getViewPrefsDoc,
  setArchitectureViewMode,
  setArchitecturePerspective,
  toggleArchitectureLayerHidden,
  setArchitectureCamera,
  setArchitectureFullscreen,
  subscribePrefs,
  type Track3ViewMode,
} from "@/acw/track3/track3ViewPrefs";
import { Track3Canvas2D } from "@/components/acw/track3/Track3Canvas2D";
import { Track3Canvas3D } from "@/components/acw/track3/Track3Canvas3D";
import {
  Track3FloatingOverlay,
  type Track3StratumIndicatorEntry,
} from "@/components/acw/track3/Track3FloatingOverlay";
import { isolateAroundNode } from "@/acw/track3/track3FocusIsolation";
import type { AcwNode, AcwEdge } from "@/acw/acwLensStructure";

const LABELS = {
  brandLabel: "Architecture Decision Canvas",
  pageTitle: "Derived structural view",
  pageSubtitle:
    "A structural diagram derived from the architecture's technology selections. The diagram is exploratory and reflects only what is selected in the architecture workspace.",
  bindingHeading: "Architecture (read-only)",
  bindingHint:
    "These fields belong to the architecture workspace. The derived view reads them but never edits them.",
  fieldName: "Architecture",
  fieldArchitectureId: "Architecture id",
  fieldEnvironments: "Environments",
  diagramHeading: "Derived diagram",
  diagramHint:
    "The diagram is derived from the architecture state at the moment this view was opened or last refreshed. It is not persisted; use \"Refresh from architecture\" to pick up edits made elsewhere.",
  bindingNotFoundHeading: "Architecture not found",
  bindingNotFoundBody:
    "No architecture matches this id. Return to the entry list to pick a different one.",
  backToEntry: "Back to derived entry",
  openArchitecture: "Open architecture workspace",
  refreshFromArch: "Refresh from architecture",
  inlineNote:
    "This view is exploratory and derived. It does not form or otherwise act on a decision.",
  zoomHint:
    "Drag to rotate, right-drag to pan, scroll to zoom. Camera position persists per architecture.",
  layoutPending: "Computing layout…",
  enterFullscreen: "Enter full-page canvas",
  exitFullscreen: "Exit full-screen",
  fullscreenPlaceholderHeading: "Full-page canvas active",
  fullscreenPlaceholderBody:
    "The architecture canvas is showing in full-page mode. Press Esc or use the floating exit control to return here.",
} as const;

assertAllAcwTrack3Language(Object.values(LABELS));

const INLINE_CONTROL_LABELS = [
  "View controls",
  "Layer and perspective choices are visual only; they do not change the underlying selections.",
  "Mode",
  "Perspective",
  "Layers",
  "All layers",
  "Infrastructure-centric",
  "Application-centric",
  "Integration-centric",
  "Focused on",
  "Clear focus",
  "2D",
  "3D",
] as const;
assertAllAcwTrack3Language([...INLINE_CONTROL_LABELS]);

function formatLayerLabel(l: Track3Layer): string {
  switch (l) {
    case "infrastructure":
      return TRACK3_LAYER_LABEL.infrastructure;
    case "application":
      return TRACK3_LAYER_LABEL.application;
    case "integration":
      return TRACK3_LAYER_LABEL.integration;
    case "crossCutting":
      return TRACK3_LAYER_LABEL.crossCutting;
    case "ops":
      return TRACK3_LAYER_LABEL.ops;
  }
}

function useViewPrefsDoc(): unknown {
  return useSyncExternalStore(
    subscribePrefs,
    getViewPrefsDoc,
    getViewPrefsDoc,
  );
}

export default function Track3Shell() {
  const [match, params] = useRoute<{ architectureId: string }>(
    "/acw/derived/arch/:architectureId",
  );
  const architectureId =
    match && params ? decodeURIComponent(params.architectureId) : "";
  const [refreshTick, setRefreshTick] = useState(0);
  const archState = useMemo<CtadArchitectureStateExport | null>(() => {
    if (!architectureId) return null;
    return exportArchitectureState(architectureId);
    // refreshTick intentionally invalidates the memo so the
    // "Refresh from architecture" button picks up edits made in
    // another tab / route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [architectureId, refreshTick]);

  if (!match || !params) return null;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Layers className="w-5 h-5" />
            <span
              className="font-bold tracking-tight text-sm uppercase"
              data-testid="track3-brand"
            >
              {LABELS.brandLabel}
            </span>
          </div>
          <GlobalNav />
        </div>
      </header>

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1" data-testid="track3-shell-heading">
          <h1 className="text-xl font-bold tracking-tight">
            {LABELS.pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground">
            {LABELS.pageSubtitle}
          </p>
        </div>

        {archState === null ? (
          <Card data-testid="track3-shell-binding-missing">
            <CardHeader>
              <CardTitle className="text-base">
                {LABELS.bindingNotFoundHeading}
              </CardTitle>
              <CardDescription className="text-xs">
                {LABELS.bindingNotFoundBody}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/acw/derived">
                <Button variant="outline" size="sm" data-testid="track3-shell-back-to-entry">
                  {LABELS.backToEntry}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <BoundShell
            architectureId={architectureId}
            archState={archState}
            onRefresh={() => setRefreshTick((t) => t + 1)}
          />
        )}
      </main>
    </div>
  );
}

function BoundShell({
  architectureId,
  archState,
  onRefresh,
}: {
  architectureId: string;
  archState: CtadArchitectureStateExport;
  onRefresh: () => void;
}) {
  useViewPrefsDoc();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ---- DiagramSpec compile + ELK layout (async) -----------------
  // Compile is sync and produces the spec list; layout is async.
  // We re-run BOTH only when the architecture state changes.
  // Layer-toggle and perspective changes do NOT trigger this
  // effect — they read from positioned-diagrams already in state
  // and apply a visibility-only filter at render time.
  const specs = useMemo(() => compileTrack3Specs(archState), [archState]);
  const [positionedDiagrams, setPositionedDiagrams] = useState<
    readonly PositionedDiagram[]
  >([]);
  const [layoutPending, setLayoutPending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLayoutPending(true);
    layoutTrack3Specs(specs).then(
      (pd) => {
        if (cancelled) return;
        setPositionedDiagrams(pd);
        setLayoutPending(false);
      },
      (err) => {
        if (cancelled) return;
        console.error("[track3-shell] layout failed", err);
        setPositionedDiagrams([]);
        setLayoutPending(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [specs]);

  const prefs = getArchitecturePrefs(architectureId);

  // Translate layer-toggle (CTAD layer ids) and perspective into
  // a single hidden-sections set passed to the renderers.
  const hiddenSections = useMemo(() => {
    const out = new Set<string>(prefs.hiddenLayers);
    if (prefs.perspective !== "all") {
      const focusLayer: Track3Layer | null =
        prefs.perspective === "infraCentric"
          ? "infrastructure"
          : prefs.perspective === "appCentric"
            ? "application"
            : prefs.perspective === "integrationCentric"
              ? "integration"
              : null;
      if (focusLayer !== null) {
        for (const l of TRACK3_LAYERS) {
          if (l !== focusLayer && l !== "crossCutting") out.add(l);
        }
      }
    }
    return out;
  }, [prefs.hiddenLayers, prefs.perspective]);

  const isolatedKeptIds = useMemo<ReadonlySet<string> | null>(() => {
    if (selectedNodeId === null) return null;
    const acwNodes: AcwNode[] = [];
    const acwEdges: AcwEdge[] = [];
    for (const pd of positionedDiagrams) {
      for (const n of pd.nodes) {
        acwNodes.push({
          id: n.id,
          type: n.parentId === null ? "Zone" : "Component",
          parentId: n.parentId,
          label: n.label,
          x: n.x,
          y: n.y,
        });
      }
      for (const e of pd.edges) {
        acwEdges.push({
          id: e.id,
          kind: "CONNECTS",
          fromId: e.from,
          toId: e.to,
        });
      }
    }
    const result = isolateAroundNode(acwNodes, acwEdges, selectedNodeId);
    if (result.nodes === acwNodes) return null;
    return new Set(result.nodes.map((n) => n.id));
  }, [selectedNodeId, positionedDiagrams]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);
  const handleClearFocus = useCallback(() => setSelectedNodeId(null), []);
  const handleCameraChange = useCallback(
    (cameraX: number, cameraY: number, cameraZoom: number) => {
      setArchitectureCamera(architectureId, cameraX, cameraY, cameraZoom);
    },
    [architectureId],
  );
  const handleSetViewMode = useCallback(
    (mode: Track3ViewMode) => setArchitectureViewMode(architectureId, mode),
    [architectureId],
  );
  const handleSetPerspective = useCallback(
    (p: Track3Perspective) => setArchitecturePerspective(architectureId, p),
    [architectureId],
  );
  const handleToggleLayer = useCallback(
    (layerId: string) =>
      toggleArchitectureLayerHidden(architectureId, layerId),
    [architectureId],
  );
  const handleEnterFullscreen = useCallback(
    () => setArchitectureFullscreen(architectureId, true),
    [architectureId],
  );
  const handleExitFullscreen = useCallback(
    () => setArchitectureFullscreen(architectureId, false),
    [architectureId],
  );

  // Escape-key shortcut: toggles fullscreen on and off. We
  // suppress the toggle while focus is inside an editable
  // element (input / textarea / contentEditable / select) so
  // pressing Escape to dismiss an open browser autofill or
  // dropdown does not accidentally flip the canvas mode.
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
      ev.preventDefault();
      setArchitectureFullscreen(architectureId, !prefs.isFullscreen);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [architectureId, prefs.isFullscreen]);

  // Stratum indicator: derived from the same positioned-diagrams
  // the renderers consume. Filtered through `hiddenSections` so
  // the indicator always reflects what is actually on-screen.
  // Order is preserved (DiagramSpec compile already orders by
  // `STRATUM_INDEX`).
  const stratumIndicator = useMemo<readonly Track3StratumIndicatorEntry[]>(() => {
    const out: Track3StratumIndicatorEntry[] = [];
    for (const pd of positionedDiagrams) {
      if (hiddenSections.has(pd.stratum)) continue;
      const visibleNodeCount =
        isolatedKeptIds === null
          ? pd.nodes.length
          : pd.nodes.filter((n: { id: string }) =>
              isolatedKeptIds.has(n.id),
            ).length;
      if (visibleNodeCount === 0) continue;
      out.push({ stratum: pd.stratum, nodeCount: visibleNodeCount });
    }
    return out;
  }, [positionedDiagrams, hiddenSections, isolatedKeptIds]);

  const focusedLabel = useMemo(() => {
    if (selectedNodeId === null) return null;
    for (const pd of positionedDiagrams) {
      const n = pd.nodes.find((x: { id: string }) => x.id === selectedNodeId);
      if (n) return n.label;
    }
    return selectedNodeId;
  }, [selectedNodeId, positionedDiagrams]);

  const canvasNode =
    prefs.viewMode === "3d" ? (
      <Track3Canvas3D
        key={`3d:${architectureId}:${prefs.isFullscreen ? "full" : "inline"}`}
        positionedDiagrams={positionedDiagrams}
        hiddenSections={hiddenSections}
        isolatedKeptIds={isolatedKeptIds}
        selectedNodeId={selectedNodeId}
        cameraX={prefs.cameraX}
        cameraY={prefs.cameraY}
        cameraZoom={prefs.cameraZoom}
        onCameraChange={handleCameraChange}
        onNodeClick={handleNodeClick}
        containerHeight={prefs.isFullscreen ? "fill" : 360}
      />
    ) : (
      <Track3Canvas2D
        key={`2d:${architectureId}:${prefs.isFullscreen ? "full" : "inline"}`}
        positionedDiagrams={positionedDiagrams}
        hiddenSections={hiddenSections}
        isolatedKeptIds={isolatedKeptIds}
        selectedNodeId={selectedNodeId}
        cameraX={prefs.cameraX}
        cameraY={prefs.cameraY}
        cameraZoom={prefs.cameraZoom}
        onCameraChange={handleCameraChange}
        onNodeClick={handleNodeClick}
        containerHeight={prefs.isFullscreen ? "fill" : 360}
      />
    );

  if (prefs.isFullscreen) {
    return (
      <>
        <BindingPanelPlaceholder onExitFullscreen={handleExitFullscreen} />
        <div
          className="fixed inset-0 z-30 bg-background"
          data-testid="track3-fullscreen-canvas"
        >
          {canvasNode}
          <Track3FloatingOverlay
            architectureId={architectureId}
            architectureName={archState.architecture.architectureName}
            viewMode={prefs.viewMode}
            perspective={prefs.perspective}
            hiddenLayers={prefs.hiddenLayers}
            focusedLabel={focusedLabel}
            stratumIndicator={stratumIndicator}
            onSetViewMode={handleSetViewMode}
            onSetPerspective={handleSetPerspective}
            onToggleLayer={handleToggleLayer}
            onClearFocus={handleClearFocus}
            onRefresh={onRefresh}
            onExitFullscreen={handleExitFullscreen}
          />
          {layoutPending && (
            <div
              className="absolute top-3 right-3 text-[10px] uppercase tracking-widest text-muted-foreground italic px-2 py-1 rounded-md bg-card/80 border border-border/40 backdrop-blur z-40"
              data-testid="track3-layout-pending"
            >
              {LABELS.layoutPending}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <BindingPanel
        archState={archState}
        onRefresh={onRefresh}
        onEnterFullscreen={handleEnterFullscreen}
      />
      <InlineControlsBar
        viewMode={prefs.viewMode}
        perspective={prefs.perspective}
        hiddenLayers={prefs.hiddenLayers}
        focusedLabel={focusedLabel}
        onSetViewMode={handleSetViewMode}
        onSetPerspective={handleSetPerspective}
        onToggleLayer={handleToggleLayer}
        onClearFocus={handleClearFocus}
      />
      <Card data-testid="track3-diagram-card">
        <CardHeader>
          <CardTitle className="text-sm">{LABELS.diagramHeading}</CardTitle>
          <CardDescription className="text-xs">
            {LABELS.diagramHint} {LABELS.zoomHint}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {canvasNode}
            {layoutPending && (
              <div
                className="absolute top-2 right-2 text-[10px] uppercase tracking-widest text-muted-foreground italic px-2 py-1 rounded-md bg-card/80 border border-border/40 backdrop-blur"
                data-testid="track3-layout-pending"
              >
                {LABELS.layoutPending}
              </div>
            )}
          </div>
          <p
            className="text-[11px] text-muted-foreground/80 italic mt-3"
            data-testid="track3-inline-note"
          >
            {LABELS.inlineNote}
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function BindingPanelPlaceholder({
  onExitFullscreen,
}: {
  onExitFullscreen: () => void;
}) {
  return (
    <Card data-testid="track3-fullscreen-placeholder">
      <CardHeader>
        <CardTitle className="text-sm">
          {LABELS.fullscreenPlaceholderHeading}
        </CardTitle>
        <CardDescription className="text-xs">
          {LABELS.fullscreenPlaceholderBody}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          size="sm"
          onClick={onExitFullscreen}
          data-testid="track3-fullscreen-placeholder-exit"
        >
          {LABELS.exitFullscreen}
        </Button>
      </CardContent>
    </Card>
  );
}

function BindingPanel({
  archState,
  onRefresh,
  onEnterFullscreen,
}: {
  archState: CtadArchitectureStateExport;
  onRefresh: () => void;
  onEnterFullscreen: () => void;
}) {
  return (
    <Card data-testid="track3-binding-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.bindingHeading}</CardTitle>
        <CardDescription className="text-xs">{LABELS.bindingHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-xs">
          <div data-testid="track3-binding-name">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldName}
            </dt>
            <dd className="mt-0.5">{archState.architecture.architectureName || "\u2014"}</dd>
          </div>
          <div data-testid="track3-binding-archid">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldArchitectureId}
            </dt>
            <dd className="mt-0.5 font-mono">{archState.architecture.architectureId}</dd>
          </div>
          <div className="col-span-2" data-testid="track3-binding-environments">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldEnvironments}
            </dt>
            <dd className="mt-0.5">
              {archState.environments.length === 0
                ? "\u2014"
                : archState.environments.map((e) => e.name).join(", ")}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/ctad/arch/${encodeURIComponent(archState.architecture.architectureId)}`}
          >
            <Button variant="outline" size="sm" data-testid="track3-open-architecture">
              {LABELS.openArchitecture}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            data-testid="track3-refresh-architecture"
            onClick={onRefresh}
          >
            <RefreshCcw className="w-3 h-3 mr-1" />
            {LABELS.refreshFromArch}
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="track3-enter-fullscreen"
            onClick={onEnterFullscreen}
          >
            <Maximize2 className="w-3 h-3 mr-1" />
            {LABELS.enterFullscreen}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InlineControlsBar(props: {
  viewMode: Track3ViewMode;
  perspective: Track3Perspective;
  hiddenLayers: readonly string[];
  focusedLabel: string | null;
  onSetViewMode: (m: Track3ViewMode) => void;
  onSetPerspective: (p: Track3Perspective) => void;
  onToggleLayer: (layerId: string) => void;
  onClearFocus: () => void;
}) {
  const PERSPECTIVE_LABEL: Readonly<Record<Track3Perspective, string>> = {
    all: "All layers",
    infraCentric: "Infrastructure-centric",
    appCentric: "Application-centric",
    integrationCentric: "Integration-centric",
  };
  return (
    <Card data-testid="track3-controls">
      <CardHeader>
        <CardTitle className="text-sm">View controls</CardTitle>
        <CardDescription className="text-xs">
          Layer and perspective choices are visual only; they do not change the underlying selections.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
            Mode
          </span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              data-testid="track3-mode-2d"
              onClick={() => props.onSetViewMode("2d")}
              className={`px-2 py-1 text-[11px] ${props.viewMode === "2d" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
            >
              2D
            </button>
            <button
              type="button"
              data-testid="track3-mode-3d"
              onClick={() => props.onSetViewMode("3d")}
              className={`px-2 py-1 text-[11px] ${props.viewMode === "3d" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
            >
              3D
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
            Perspective
          </span>
          <select
            data-testid="track3-perspective"
            value={props.perspective}
            onChange={(e) =>
              props.onSetPerspective(e.target.value as Track3Perspective)
            }
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="all">{PERSPECTIVE_LABEL.all}</option>
            <option value="infraCentric">{PERSPECTIVE_LABEL.infraCentric}</option>
            <option value="appCentric">{PERSPECTIVE_LABEL.appCentric}</option>
            <option value="integrationCentric">
              {PERSPECTIVE_LABEL.integrationCentric}
            </option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
            Layers
          </span>
          {TRACK3_LAYERS.map((l) => {
            const active = !props.hiddenLayers.includes(l);
            return (
              <label
                key={l}
                className="inline-flex items-center gap-1.5"
                data-testid={`track3-layer-toggle-${l}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => props.onToggleLayer(l)}
                />
                <span>{formatLayerLabel(l)}</span>
              </label>
            );
          })}
        </div>

        {props.focusedLabel !== null && (
          <div
            className="flex items-center gap-2 text-xs"
            data-testid="track3-focus-indicator"
          >
            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Focused on
            </span>
            <span className="text-primary font-mono">{props.focusedLabel}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={props.onClearFocus}
              data-testid="track3-clear-focus"
              className="h-6 text-[10px] px-2"
            >
              Clear focus
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

void TRACK3_LAYER_LABEL;

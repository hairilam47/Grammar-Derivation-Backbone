// ACW Track 3 — bound derived view shell.
//
// Reads CTAD_STATE for the bound ADS via `getCtadState`, computes
// `AdcBounds` via `projectBounds`, and drives the DiagramSpec
// compiler + ELK layout pipeline (via `track3DiagramAdapter`) to
// produce a list of positioned diagrams — one per architecture
// stratum — that the renderers stack along the Z axis. Layer /
// perspective controls live here; both renderers receive the
// SAME `positionedDiagrams + hiddenSections` so visibility cannot
// diverge between them.
//
// Layout is async because ELK is async; the shell carries
// the positioned-diagrams in state and re-runs the pipeline only
// when (ctadState, bounds) change. Layer-toggle and perspective
// changes do NOT re-run ELK — they are passed straight through
// to the renderers as filter sets.
//
// The shell remains strictly read-only: it never mutates CTAD or
// the portfolio. The only mutable storage Track 3 owns is
// `acw.track3.viewprefs.v1`, written through `track3ViewPrefs`.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRoute, Link } from "wouter";
import { Layers, Crosshair, RefreshCcw } from "lucide-react";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import { getCtadState } from "@/ctad/ctadStore";
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
import { projectBounds } from "@/acw/track3/track3AdcBounds";
import {
  compileTrack3Specs,
  layoutTrack3Specs,
  ctadSectionOfNodeId,
} from "@/acw/track3/track3DiagramAdapter";
import type { PositionedDiagram } from "@workspace/diagram-layout";
import {
  TRACK3_LAYERS,
  TRACK3_PERSPECTIVES,
  type Track3Layer,
  type Track3Perspective,
} from "@/acw/track3/track3Types";
import { TRACK3_LAYER_LABEL } from "@/acw/track3/track3LabelRegistry";
import {
  getPrefs,
  getDoc as getViewPrefsDoc,
  setViewMode,
  setPerspective,
  toggleLayerHidden,
  setCamera,
  subscribePrefs,
  type Track3ViewMode,
} from "@/acw/track3/track3ViewPrefs";
import { Track3Canvas2D } from "@/components/acw/track3/Track3Canvas2D";
import { Track3Canvas3D } from "@/components/acw/track3/Track3Canvas3D";
import { isolateAroundNode } from "@/acw/track3/track3FocusIsolation";
import type { AcwNode, AcwEdge } from "@/acw/acwLensStructure";

interface Track3Binding {
  readonly adsId: string;
  readonly adsVersion: string;
}

const LABELS = {
  brandLabel: "Architecture Decision Canvas",
  pageTitle: "Derived structural view",
  pageSubtitle:
    "A structural diagram derived from the bound technology selections. The diagram is exploratory and reflects only what is selected in the CTAD binding.",
  bindingHeading: "ADC binding (read-only)",
  bindingHint:
    "These fields belong to the underlying frozen decision. The derived view reads them but never edits them.",
  fieldProject: "Project",
  fieldDecisionAuthority: "Decision authority",
  fieldAdsId: "ADS id",
  fieldAdsVersion: "ADS version",
  fieldLayersPresent: "Layers in scope",
  controlsHeading: "View controls",
  controlsHint:
    "Layer and perspective choices are visual only; they do not change the underlying selections.",
  layerToggleLabel: "Layers",
  perspectiveLabel: "Perspective",
  modeLabel: "Mode",
  mode2D: "2D",
  mode3D: "3D",
  perspectiveAll: "All layers",
  perspectiveInfra: "Infrastructure-centric",
  perspectiveApp: "Application-centric",
  perspectiveIntegration: "Integration-centric",
  layerInfrastructure: "Infrastructure",
  layerApplication: "Application",
  layerIntegration: "Integration",
  layerCrossCutting: "Cross-Cutting",
  layerOps: "Ops & Lifecycle",
  diagramHeading: "Derived diagram",
  diagramHint:
    "The diagram is derived from CTAD_STATE at the moment this view was opened or last refreshed. It is not persisted; use \"Refresh from CTAD\" to pick up CTAD edits made elsewhere.",
  bindingNotFoundHeading: "Binding not found",
  bindingNotFoundBody:
    "No frozen decision matches this binding. Return to the entry list to pick a different one.",
  backToEntry: "Back to derived entry",
  openCtad: "Open bound CTAD shell",
  refreshFromCtad: "Refresh from CTAD",
  inlineNote:
    "This view is exploratory and derived. It does not form or otherwise act on a decision.",
  focusedHeading: "Focused on",
  clearFocus: "Clear focus",
  focusHint:
    "Click a node in the diagram to isolate it and its neighbours. Click again or press the button to clear.",
  zoomHint:
    "Drag to rotate, right-drag to pan, scroll to zoom. Camera position persists per binding.",
  layoutPending: "Computing layout…",
} as const;

assertAllAcwTrack3Language(Object.values(LABELS));

const PERSPECTIVE_LABEL: Readonly<Record<Track3Perspective, string>> = {
  all: LABELS.perspectiveAll,
  infraCentric: LABELS.perspectiveInfra,
  appCentric: LABELS.perspectiveApp,
  integrationCentric: LABELS.perspectiveIntegration,
};

function formatLayerLabel(l: Track3Layer): string {
  switch (l) {
    case "infrastructure":
      return LABELS.layerInfrastructure;
    case "application":
      return LABELS.layerApplication;
    case "integration":
      return LABELS.layerIntegration;
    case "crossCutting":
      return LABELS.layerCrossCutting;
    case "ops":
      return LABELS.layerOps;
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
  const [match, params] = useRoute<{ adsId: string; adsVersion: string }>(
    "/acw/derived/:adsId/:adsVersion",
  );
  const adsId = match && params ? decodeURIComponent(params.adsId) : "";
  const adsVersion =
    match && params ? decodeURIComponent(params.adsVersion) : "";
  const binding: Track3Binding = useMemo(
    () => ({ adsId, adsVersion }),
    [adsId, adsVersion],
  );
  const entry = useMemo<PortfolioEntry | undefined>(() => {
    if (!adsId || !adsVersion) return undefined;
    return listEntries().find(
      (e) => e.adsId === adsId && e.adsVersion === adsVersion,
    );
  }, [adsId, adsVersion]);
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

        {entry === undefined ? (
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
          <BoundShell binding={binding} entry={entry} />
        )}
      </main>
    </div>
  );
}

function BoundShell({
  binding,
  entry,
}: {
  binding: Track3Binding;
  entry: PortfolioEntry;
}) {
  useViewPrefsDoc();
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const ctadState = useMemo(
    () => getCtadState(binding),
    [binding, refreshTick],
  );
  const bounds = useMemo(() => projectBounds(entry), [entry]);

  // ---- DiagramSpec compile + ELK layout (async) -----------------
  // Compile is sync and produces the spec list; layout is async.
  // We re-run BOTH only when (ctadState, bounds) change. Layer-
  // toggle and perspective changes do NOT trigger this effect —
  // they read from positioned-diagrams already in state and apply
  // a visibility-only filter at render time.
  const specs = useMemo(
    () => compileTrack3Specs(ctadState, bounds),
    [ctadState, bounds],
  );
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

  const prefs = getPrefs(entry.adsId, entry.adsVersion);

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

  // Isolate-on-click: when the user clicks a node, restrict
  // visibility to that node + its neighbours (legacy semantics
  // from `isolateAroundNode`). Computed in the shell so both
  // renderers receive the SAME kept-id set and cannot diverge.
  // null means no isolation active; renderers treat absence as
  // "show everything visible after the section filter".
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
    // No-op (selection unknown / cleared) — `isolateAroundNode`
    // returns the input unchanged in that case, which we surface
    // as "no isolation" so the renderers don't fade everything.
    if (result.nodes === acwNodes) return null;
    return new Set(result.nodes.map((n) => n.id));
  }, [selectedNodeId, positionedDiagrams]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);
  const handleClearFocus = useCallback(() => setSelectedNodeId(null), []);
  const handleCameraChange = useCallback(
    (cameraX: number, cameraY: number, cameraZoom: number) => {
      setCamera(binding.adsId, binding.adsVersion, cameraX, cameraY, cameraZoom);
    },
    [binding.adsId, binding.adsVersion],
  );

  const focusedLabel = useMemo(() => {
    if (selectedNodeId === null) return null;
    for (const pd of positionedDiagrams) {
      const n = pd.nodes.find((x: { id: string }) => x.id === selectedNodeId);
      if (n) return n.label;
    }
    return selectedNodeId;
  }, [selectedNodeId, positionedDiagrams]);

  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  // Strip the section reference for an unused-import-style guard.
  void ctadSectionOfNodeId;

  return (
    <>
      <BindingPanel entry={entry} onRefresh={handleRefresh} />
      <ControlsBar
        binding={binding}
        viewMode={prefs.viewMode}
        perspective={prefs.perspective}
        hiddenLayers={prefs.hiddenLayers}
        focusedLabel={focusedLabel}
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
          {layoutPending ? (
            <div
              className="text-[11px] text-muted-foreground italic h-[360px] flex items-center justify-center border border-border/40 rounded-md bg-card/30"
              data-testid="track3-layout-pending"
            >
              {LABELS.layoutPending}
            </div>
          ) : prefs.viewMode === "3d" ? (
            <Track3Canvas3D
              key={`3d:${binding.adsId}:${binding.adsVersion}`}
              positionedDiagrams={positionedDiagrams}
              hiddenSections={hiddenSections}
              isolatedKeptIds={isolatedKeptIds}
              selectedNodeId={selectedNodeId}
              cameraX={prefs.cameraX}
              cameraY={prefs.cameraY}
              cameraZoom={prefs.cameraZoom}
              onCameraChange={handleCameraChange}
              onNodeClick={handleNodeClick}
            />
          ) : (
            <Track3Canvas2D
              positionedDiagrams={positionedDiagrams}
              hiddenSections={hiddenSections}
              isolatedKeptIds={isolatedKeptIds}
              selectedNodeId={selectedNodeId}
              cameraX={prefs.cameraX}
              cameraY={prefs.cameraY}
              cameraZoom={prefs.cameraZoom}
              onCameraChange={handleCameraChange}
              onNodeClick={handleNodeClick}
            />
          )}
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

function BindingPanel({
  entry,
  onRefresh,
}: {
  entry: PortfolioEntry;
  onRefresh: () => void;
}) {
  return (
    <Card data-testid="track3-binding-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.bindingHeading}</CardTitle>
        <CardDescription className="text-xs">{LABELS.bindingHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-xs">
          <div data-testid="track3-binding-project">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldProject}
            </dt>
            <dd className="mt-0.5">{entry.projectName || "\u2014"}</dd>
          </div>
          <div data-testid="track3-binding-authority">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldDecisionAuthority}
            </dt>
            <dd className="mt-0.5">{entry.approvingAuthority || "\u2014"}</dd>
          </div>
          <div data-testid="track3-binding-adsid">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldAdsId}
            </dt>
            <dd className="mt-0.5 font-mono">{entry.adsId}</dd>
          </div>
          <div data-testid="track3-binding-adsversion">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldAdsVersion}
            </dt>
            <dd className="mt-0.5 font-mono">{entry.adsVersion}</dd>
          </div>
          <div className="col-span-2" data-testid="track3-binding-layers">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.fieldLayersPresent}
            </dt>
            <dd className="mt-0.5">
              {entry.layersPresent.length === 0
                ? "\u2014"
                : entry.layersPresent.join(", ")}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/ctad/${encodeURIComponent(entry.adsId)}/${encodeURIComponent(entry.adsVersion)}`}
          >
            <Button variant="outline" size="sm" data-testid="track3-open-ctad">
              {LABELS.openCtad}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            data-testid="track3-refresh-ctad"
            onClick={onRefresh}
          >
            <RefreshCcw className="w-3 h-3 mr-1" />
            {LABELS.refreshFromCtad}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ControlsBar({
  binding,
  viewMode,
  perspective,
  hiddenLayers,
  focusedLabel,
  onClearFocus,
}: {
  binding: Track3Binding;
  viewMode: Track3ViewMode;
  perspective: Track3Perspective;
  hiddenLayers: readonly string[];
  focusedLabel: string | null;
  onClearFocus: () => void;
}) {
  return (
    <Card data-testid="track3-controls">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.controlsHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.controlsHint} {LABELS.focusHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
            {LABELS.modeLabel}
          </span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              data-testid="track3-mode-2d"
              onClick={() => setViewMode(binding.adsId, binding.adsVersion, "2d")}
              className={`px-2 py-1 text-[11px] ${viewMode === "2d" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
            >
              {LABELS.mode2D}
            </button>
            <button
              type="button"
              data-testid="track3-mode-3d"
              onClick={() => setViewMode(binding.adsId, binding.adsVersion, "3d")}
              className={`px-2 py-1 text-[11px] ${viewMode === "3d" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
            >
              {LABELS.mode3D}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
            {LABELS.perspectiveLabel}
          </span>
          <select
            data-testid="track3-perspective"
            value={perspective}
            onChange={(e) =>
              setPerspective(
                binding.adsId,
                binding.adsVersion,
                e.target.value as Track3Perspective,
              )
            }
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            {TRACK3_PERSPECTIVES.map((p) => (
              <option key={p} value={p}>
                {PERSPECTIVE_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
            {LABELS.layerToggleLabel}
          </span>
          {TRACK3_LAYERS.map((l) => {
            const active = !hiddenLayers.includes(l);
            return (
              <label
                key={l}
                className="inline-flex items-center gap-1.5"
                data-testid={`track3-layer-toggle-${l}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() =>
                    toggleLayerHidden(binding.adsId, binding.adsVersion, l)
                  }
                />
                <span>{formatLayerLabel(l)}</span>
              </label>
            );
          })}
        </div>

        {focusedLabel !== null && (
          <div
            className="flex items-center gap-2 text-xs"
            data-testid="track3-focus-indicator"
          >
            <Crosshair className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
              {LABELS.focusedHeading}
            </span>
            <span className="text-primary font-mono">{focusedLabel}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFocus}
              data-testid="track3-clear-focus"
              className="h-6 text-[10px] px-2"
            >
              {LABELS.clearFocus}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

void TRACK3_LAYER_LABEL;

// ACW Track 3 — bound derived view shell.
//
// Reads CTAD_STATE for the bound ADS via `getCtadState`,
// computes `AdcBounds` via `projectBounds`, and renders the
// derived structural diagram in either 2D or 3D depending on
// the per-binding view-prefs choice. Layer / perspective
// controls live here; both renderers receive the SAME derived
// nodes and edges so visibility cannot diverge between them.
//
// The shell is strictly read-only: it never mutates CTAD or the
// portfolio. The only mutable storage Track 3 owns is
// `acw.track3.viewprefs.v1`, written through `track3ViewPrefs`.
//
// Constitutional CTAD allowlist: only the closed surface
// `{ getCtadState, exportCtadState, type CtadStateExport }` is
// imported from the CTAD store. There is no live subscription —
// CTAD_STATE is re-read on route mount / binding change (the
// `binding` dep of the `useMemo` below) and on the explicit
// "Refresh from CTAD" button (the `refreshTick` dep). View-prefs
// changes only trigger a re-render of the shell with the
// previously memoised `ctadState`; they do NOT fan out to a
// fresh CTAD read. This satisfies the task contract:
// "navigating back to the derived view reflects the updated
// structure", and keeps the refresh moment explicit.
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
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
import { deriveACWStructure } from "@/acw/track3/track3Derive";
import { projectBounds } from "@/acw/track3/track3AdcBounds";
import { isolateAroundNode } from "@/acw/track3/track3FocusIsolation";
import {
  TRACK3_LAYERS,
  TRACK3_PERSPECTIVES,
  nodeIdForLayer,
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

// Local binding identity. Track 3 cannot import the CTAD store's
// `CtadBinding` type (off the read-only allowlist), so a thin
// inline shape is used instead. Identity-only — no mutation.
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
  // Re-render on view-prefs change (mode/perspective/hidden
  // layers/camera). CTAD_STATE itself is re-read only when the
  // ADC binding changes (route mount / navigation) or when the
  // user clicks the "Refresh from CTAD" button (which bumps the
  // local `refreshTick`); see the `useMemo` deps below. This is
  // intentional: CTAD edits in another tab/route do NOT fan out
  // automatically — the surface is strictly read-only and the
  // refresh moment is explicit, so a user is never surprised by
  // the diagram silently shifting underneath them. Navigating
  // away and back, or clicking Refresh, picks up changes.
  useViewPrefsDoc();
  const [refreshTick, setRefreshTick] = useState(0);
  // `selectedNodeId` is the user's click target. Isolation is
  // computed by `isolateAroundNode` (a pure module assertion-
  // backed function) BEFORE handing the structure to the
  // renderer; the renderer then displays everything in the
  // pre-filtered set. This avoids the foot-gun of passing a
  // leaf id as `focusedParentId` to `enumerateLensVisibility`,
  // which would (correctly, by its own contract) yield zero
  // visible nodes for a node with no children.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const ctadState = useMemo(
    () => getCtadState(binding),
    [binding, refreshTick],
  );
  const bounds = useMemo(() => projectBounds(entry), [entry]);
  const structure = useMemo(
    () => deriveACWStructure(ctadState, bounds),
    [ctadState, bounds],
  );
  const prefs = getPrefs(entry.adsId, entry.adsVersion);

  // Filter nodes/edges by hidden layers and perspective.
  const filteredStructure = useMemo(() => {
    const hidden = new Set(prefs.hiddenLayers);
    let kept = new Set<string>();
    for (const n of structure.nodes) {
      const layer = layerOf(n.id);
      if (layer !== null && hidden.has(layer)) continue;
      kept.add(n.id);
    }
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
        const focusIds = new Set<string>();
        for (const n of structure.nodes) {
          const l = layerOf(n.id);
          if (l === focusLayer && kept.has(n.id)) focusIds.add(n.id);
        }
        const neighbour = new Set<string>(focusIds);
        for (const e of structure.edges) {
          if (focusIds.has(e.fromId) && kept.has(e.toId)) neighbour.add(e.toId);
          if (focusIds.has(e.toId) && kept.has(e.fromId)) neighbour.add(e.fromId);
        }
        for (const n of structure.nodes) {
          if (neighbour.has(n.id) && n.parentId !== null) {
            neighbour.add(n.parentId);
          }
        }
        kept = neighbour;
      }
    }
    const nodes = structure.nodes.filter((n) => kept.has(n.id));
    const edges = structure.edges.filter(
      (e) => kept.has(e.fromId) && kept.has(e.toId),
    );
    return { nodes, edges };
  }, [structure, prefs.hiddenLayers, prefs.perspective]);

  // No per-node collapse UI yet; the empty set documents that.
  const collapsedIds = useMemo(() => new Set<string>(), []);

  // Apply focus isolation in the shell (pure transformation
  // backed by acwTrack3FocusIsolationInvariants). After this
  // step the renderer receives only the nodes/edges that should
  // be visible, and uses focusedParentId={null} so the shared
  // visibility helper just enumerates everything in the input.
  const isolatedStructure = useMemo(
    () =>
      isolateAroundNode(
        filteredStructure.nodes,
        filteredStructure.edges,
        selectedNodeId,
      ),
    [filteredStructure, selectedNodeId],
  );

  const handleNodeClick = useCallback((nodeId: string) => {
    // Click toggles isolate-focus on the clicked node. Clicking
    // the currently focused node clears focus.
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
    const n = structure.nodes.find((x) => x.id === selectedNodeId);
    return n ? n.label : selectedNodeId;
  }, [selectedNodeId, structure.nodes]);

  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

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
          {prefs.viewMode === "3d" ? (
            <Track3Canvas3D
              key={`3d:${binding.adsId}:${binding.adsVersion}`}
              nodes={isolatedStructure.nodes}
              edges={isolatedStructure.edges}
              collapsedIds={collapsedIds}
              selectedNodeId={selectedNodeId}
              cameraX={prefs.cameraX}
              cameraY={prefs.cameraY}
              cameraZoom={prefs.cameraZoom}
              onCameraChange={handleCameraChange}
              onNodeClick={handleNodeClick}
            />
          ) : (
            <Track3Canvas2D
              nodes={isolatedStructure.nodes}
              edges={isolatedStructure.edges}
              collapsedIds={collapsedIds}
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

function layerOf(nodeId: string): Track3Layer | null {
  for (const l of TRACK3_LAYERS) {
    if (nodeId === nodeIdForLayer(l) || nodeId.startsWith(`node:param:${l}:`)) {
      return l;
    }
  }
  return null;
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

// Re-assert label set is non-vendor / non-judgement (handled by
// assertAllAcwTrack3Language at module load above). The
// TRACK3_LAYER_LABEL import is needed so the label registry's
// module-load assertions run before this shell mounts.
void TRACK3_LAYER_LABEL;

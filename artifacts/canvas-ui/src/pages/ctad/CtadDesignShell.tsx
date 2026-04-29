// CTAD Phase 3 (Task #152) — Multi-Diagram Logical Design Shell.
//
// A standalone authoring surface for the five logical-design
// diagrams (BPMN, ERD, DDL, Sequence, Class). Logical nodes are
// persisted into the existing ACW workspace
// (`acw.workspace.v1`) at `parentId = null`, additively widened
// with the optional Phase 3 fields (`diagramType`,
// `diagramSubtype`, `boundRequirementIds`, `moduleId`,
// `logicalPosition`, etc.). The schema version stays
// `acw-1.0`; pre-Phase-3 documents continue to load unchanged.
//
// Discipline notes:
//   - This file lives under `src/pages/ctad/**` and is therefore
//     scanned by `ctadIsolationInvariants.test-shape.ts`. Every
//     import below is on the CTAD allowlist (this includes the
//     newly Phase-3-widened entries: @/acw/acwStore,
//     @/acw/acwGrammar, @/governance/requirementsStore,
//     @/governance/moduleCatalogStore — the last two restricted
//     to read-only named imports).
//   - All static labels are run through `assertAllCtadLanguage`
//     at module load so a copy edit cannot smuggle a forbidden
//     vocabulary token (approve, confirm, recommend, best,
//     optimal, final, score, ranked, mandate, justify, enforce,
//     must) into the surface.
//   - No emoji; only lucide-react vector glyphs.
//   - The shell renders its own minimal SVG/HTML canvas instead
//     of importing the EAStudio `InteractiveCanvas2D` component,
//     because `@/components/acw/**` is intentionally NOT on the
//     CTAD allowlist (CTAD must not depend on any EAStudio React
//     surface).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  CSSProperties,
  DragEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Building2,
  Cpu,
  Database as DatabaseIcon,
  Layers as LayersIcon,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { assertAllCtadLanguage } from "@/governance/staticTextGuard";
import { Button } from "@/components/ui/button";
import {
  ACW_DIAGRAM_TYPES,
  type AcwDiagramType,
  type AcwNode,
  type AcwWorkspace,
  createNode,
  getWorkspace,
  renameNode,
  subscribe,
  updateNodeParent,
  updateNodePosition,
  updateNodeProperties,
} from "@/acw/acwStore";
import {
  canCreateNode,
  type ValidatorWorkspaceView,
} from "@/acw/acwValidator";
import {
  permittedParentsFor,
  type AcwElementType,
} from "@/acw/acwGrammar";
import {
  CTAD_DIAGRAM_TYPE_LABEL,
  CTAD_PALETTE_DATA_KEY,
  ctadPaletteItemByKind,
  ctadPaletteItemsByDiagramType,
  type CtadPaletteItem,
} from "@/ctad/paletteRegistry";
import {
  listRequirements,
  type Requirement,
} from "@/governance/requirementsStore";
import {
  listModules,
  type Module,
} from "@/governance/moduleCatalogStore";

// All static labels rendered by this page. Asserted at module load
// against the CTAD vocabulary tier so a forbidden token cannot be
// introduced silently.
const LABELS = {
  pageTitle: "CTAD \u2014 Logical Design",
  pageSubtitle:
    "Author logical-layer diagrams (BPMN, ERD, DDL, Sequence, Class) inside the workspace. Logical nodes are interpretive and reversible; nothing here changes a frozen decision.",
  backLink: "Back to CTAD",
  paletteHeading: "Palette",
  paletteHint: "Drag a tile onto the canvas to add a logical node.",
  canvasHeading: "Canvas",
  canvasEmpty: "No logical nodes for this diagram yet. Drag from the palette.",
  canvasErrorPrefix: "Could not add the logical node:",
  // Inline error literals surfaced through `setError`. Hoisted into
  // LABELS (rather than left as inline strings) so the
  // `assertAllCtadLanguage` pass below catches any forbidden token
  // before the bundle ships.
  errorUnknownTile: "Unknown palette tile.",
  errorQuadrantNotSeeded: "EAStudio domain quadrant has not been set up yet.",
  diagramSelectorHeading: "Diagram",
  nodesHeading: "Logical Nodes",
  nodesEmpty: "Nothing here yet for this diagram.",
  propertiesHeading: "Properties",
  propertiesNoSelection: "Select a logical node to edit its properties.",
  propertyName: "Name",
  propertyDiagramSubtype: "Diagram subtype",
  propertyBoundRequirements: "Bound requirements",
  propertyBoundModule: "Bound module",
  propertyNoneOption: "(none)",
  propertyRequirementsEmpty:
    "No requirements have been authored in this work item yet.",
  propertyModulesEmpty: "No modules have been authored in this work item yet.",
  promoteHeading: "Promote to EAStudio",
  promoteHint:
    "Move this logical node into one of the four EAStudio domain quadrants. The grammar greys quadrants that would refuse this element type.",
  promoteBusiness: "Business",
  promoteData: "Data",
  promoteApplication: "Application",
  promoteTechnology: "Technology",
  promoteRefusedSuffix: "(grammar refuses)",
  promoteAlreadyPromoted:
    "This logical node already lives inside an EAStudio domain quadrant. Use the EAStudio canvas to move or detach it.",
} as const;

assertAllCtadLanguage(Object.values(LABELS));

// Stable mapping: domain quadrant id (the seeded sealed container)
// → display label and icon. The four ids are stamped at workspace-
// open time by `ensureDomainContainers`; we address them by id and
// never by label so a future label edit does not break us.
const PROMOTE_TARGETS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly Icon: typeof Building2;
}> = Object.freeze([
  { id: "domain-business", label: LABELS.promoteBusiness, Icon: Building2 },
  { id: "domain-data", label: LABELS.promoteData, Icon: DatabaseIcon },
  {
    id: "domain-application",
    label: LABELS.promoteApplication,
    Icon: LayersIcon,
  },
  { id: "domain-technology", label: LABELS.promoteTechnology, Icon: Cpu },
]);

// Pixel size used by the canvas drop handler and by node drag
// math. The canvas is a fixed-size relative container; nodes carry
// absolute (x, y) positions inside it.
const CANVAS_NODE_WIDTH = 160;
const CANVAS_NODE_HEIGHT = 56;
const CANVAS_MIN_WIDTH = 1200;
const CANVAS_MIN_HEIGHT = 720;

function isCtadLogicalNode(n: AcwNode, dt: AcwDiagramType): boolean {
  return n.diagramType === dt && n.parentId === null;
}

export default function CtadDesignShell() {
  // The store returns a frozen, identity-stable workspace snapshot
  // from `getWorkspace()`; after a successful mutation the cache is
  // replaced wholesale so the reference changes and React re-renders.
  // We pass the same function as both the snapshot and SSR snapshot
  // so the hook is happy in both modes.
  const ws: AcwWorkspace = useSyncExternalStore(
    subscribe,
    getWorkspace,
    getWorkspace,
  );

  const [selectedDiagram, setSelectedDiagram] =
    useState<AcwDiagramType>("bpmn");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read-only requirement / module catalogs for the binding
  // dropdowns. Both stores are scope-aware (per work item) and
  // expose only stable read APIs to the CTAD allowlist; we read
  // them per render (O(N) cheap) since CTAD itself never mutates
  // either store. Re-subscribing to those stores would be useful
  // if the user could open them in a side panel and edit while
  // the design shell stays mounted; today's flow does not do that.
  const requirements: readonly Requirement[] = listRequirements();
  const modules: readonly Module[] = listModules();

  // Logical nodes for the currently selected diagram. We display
  // only nodes that sit at the workspace root with the right
  // `diagramType`; promoted nodes (which now have a domain-
  // container parent) are filtered out so the user does not
  // accidentally re-edit one from this shell.
  const logicalNodes = useMemo<readonly AcwNode[]>(
    () =>
      ws.structureGraph.nodes.filter((n) =>
        isCtadLogicalNode(n, selectedDiagram),
      ),
    [ws, selectedDiagram],
  );

  const selectedNode = useMemo<AcwNode | null>(() => {
    if (!selectedNodeId) return null;
    return ws.structureGraph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [ws, selectedNodeId]);

  // If the selected node disappears (deleted, promoted out, or
  // diagram switched), clear the selection so the Properties panel
  // returns to its empty state.
  useEffect(() => {
    if (selectedNodeId === null) return;
    const stillThere = logicalNodes.find((n) => n.id === selectedNodeId);
    if (!stillThere) setSelectedNodeId(null);
  }, [logicalNodes, selectedNodeId]);

  // ---------------------------------------------------------------
  // Drop handler — the palette tile encodes its `paletteKind` in
  // the dataTransfer; the drop handler resolves the tile, computes
  // a canvas-relative drop position, and creates a logical node at
  // the workspace root with the diagram metadata stamped.
  // ---------------------------------------------------------------
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const onCanvasDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(CTAD_PALETTE_DATA_KEY)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onCanvasDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData(CTAD_PALETTE_DATA_KEY);
    if (!kind) return;
    const item = ctadPaletteItemByKind(kind);
    if (!item) {
      setError(LABELS.errorUnknownTile);
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Centre the new card under the cursor.
    const x = Math.max(0, Math.round(e.clientX - rect.left - CANVAS_NODE_WIDTH / 2));
    const y = Math.max(0, Math.round(e.clientY - rect.top - CANVAS_NODE_HEIGHT / 2));
    const result = createNode({
      type: item.elementType,
      parentId: null,
      label: item.label,
      x,
      y,
      diagramType: item.diagramType,
      diagramSubtype: item.diagramSubtype,
    });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setSelectedNodeId(result.id);
  }, []);

  // ---------------------------------------------------------------
  // Drag-to-reposition. Tracks the active drag in a ref so we can
  // tear down listeners on pointerup without a re-render between
  // every move event. The active-listener pair is also tracked in
  // a ref so an unmount mid-drag tears them down (preventing a
  // window-listener leak that would otherwise survive past the
  // CTAD shell) — see the unmount cleanup useEffect below.
  // ---------------------------------------------------------------
  const dragRef = useRef<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragListenersRef = useRef<{
    onMove: (ev: PointerEvent) => void;
    onUp: () => void;
  } | null>(null);

  const tearDownDragListeners = useCallback(() => {
    const active = dragListenersRef.current;
    if (active) {
      window.removeEventListener("pointermove", active.onMove);
      window.removeEventListener("pointerup", active.onUp);
      dragListenersRef.current = null;
    }
    dragRef.current = null;
  }, []);

  // Unmount safety: if the user navigates away mid-drag, drop any
  // window listeners we still own. Without this the listeners would
  // outlive the CTAD shell and continue firing position writes.
  useEffect(() => tearDownDragListeners, [tearDownDragListeners]);

  const onNodePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, node: AcwNode) => {
      // Only respond to the primary button so right-click / middle-click
      // do not initiate a drag.
      if (e.button !== 0) return;
      e.preventDefault();
      setSelectedNodeId(node.id);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Tear down any prior drag listeners first (defensive against
      // a missed pointerup, e.g. when the pointer is released over
      // an iframe or a different document).
      tearDownDragListeners();
      dragRef.current = {
        nodeId: node.id,
        offsetX: e.clientX - rect.left - node.x,
        offsetY: e.clientY - rect.top - node.y,
      };
      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const r = canvasRef.current?.getBoundingClientRect();
        if (!r) return;
        const x = Math.max(0, Math.round(ev.clientX - r.left - drag.offsetX));
        const y = Math.max(0, Math.round(ev.clientY - r.top - drag.offsetY));
        const result = updateNodePosition(drag.nodeId, x, y);
        if (!result.ok) {
          // Position writes shouldn't fail in practice; surface the
          // reason and stop the drag rather than swallow it.
          setError(result.reason);
          tearDownDragListeners();
        }
      };
      const onUp = () => {
        tearDownDragListeners();
      };
      dragListenersRef.current = { onMove, onUp };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [tearDownDragListeners],
  );

  // ---------------------------------------------------------------
  // Properties panel mutators.
  // ---------------------------------------------------------------
  const onRename = useCallback((nodeId: string, label: string) => {
    if (label.length === 0) return;
    const result = renameNode(nodeId, label);
    if (!result.ok) setError(result.reason);
    else setError(null);
  }, []);

  const onToggleRequirement = useCallback(
    (node: AcwNode, reqId: string) => {
      const current = node.boundRequirementIds ?? [];
      const next = current.includes(reqId)
        ? current.filter((id) => id !== reqId)
        : [...current, reqId];
      const result = updateNodeProperties(node.id, {
        boundRequirementIds: next.length === 0 ? null : next,
      });
      if (!result.ok) setError(result.reason);
      else setError(null);
    },
    [],
  );

  const onSelectModule = useCallback((nodeId: string, moduleId: string) => {
    const result = updateNodeProperties(nodeId, {
      moduleId: moduleId === "" ? null : moduleId,
    });
    if (!result.ok) setError(result.reason);
    else setError(null);
  }, []);

  // ---------------------------------------------------------------
  // Promote to EAStudio. The validator-gated `updateNodeParent`
  // will refuse a structurally-illegal pairing (e.g. System inside
  // BusinessEntity); we additionally pre-screen with `canCreateNode`
  // so we can grey out infeasible quadrants in the UI before the
  // user clicks.
  // ---------------------------------------------------------------
  const onPromote = useCallback((node: AcwNode, parentId: string) => {
    const result = updateNodeParent(node.id, parentId);
    if (!result.ok) setError(result.reason);
    else setError(null);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/ctad">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              {LABELS.backLink}
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <WorkflowIcon className="size-5" />
              {LABELS.pageTitle}
            </h1>
            <p className="text-xs text-muted-foreground max-w-2xl">
              {LABELS.pageSubtitle}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-1 text-xs"
          role="tablist"
          aria-label={LABELS.diagramSelectorHeading}
          data-testid="ctad-design-diagram-tabs"
        >
          {ACW_DIAGRAM_TYPES.map((dt) => {
            const active = dt === selectedDiagram;
            return (
              <button
                key={dt}
                role="tab"
                aria-selected={active}
                data-testid={`ctad-design-tab-${dt}`}
                onClick={() => {
                  setSelectedDiagram(dt);
                  setSelectedNodeId(null);
                }}
                className={`px-3 py-1.5 border border-border/50 first:rounded-l-md last:rounded-r-md -ml-px first:ml-0 ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-background hover:bg-muted/50"
                }`}
              >
                {CTAD_DIAGRAM_TYPE_LABEL[dt]}
              </button>
            );
          })}
        </div>
      </header>

      {error !== null ? (
        <div
          className="border-b border-destructive/50 bg-destructive/10 text-destructive px-4 py-2 text-xs"
          role="alert"
          data-testid="ctad-design-error"
        >
          {LABELS.canvasErrorPrefix} {error}
        </div>
      ) : null}

      <main
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: "16rem 1fr 20rem" }}
      >
        {/* ---------------- Palette panel ---------------- */}
        <aside
          className="border-r border-border/50 overflow-y-auto p-3"
          data-testid="ctad-design-palette"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {LABELS.paletteHeading}
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            {LABELS.paletteHint}
          </p>
          <div className="space-y-1">
            {ctadPaletteItemsByDiagramType(selectedDiagram).map((item) => (
              <PaletteTile key={item.paletteKind} item={item} />
            ))}
          </div>

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {LABELS.nodesHeading}
          </h2>
          {logicalNodes.length === 0 ? (
            <p className="text-xs text-muted-foreground">{LABELS.nodesEmpty}</p>
          ) : (
            <ul className="space-y-1" data-testid="ctad-design-node-list">
              {logicalNodes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedNodeId(n.id)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded border ${
                      n.id === selectedNodeId
                        ? "bg-foreground text-background border-foreground"
                        : "border-border/50 hover:bg-muted/50"
                    }`}
                    data-testid={`ctad-design-node-list-${n.id}`}
                  >
                    <div className="font-medium truncate">{n.label}</div>
                    <div className="text-[10px] opacity-70 truncate">
                      {n.diagramSubtype}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ---------------- Canvas ---------------- */}
        <section
          className="overflow-auto bg-muted/20"
          data-testid="ctad-design-canvas-scroll"
        >
          <div
            ref={canvasRef}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasDrop}
            className="relative"
            style={{
              width: `${CANVAS_MIN_WIDTH}px`,
              height: `${CANVAS_MIN_HEIGHT}px`,
              backgroundImage:
                "linear-gradient(to right, rgba(127,127,127,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(127,127,127,.08) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
            data-testid="ctad-design-canvas"
          >
            {logicalNodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-muted-foreground">
                  {LABELS.canvasEmpty}
                </p>
              </div>
            ) : null}
            {logicalNodes.map((n) => (
              <CanvasCard
                key={n.id}
                node={n}
                isSelected={n.id === selectedNodeId}
                onPointerDown={(e) => onNodePointerDown(e, n)}
              />
            ))}
          </div>
        </section>

        {/* ---------------- Properties + Promote ---------------- */}
        <aside
          className="border-l border-border/50 overflow-y-auto p-3 space-y-6"
          data-testid="ctad-design-properties"
        >
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {LABELS.propertiesHeading}
            </h2>
            {selectedNode === null ? (
              <p className="text-xs text-muted-foreground">
                {LABELS.propertiesNoSelection}
              </p>
            ) : (
              <PropertiesPanel
                node={selectedNode}
                requirements={requirements}
                modules={modules}
                onRename={onRename}
                onToggleRequirement={onToggleRequirement}
                onSelectModule={onSelectModule}
              />
            )}
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {LABELS.promoteHeading}
            </h2>
            {selectedNode === null ? (
              <p className="text-xs text-muted-foreground">
                {LABELS.propertiesNoSelection}
              </p>
            ) : selectedNode.parentId !== null ? (
              <p className="text-xs text-muted-foreground">
                {LABELS.promoteAlreadyPromoted}
              </p>
            ) : (
              <PromotePanel
                node={selectedNode}
                ws={ws}
                onPromote={onPromote}
              />
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components.
// ---------------------------------------------------------------------------

function PaletteTile({ item }: { readonly item: CtadPaletteItem }) {
  const { Icon } = item;
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(CTAD_PALETTE_DATA_KEY, item.paletteKind);
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 rounded border border-border/50 bg-background px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-muted/50"
      data-testid={`ctad-palette-tile-${item.paletteKind}`}
      title={item.subLabel}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{item.label}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {item.subLabel}
        </div>
      </div>
    </div>
  );
}

function CanvasCard({
  node,
  isSelected,
  onPointerDown,
}: {
  readonly node: AcwNode;
  readonly isSelected: boolean;
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const style: CSSProperties = {
    position: "absolute",
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: `${CANVAS_NODE_WIDTH}px`,
    height: `${CANVAS_NODE_HEIGHT}px`,
  };
  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      className={`rounded-md border bg-background shadow-sm flex flex-col justify-center px-2 select-none touch-none cursor-move ${
        isSelected
          ? "border-foreground ring-2 ring-foreground/30"
          : "border-border/70"
      }`}
      data-testid={`ctad-design-card-${node.id}`}
    >
      <div className="text-xs font-semibold truncate">{node.label}</div>
      <div className="text-[10px] text-muted-foreground truncate">
        {node.diagramSubtype}
      </div>
    </div>
  );
}

function PropertiesPanel({
  node,
  requirements,
  modules,
  onRename,
  onToggleRequirement,
  onSelectModule,
}: {
  readonly node: AcwNode;
  readonly requirements: readonly Requirement[];
  readonly modules: readonly Module[];
  readonly onRename: (nodeId: string, label: string) => void;
  readonly onToggleRequirement: (node: AcwNode, reqId: string) => void;
  readonly onSelectModule: (nodeId: string, moduleId: string) => void;
}) {
  // Local-only edit buffer for the rename input so the user can
  // type freely without a per-keystroke validator round trip.
  const [labelDraft, setLabelDraft] = useState(node.label);
  // Reset the draft when the selected node changes.
  useEffect(() => {
    setLabelDraft(node.label);
  }, [node.id, node.label]);

  const boundReqIds = node.boundRequirementIds ?? [];
  const boundReqSet = useMemo(() => new Set(boundReqIds), [boundReqIds]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          {LABELS.propertyName}
        </label>
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            if (labelDraft.trim() !== node.label && labelDraft.trim().length > 0) {
              onRename(node.id, labelDraft.trim());
            } else {
              setLabelDraft(node.label);
            }
          }}
          className="w-full text-xs px-2 py-1 rounded border border-border/50 bg-background"
          data-testid="ctad-design-property-name"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          {LABELS.propertyDiagramSubtype}
        </label>
        <div
          className="text-xs px-2 py-1 rounded border border-border/30 bg-muted/30"
          data-testid="ctad-design-property-subtype"
        >
          {node.diagramSubtype ?? "\u2014"}
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          {LABELS.propertyBoundRequirements}
        </label>
        {requirements.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {LABELS.propertyRequirementsEmpty}
          </p>
        ) : (
          <div
            className="max-h-40 overflow-y-auto border border-border/50 rounded p-1 space-y-0.5"
            data-testid="ctad-design-property-requirements"
          >
            {requirements.map((r) => (
              <label
                key={r.id}
                className="flex items-start gap-2 text-xs px-1.5 py-1 rounded hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={boundReqSet.has(r.id)}
                  onChange={() => onToggleRequirement(node, r.id)}
                  className="mt-0.5"
                  data-testid={`ctad-design-property-requirement-${r.id}`}
                />
                <span className="min-w-0">
                  <span className="font-medium block truncate">{r.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {r.id}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          {LABELS.propertyBoundModule}
        </label>
        {modules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {LABELS.propertyModulesEmpty}
          </p>
        ) : (
          <select
            value={node.moduleId ?? ""}
            onChange={(e) => onSelectModule(node.id, e.target.value)}
            className="w-full text-xs px-2 py-1 rounded border border-border/50 bg-background"
            data-testid="ctad-design-property-module"
          >
            <option value="">{LABELS.propertyNoneOption}</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

    </div>
  );
}

function PromotePanel({
  node,
  ws,
  onPromote,
}: {
  readonly node: AcwNode;
  readonly ws: AcwWorkspace;
  readonly onPromote: (node: AcwNode, parentId: string) => void;
}) {
  // Pre-screen each quadrant: would the validator accept this node
  // at this parent? Business will refuse System / ComputeNode and
  // accept only Zone (the strict Business chain), so the Business
  // tile greys out for those types automatically.
  //
  // We rebuild a `ValidatorWorkspaceView` from the live workspace
  // here (rather than importing the store-internal `viewFor`,
  // which is intentionally module-private). Only `getNodeType` is
  // strictly required by `canCreateNode`; the optional probes are
  // wired through too so the validator behaves identically to the
  // mutator path. The `ws` snapshot is passed in by the parent
  // so the view stays in lock-step with the store — capturing
  // `getWorkspace()` once at mount would let the pre-screen drift
  // as the workspace mutates.
  const view = useMemo<ValidatorWorkspaceView>(() => {
    const byId = new Map<string, AcwNode>(
      ws.structureGraph.nodes.map((n) => [n.id, n] as const),
    );
    return {
      getNodeType: (id) => byId.get(id)?.type as AcwElementType | undefined,
      getNodeParentId: (id) => byId.get(id)?.parentId,
      isSealed: (id) => byId.get(id)?.isDomainContainer === true,
    };
  }, [ws]);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{LABELS.promoteHint}</p>
      <div className="grid grid-cols-2 gap-2" data-testid="ctad-design-promote">
        {PROMOTE_TARGETS.map((t) => {
          const { Icon } = t;
          // The four EAStudio domain quadrants are stamped with a
          // strict element type (Zone for data/application/
          // technology, BusinessEntity for business). If the
          // quadrant doesn't exist yet (workspace pre-EAStudio-
          // seed) we defensively grey the tile out instead of
          // dispatching a doomed updateNodeParent call.
          const probe = view.getNodeType(t.id) === undefined
            ? ({ ok: false, reason: LABELS.errorQuadrantNotSeeded } as const)
            : canCreateNode(node.type, t.id, view);
          const enabled = probe.ok;
          return (
            <button
              key={t.id}
              disabled={!enabled}
              onClick={() => onPromote(node, t.id)}
              className={`flex flex-col items-center gap-1 px-2 py-3 rounded border text-xs ${
                enabled
                  ? "border-border/50 bg-background hover:bg-muted/50"
                  : "border-border/30 bg-muted/30 text-muted-foreground cursor-not-allowed"
              }`}
              title={
                enabled
                  ? t.label
                  : `${t.label} ${LABELS.promoteRefusedSuffix}`
              }
              data-testid={`ctad-design-promote-${t.id}`}
            >
              <Icon className="size-5" />
              <span className="text-center leading-tight">{t.label}</span>
              {enabled ? null : (
                <span className="text-[9px] uppercase tracking-wide">
                  {LABELS.promoteRefusedSuffix}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

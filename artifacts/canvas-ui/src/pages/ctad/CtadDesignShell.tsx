// CTAD Phase 3 (Task #152) — Multi-Diagram Logical Design Shell.
//
// A standalone authoring surface for the five logical-design
// diagrams (BPMN, ERD, DDL, Sequence, Class). Logical nodes and
// edges are persisted into the existing ACW workspace
// (`acw.workspace.v1`) at `parentId = null`, additively widened
// with the optional Phase 3 fields (`diagramType`,
// `diagramSubtype`, `boundRequirementIds`, `moduleId`,
// `logicalPosition`, etc.). The schema version stays
// `acw-1.0`; pre-Phase-3 documents continue to load unchanged.
//
// Discipline notes:
//   - This file lives under `src/pages/ctad/**` and is therefore
//     scanned by `ctadIsolationInvariants.test-shape.ts`. Every
//     import below is on the CTAD allowlist.
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
  X,
} from "lucide-react";
import { assertAllCtadLanguage } from "@/governance/staticTextGuard";
import { Button } from "@/components/ui/button";
import {
  ACW_DIAGRAM_TYPES,
  type AcwDiagramType,
  type AcwEdge,
  type AcwNode,
  type AcwWorkspace,
  createEdge,
  createNode,
  deleteEdge,
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
  isPermittedEdge,
  type AcwElementType,
} from "@/acw/acwGrammar";
import {
  CTAD_DIAGRAM_TYPE_LABEL,
  CTAD_PALETTE_DATA_KEY,
  CTAD_EDGE_PALETTE_DATA_KEY,
  ctadEdgePaletteItemByKind,
  ctadEdgePaletteItemsByDiagramType,
  ctadPaletteItemByKind,
  ctadPaletteItemsByDiagramType,
  type CtadEdgePaletteItem,
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
import { useCurrentScope } from "@/governance/CurrentOrgWorkItemContext";
import { getWorkItem } from "@/governance/workItemStore";
import { getOrganisation } from "@/governance/orgStore";
import { ensureDomainContainers } from "@/acw/palette/domainContainerSeed";

// All static labels rendered by this page. Asserted at module load
// against the CTAD vocabulary tier so a forbidden token cannot be
// introduced silently.
const LABELS = {
  pageTitle: "CTAD \u2014 Logical Design",
  pageSubtitle:
    "Author logical-layer diagrams (BPMN, ERD, DDL, Sequence, Class) inside the workspace. Logical nodes and edges are interpretive and reversible; nothing here changes a frozen decision.",
  backLink: "Back to CTAD",
  workItemChipPrefix: "Work Item:",
  workItemChipNone: "(no Work Item selected)",
  orgChipPrefix: "Organisation:",
  paletteHeading: "Palette",
  paletteHint: "Drag a tile onto the canvas to add a logical node.",
  edgePaletteHeading: "Edge palette",
  edgePaletteHint:
    "Click a tile to start drawing a connection, then click two nodes in turn.",
  connectModeBannerPrefix: "Drawing:",
  connectModeBannerHintIdle: "Click the source node.",
  connectModeBannerHintArmed: "Click the target node.",
  connectModeCancel: "Cancel",
  canvasHeading: "Canvas",
  canvasEmpty: "No logical nodes for this diagram yet. Drag from the palette.",
  canvasErrorPrefix: "Could not complete the change:",
  errorUnknownTile: "Unknown palette tile.",
  errorUnknownEdgeTile: "Unknown edge palette tile.",
  errorEdgeSameNode: "An edge cannot loop back to the same node.",
  errorEdgeRefused:
    "The grammar refuses this edge for the chosen node pair.",
  errorQuadrantNotSeeded: "EAStudio domain quadrant has not been set up yet.",
  diagramSelectorHeading: "Diagram",
  nodesHeading: "Logical Nodes (all diagrams)",
  nodesEmpty: "Nothing here yet. Drag a palette tile onto the canvas.",
  nodesPromotedToPrefix: "In",
  nodesNotPromoted: "Not promoted yet",
  nodesDragHint: "Drag a row onto a quadrant tile below to promote it.",
  propertiesHeading: "Properties",
  propertiesNoSelection: "Select a logical node or edge to edit its properties.",
  propertyName: "Name",
  propertyDiagramSubtype: "Diagram subtype",
  propertyBoundRequirements: "Bound requirements",
  propertyBoundModule: "Bound module",
  propertyNoneOption: "(none)",
  propertyRequirementsEmpty:
    "No requirements have been authored in this work item yet.",
  propertyModulesEmpty: "No modules have been authored in this work item yet.",
  edgeDetailsHeading: "Edge details",
  edgeDetailsKind: "Connection kind",
  edgeDetailsFrom: "From",
  edgeDetailsTo: "To",
  edgeDetailsRemove: "Remove edge",
  promoteHeading: "Promote to EAStudio",
  promoteHint:
    "Drag a logical node row from the panel on the left onto a quadrant tile below, or pick the active node and click a tile. The grammar greys quadrants that would refuse the element type.",
  promoteBusiness: "Business",
  promoteData: "Data",
  promoteApplication: "Application",
  promoteTechnology: "Technology",
  promoteRefusedSuffix: "(grammar refuses)",
  promoteAlreadyPromoted:
    "This logical node already lives inside an EAStudio domain quadrant. Use the EAStudio canvas to move or detach it.",
  promoteDropHere: "Drop a logical node here",
} as const;

assertAllCtadLanguage(Object.values(LABELS));

// dataTransfer key carried by Logical Nodes panel rows when they
// are dragged towards a Promote quadrant drop zone.
const CTAD_LOGICAL_NODE_DRAG_KEY = "application/x-ctad-logical-node-id";

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

const PROMOTE_LABEL_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  PROMOTE_TARGETS.reduce<Record<string, string>>((acc, t) => {
    acc[t.id] = t.label;
    return acc;
  }, {}),
);

// Pixel size used by the canvas drop handler and by node drag
// math. The canvas is a fixed-size relative container; nodes carry
// absolute (x, y) positions inside it.
const CANVAS_NODE_WIDTH = 160;
const CANVAS_NODE_HEIGHT = 56;
const CANVAS_MIN_WIDTH = 1200;
const CANVAS_MIN_HEIGHT = 720;

// Predicate: is this a CTAD-authored logical node (rooted at the
// workspace root with a `diagramType` stamp)?
function isUnpromotedCtadNode(n: AcwNode): boolean {
  return n.diagramType !== undefined && n.parentId === null;
}
// Predicate: any CTAD-authored node, promoted or not.
function isAnyCtadNode(n: AcwNode): boolean {
  return n.diagramType !== undefined;
}

// Connect-mode runtime state. `null` means the user is not drawing
// a new edge; a value means an edge tile has been armed and the
// user is selecting endpoints.
interface ConnectModeState {
  readonly tileKind: string;
  readonly diagramType: AcwDiagramType;
  readonly diagramSubtype: string;
  readonly edgeKind: AcwEdge["kind"];
  readonly tileLabel: string;
  readonly fromNodeId: string | null;
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

  // Tenant scope — used purely to render the top-bar work-item
  // context chip. CTAD itself does not partition state by scope at
  // this Phase-3 cut (the ACW workspace is still keyed under
  // `acw.workspace.v1`); the chip simply mirrors the EAStudio
  // shell so the user always knows which Work Item they are
  // logically authoring against.
  const scope = useCurrentScope();
  const workItem = scope.workItemId ? getWorkItem(scope.workItemId) : null;
  const org = scope.orgId ? getOrganisation(scope.orgId) : null;

  const [selectedDiagram, setSelectedDiagram] =
    useState<AcwDiagramType>("bpmn");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<ConnectModeState | null>(null);
  // Tracks which logical node (if any) is currently being dragged
  // from the "Logical Nodes" panel toward a Promote quadrant. Set
  // on dragStart, cleared on dragEnd / drop. Used by PromotePanel
  // to show per-quadrant refusal feedback DURING the drag (so the
  // user sees up-front which quadrants the grammar will accept,
  // rather than only learning at drop time). Storing only the id
  // (not the AcwNode) keeps the value stable across workspace
  // re-renders.
  const [draggedLogicalNodeId, setDraggedLogicalNodeId] = useState<
    string | null
  >(null);

  // Read-only requirement / module catalogs for the binding
  // dropdowns. Both stores are scope-aware (per work item) and
  // expose only stable read APIs to the CTAD allowlist; we read
  // them per render (O(N) cheap) since CTAD itself never mutates
  // either store.
  // Pass the active Work Item id explicitly so the requirements
  // dropdown is strictly scoped to the current Work Item — even
  // though the store is already scope-aware, the explicit argument
  // matches the documented "active Work Item only" intent and is
  // robust to any future change in the store's default behaviour.
  const requirements: readonly Requirement[] = listRequirements(
    scope.workItemId ?? undefined,
  );
  const modules: readonly Module[] = listModules();

  // Logical nodes for the currently selected diagram, restricted
  // to nodes that sit at the workspace root (i.e. have not yet
  // been promoted into an EAStudio domain quadrant). These are
  // what the canvas renders as draggable cards.
  const canvasNodes = useMemo<readonly AcwNode[]>(
    () =>
      ws.structureGraph.nodes.filter(
        (n) => n.diagramType === selectedDiagram && n.parentId === null,
      ),
    [ws, selectedDiagram],
  );

  // Map nodeId → AcwNode for fast endpoint lookups when we render
  // edges or compute connect-mode previews.
  const nodeById = useMemo<ReadonlyMap<string, AcwNode>>(
    () => new Map(ws.structureGraph.nodes.map((n) => [n.id, n] as const)),
    [ws],
  );

  // Edges that belong to the currently selected diagram and whose
  // both endpoints exist on the canvas. Edges referencing a node
  // that has since been promoted (parentId !== null) are filtered
  // out — promoted edges live in the EAStudio surface.
  const canvasEdges = useMemo<readonly AcwEdge[]>(
    () =>
      ws.structureGraph.edges.filter((e) => {
        if (e.diagramType !== selectedDiagram) return false;
        const a = nodeById.get(e.fromId);
        const b = nodeById.get(e.toId);
        return (
          a !== undefined &&
          a.parentId === null &&
          b !== undefined &&
          b.parentId === null
        );
      }),
    [ws, nodeById, selectedDiagram],
  );

  // Global Logical Nodes panel — every CTAD-authored node, whether
  // already promoted into a quadrant or still rooted. Grouped by
  // diagramType so the user can jump to any logical node from
  // anywhere.
  const allLogicalNodes = useMemo<readonly AcwNode[]>(
    () => ws.structureGraph.nodes.filter(isAnyCtadNode),
    [ws],
  );
  const logicalNodesByDiagram = useMemo<
    ReadonlyMap<AcwDiagramType, readonly AcwNode[]>
  >(() => {
    const m = new Map<AcwDiagramType, AcwNode[]>();
    for (const dt of ACW_DIAGRAM_TYPES) m.set(dt, []);
    for (const n of allLogicalNodes) {
      if (n.diagramType !== undefined) {
        m.get(n.diagramType)?.push(n);
      }
    }
    return m;
  }, [allLogicalNodes]);

  const selectedNode = useMemo<AcwNode | null>(() => {
    if (!selectedNodeId) return null;
    return ws.structureGraph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [ws, selectedNodeId]);

  const selectedEdge = useMemo<AcwEdge | null>(() => {
    if (!selectedEdgeId) return null;
    return ws.structureGraph.edges.find((e) => e.id === selectedEdgeId) ?? null;
  }, [ws, selectedEdgeId]);

  // If the selected node disappears (deleted, promoted out, or
  // diagram switched), clear the selection so the Properties panel
  // returns to its empty state.
  useEffect(() => {
    if (selectedNodeId === null) return;
    const stillThere = ws.structureGraph.nodes.find(
      (n) => n.id === selectedNodeId,
    );
    if (!stillThere) setSelectedNodeId(null);
  }, [ws, selectedNodeId]);
  useEffect(() => {
    if (selectedEdgeId === null) return;
    const stillThere = ws.structureGraph.edges.find(
      (e) => e.id === selectedEdgeId,
    );
    if (!stillThere) setSelectedEdgeId(null);
  }, [ws, selectedEdgeId]);

  // Idempotent seed of the four sealed domain quadrants. Mirrors the
  // StudioCanvas mount behaviour so the Promote panel always has a
  // valid drop target for every quadrant tile, regardless of whether
  // the user has previously visited the Studio canvas in this Work
  // Item. Refusals (e.g. shape-mismatched pre-existing nodes at the
  // well-known ids) flow through the publishRefusal channel; no UI
  // change here.
  useEffect(() => {
    ensureDomainContainers();
  }, []);

  // ESC cancels connect mode.
  useEffect(() => {
    if (connectMode === null) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setConnectMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectMode]);

  // Switching diagrams cancels any in-flight connect operation
  // (the armed tile is per-diagram; carrying it across would let
  // the user create cross-diagram edges by accident).
  useEffect(() => {
    setConnectMode(null);
  }, [selectedDiagram]);

  // ---------------------------------------------------------------
  // Drop handler — node palette tiles encode their `paletteKind` in
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
    setSelectedEdgeId(null);
  }, []);

  // ---------------------------------------------------------------
  // Drag-to-reposition. Tracks the active drag in a ref so we can
  // tear down listeners on pointerup without a re-render between
  // every move event. The active-listener pair is also tracked in
  // a ref so an unmount mid-drag tears them down.
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
  // window listeners we still own.
  useEffect(() => tearDownDragListeners, [tearDownDragListeners]);

  // ---------------------------------------------------------------
  // Connect mode: edge palette tile click arms the mode; clicking
  // canvas cards picks first the source then the target.
  // ---------------------------------------------------------------
  const armEdgeTile = useCallback((tile: CtadEdgePaletteItem) => {
    setConnectMode({
      tileKind: tile.paletteKind,
      diagramType: tile.diagramType,
      diagramSubtype: tile.diagramSubtype,
      edgeKind: tile.edgeKind,
      tileLabel: tile.label,
      fromNodeId: null,
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setError(null);
  }, []);

  const onCanvasNodeClick = useCallback(
    (node: AcwNode) => {
      // No connect mode → ordinary selection (the pointerdown
      // handler also sets it; this catch-all is here for clarity
      // when the click is a no-drag tap).
      if (connectMode === null) {
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
        return;
      }
      if (connectMode.fromNodeId === null) {
        setConnectMode({ ...connectMode, fromNodeId: node.id });
        return;
      }
      if (connectMode.fromNodeId === node.id) {
        setError(LABELS.errorEdgeSameNode);
        return;
      }
      const fromNode = nodeById.get(connectMode.fromNodeId);
      const toNode = node;
      if (!fromNode) {
        setConnectMode(null);
        return;
      }
      if (
        !isPermittedEdge(
          connectMode.edgeKind,
          fromNode.type as AcwElementType,
          toNode.type as AcwElementType,
        )
      ) {
        setError(LABELS.errorEdgeRefused);
        return;
      }
      const result = createEdge({
        kind: connectMode.edgeKind,
        fromId: fromNode.id,
        toId: toNode.id,
        diagramType: connectMode.diagramType,
        diagramSubtype: connectMode.diagramSubtype,
      });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setError(null);
      setConnectMode(null);
    },
    [connectMode, nodeById],
  );

  const onNodePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, node: AcwNode) => {
      // Only respond to the primary button so right-click / middle-click
      // do not initiate a drag.
      if (e.button !== 0) return;
      // While in connect mode, suppress drag and treat the press as
      // the click that picks an endpoint.
      if (connectMode !== null) {
        e.preventDefault();
        onCanvasNodeClick(node);
        return;
      }
      e.preventDefault();
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
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
    [connectMode, onCanvasNodeClick, tearDownDragListeners],
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

  const onDeleteEdge = useCallback((edgeId: string) => {
    const result = deleteEdge(edgeId);
    if (!result.ok) setError(result.reason);
    else {
      setError(null);
      setSelectedEdgeId(null);
    }
  }, []);

  // ---------------------------------------------------------------
  // Promote to EAStudio. The validator-gated `updateNodeParent`
  // will refuse a structurally-illegal pairing (e.g. System inside
  // BusinessEntity); we additionally pre-screen with `canCreateNode`
  // so we can grey out infeasible quadrants in the UI before the
  // user clicks or drops.
  //
  // After a successful re-parent we additionally call
  // `updateNodePosition` to seed a deterministic, quadrant-relative
  // (x, y) inside the target sealed container. This matches the
  // Phase-3 spec ("set parentId AND x/y on drop") and gives
  // EAStudio a sensible starting layout without depending on
  // whatever transient drag-position the node carried while it was
  // a free logical node on the CTAD canvas. The offsets are simple
  // hash-based scatter inside a 600 x 360 area so multiple
  // promotions into the same quadrant don't all stack on top of
  // each other; the validator does not constrain coordinates so
  // this never refuses.
  // ---------------------------------------------------------------
  const onPromote = useCallback((node: AcwNode, parentId: string) => {
    const result = updateNodeParent(node.id, parentId);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    // Deterministic scatter: derive a stable offset from the node id
    // so the same node always lands in the same spot inside its
    // quadrant (idempotent across re-promotes / undo / replay).
    let h = 0;
    for (let i = 0; i < node.id.length; i++) {
      h = (h * 31 + node.id.charCodeAt(i)) >>> 0;
    }
    const dx = 80 + (h % 600);
    const dy = 80 + ((h >>> 8) % 360);
    const reposition = updateNodePosition(node.id, dx, dy);
    if (!reposition.ok) {
      // Position update on a freshly-re-parented node should not
      // refuse (no grammar coupling); surface the reason if the
      // store ever evolves to refuse a (parent, position) pair.
      setError(reposition.reason);
      return;
    }
    setError(null);
    // After promotion the node leaves the canvas; clear selection
    // so the Properties panel returns to empty.
    setSelectedNodeId(null);
  }, []);

  // Validator pre-screen view, rebuilt from the live workspace.
  const view = useMemo<ValidatorWorkspaceView>(() => {
    return {
      getNodeType: (id) => nodeById.get(id)?.type as AcwElementType | undefined,
      getNodeParentId: (id) => nodeById.get(id)?.parentId,
      isSealed: (id) => nodeById.get(id)?.isDomainContainer === true,
    };
  }, [nodeById]);

  // Promote drop handler factory — returns a handler bound to a
  // specific quadrant id. The dataTransfer carries the dragged
  // logical-node id; we resolve it, run the validator pre-screen,
  // and dispatch `updateNodeParent`.
  const handlePromoteDrop = useCallback(
    (parentId: string) =>
      (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        // Always clear the drag-state hint, regardless of whether
        // the drop succeeds or refuses — `onDragEnd` would also
        // fire on a successful drop, but clearing here defends
        // against browser quirks where dragend doesn't fire after
        // a re-render triggered by the drop's state mutations.
        setDraggedLogicalNodeId(null);
        const nodeId = e.dataTransfer.getData(CTAD_LOGICAL_NODE_DRAG_KEY);
        if (!nodeId) return;
        const node = nodeById.get(nodeId);
        if (!node) return;
        if (node.parentId !== null) {
          setError(LABELS.promoteAlreadyPromoted);
          return;
        }
        if (view.getNodeType(parentId) === undefined) {
          setError(LABELS.errorQuadrantNotSeeded);
          return;
        }
        const probe = canCreateNode(
          node.type as AcwElementType,
          parentId,
          view,
        );
        if (!probe.ok) {
          setError(probe.reason);
          return;
        }
        onPromote(node, parentId);
      },
    [nodeById, onPromote, view],
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/ctad">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              {LABELS.backLink}
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <WorkflowIcon className="size-5" />
              {LABELS.pageTitle}
            </h1>
            <p className="text-xs text-muted-foreground max-w-2xl truncate">
              {LABELS.pageSubtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="text-[11px] text-muted-foreground border border-border/50 rounded px-2 py-1 max-w-[28rem] truncate"
            data-testid="ctad-design-workitem-chip"
            title={
              workItem
                ? `${LABELS.workItemChipPrefix} ${workItem.title}`
                : LABELS.workItemChipNone
            }
          >
            {org ? (
              <span className="opacity-70 mr-2">
                {LABELS.orgChipPrefix} {org.name}
              </span>
            ) : null}
            <span className="font-medium text-foreground">
              {LABELS.workItemChipPrefix}{" "}
              {workItem ? workItem.title : LABELS.workItemChipNone}
            </span>
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
                    setSelectedEdgeId(null);
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
        </div>
      </header>

      {connectMode !== null ? (
        <div
          className="border-b border-border/50 bg-muted/40 text-foreground px-4 py-2 text-xs flex items-center gap-3"
          role="status"
          data-testid="ctad-design-connect-banner"
        >
          <span>
            <strong>{LABELS.connectModeBannerPrefix}</strong> {connectMode.tileLabel}
            {" \u2014 "}
            {connectMode.fromNodeId === null
              ? LABELS.connectModeBannerHintIdle
              : LABELS.connectModeBannerHintArmed}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConnectMode(null)}
            data-testid="ctad-design-connect-cancel"
            className="gap-1 ml-auto"
          >
            <X className="size-3" />
            {LABELS.connectModeCancel}
          </Button>
        </div>
      ) : null}

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
        style={{ gridTemplateColumns: "16rem 1fr 22rem" }}
      >
        {/* ---------------- Palette + Logical Nodes panel ---------------- */}
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

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {LABELS.edgePaletteHeading}
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            {LABELS.edgePaletteHint}
          </p>
          <div className="space-y-1">
            {ctadEdgePaletteItemsByDiagramType(selectedDiagram).map((item) => (
              <EdgePaletteTile
                key={item.paletteKind}
                item={item}
                armed={connectMode?.tileKind === item.paletteKind}
                onArm={() => armEdgeTile(item)}
              />
            ))}
          </div>

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {LABELS.nodesHeading}
          </h2>
          <p className="text-xs text-muted-foreground mb-2">
            {LABELS.nodesDragHint}
          </p>
          {allLogicalNodes.length === 0 ? (
            <p className="text-xs text-muted-foreground">{LABELS.nodesEmpty}</p>
          ) : (
            <div className="space-y-3" data-testid="ctad-design-node-list">
              {ACW_DIAGRAM_TYPES.map((dt) => {
                const group = logicalNodesByDiagram.get(dt) ?? [];
                if (group.length === 0) return null;
                return (
                  <div key={dt} data-testid={`ctad-design-node-group-${dt}`}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      {CTAD_DIAGRAM_TYPE_LABEL[dt]}
                    </div>
                    <ul className="space-y-1">
                      {group.map((n) => {
                        const promotionLabel =
                          n.parentId === null
                            ? LABELS.nodesNotPromoted
                            : `${LABELS.nodesPromotedToPrefix} ${
                                PROMOTE_LABEL_BY_ID[n.parentId] ?? n.parentId
                              }`;
                        const selectThisRow = () => {
                          if (n.diagramType !== selectedDiagram) {
                            setSelectedDiagram(n.diagramType!);
                          }
                          setSelectedNodeId(n.id);
                          setSelectedEdgeId(null);
                        };
                        return (
                          <li key={n.id}>
                            <div
                              role="button"
                              tabIndex={0}
                              draggable={n.parentId === null}
                              onDragStart={(e) => {
                                if (n.parentId !== null) return;
                                e.dataTransfer.setData(
                                  CTAD_LOGICAL_NODE_DRAG_KEY,
                                  n.id,
                                );
                                e.dataTransfer.effectAllowed = "move";
                                setDraggedLogicalNodeId(n.id);
                              }}
                              onDragEnd={() => {
                                setDraggedLogicalNodeId(null);
                              }}
                              onClick={selectThisRow}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  selectThisRow();
                                }
                              }}
                              className={`w-full text-left text-xs px-2 py-1.5 rounded border cursor-grab ${
                                n.id === selectedNodeId
                                  ? "bg-foreground text-background border-foreground"
                                  : "border-border/50 hover:bg-muted/50"
                              }`}
                              data-testid={`ctad-design-node-list-${n.id}`}
                            >
                              <div className="font-medium truncate">
                                {n.label}
                              </div>
                              <div className="text-[10px] opacity-70 truncate">
                                {promotionLabel}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
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
            {canvasNodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-muted-foreground">
                  {LABELS.canvasEmpty}
                </p>
              </div>
            ) : null}

            {/* SVG overlay for edges. Positioned absolutely so it
                shares the same coordinate space as the cards. The
                container is non-interactive; each `<line>` opts back
                into pointer events for click-to-select. */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={CANVAS_MIN_WIDTH}
              height={CANVAS_MIN_HEIGHT}
              data-testid="ctad-design-edges"
            >
              {canvasEdges.map((edge) => {
                const a = nodeById.get(edge.fromId);
                const b = nodeById.get(edge.toId);
                if (!a || !b) return null;
                const x1 = a.x + CANVAS_NODE_WIDTH / 2;
                const y1 = a.y + CANVAS_NODE_HEIGHT / 2;
                const x2 = b.x + CANVAS_NODE_WIDTH / 2;
                const y2 = b.y + CANVAS_NODE_HEIGHT / 2;
                const isSelected = edge.id === selectedEdgeId;
                return (
                  <g key={edge.id}>
                    {/* Wide invisible hit-target for easier clicking */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onClick={() => {
                        setSelectedEdgeId(edge.id);
                        setSelectedNodeId(null);
                      }}
                      data-testid={`ctad-design-edge-hit-${edge.id}`}
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isSelected ? "currentColor" : "rgba(127,127,127,.55)"}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      style={{ pointerEvents: "none" }}
                      data-testid={`ctad-design-edge-${edge.id}`}
                    />
                  </g>
                );
              })}
              {/* Pending source highlight while in connect mode */}
              {connectMode !== null && connectMode.fromNodeId !== null
                ? (() => {
                    const from = nodeById.get(connectMode.fromNodeId);
                    if (!from) return null;
                    return (
                      <circle
                        cx={from.x + CANVAS_NODE_WIDTH / 2}
                        cy={from.y + CANVAS_NODE_HEIGHT / 2}
                        r={CANVAS_NODE_WIDTH / 2 + 6}
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                      />
                    );
                  })()
                : null}
            </svg>

            {canvasNodes.map((n) => (
              <CanvasCard
                key={n.id}
                node={n}
                isSelected={n.id === selectedNodeId}
                isPendingSource={
                  connectMode?.fromNodeId === n.id ? true : false
                }
                connectMode={connectMode !== null}
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
            {selectedEdge !== null ? (
              <EdgeDetails
                edge={selectedEdge}
                fromNode={nodeById.get(selectedEdge.fromId) ?? null}
                toNode={nodeById.get(selectedEdge.toId) ?? null}
                onDelete={() => onDeleteEdge(selectedEdge.id)}
              />
            ) : selectedNode === null ? (
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
            <p className="text-xs text-muted-foreground mb-2">
              {LABELS.promoteHint}
            </p>
            <PromotePanel
              activeNode={
                selectedNode !== null && selectedNode.parentId === null
                  ? selectedNode
                  : null
              }
              draggedNode={
                draggedLogicalNodeId !== null
                  ? (nodeById.get(draggedLogicalNodeId) ?? null)
                  : null
              }
              view={view}
              onPromote={onPromote}
              onDrop={handlePromoteDrop}
            />
            {selectedNode !== null && selectedNode.parentId !== null ? (
              <p className="text-xs text-muted-foreground mt-3">
                {LABELS.promoteAlreadyPromoted}
              </p>
            ) : null}
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

function EdgePaletteTile({
  item,
  armed,
  onArm,
}: {
  readonly item: CtadEdgePaletteItem;
  readonly armed: boolean;
  readonly onArm: () => void;
}) {
  const { Icon } = item;
  return (
    <button
      type="button"
      onClick={onArm}
      className={`w-full flex items-center gap-2 rounded border px-2 py-1.5 text-left ${
        armed
          ? "border-foreground bg-foreground text-background"
          : "border-border/50 bg-background hover:bg-muted/50"
      }`}
      data-testid={`ctad-edge-palette-tile-${item.paletteKind}`}
      title={item.subLabel}
      aria-pressed={armed}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{item.label}</div>
        <div className="text-[10px] opacity-70 truncate">{item.subLabel}</div>
      </div>
    </button>
  );
}

function CanvasCard({
  node,
  isSelected,
  isPendingSource,
  connectMode,
  onPointerDown,
}: {
  readonly node: AcwNode;
  readonly isSelected: boolean;
  readonly isPendingSource: boolean;
  readonly connectMode: boolean;
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const style: CSSProperties = {
    position: "absolute",
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: `${CANVAS_NODE_WIDTH}px`,
    height: `${CANVAS_NODE_HEIGHT}px`,
  };
  const ring = isPendingSource
    ? "border-foreground ring-2 ring-foreground/60"
    : isSelected
    ? "border-foreground ring-2 ring-foreground/30"
    : "border-border/70";
  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      className={`rounded-md border bg-background shadow-sm flex flex-col justify-center px-2 select-none touch-none ${
        connectMode ? "cursor-crosshair" : "cursor-move"
      } ${ring}`}
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
            if (
              labelDraft.trim() !== node.label &&
              labelDraft.trim().length > 0
            ) {
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

function EdgeDetails({
  edge,
  fromNode,
  toNode,
  onDelete,
}: {
  readonly edge: AcwEdge;
  readonly fromNode: AcwNode | null;
  readonly toNode: AcwNode | null;
  readonly onDelete: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="ctad-design-edge-details">
      <div className="text-xs font-semibold">{LABELS.edgeDetailsHeading}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {LABELS.edgeDetailsKind}
        </div>
        <div className="text-xs">{edge.kind}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {LABELS.propertyDiagramSubtype}
        </div>
        <div className="text-xs">{edge.diagramSubtype ?? "\u2014"}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {LABELS.edgeDetailsFrom}
        </div>
        <div className="text-xs truncate">{fromNode?.label ?? edge.fromId}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {LABELS.edgeDetailsTo}
        </div>
        <div className="text-xs truncate">{toNode?.label ?? edge.toId}</div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={onDelete}
        data-testid="ctad-design-edge-delete"
      >
        <X className="size-3" />
        {LABELS.edgeDetailsRemove}
      </Button>
    </div>
  );
}

function PromotePanel({
  activeNode,
  draggedNode,
  view,
  onPromote,
  onDrop,
}: {
  readonly activeNode: AcwNode | null;
  // The logical node currently being dragged from the "Logical
  // Nodes" panel (null when no drag is in flight). When set, each
  // quadrant runs the same pre-screen the drop handler will run,
  // and visually marks itself as "refuses" if the grammar will
  // reject (e.g. a System-typed node hovering over Business). This
  // gives up-front feedback during the drag rather than only after
  // the drop fires.
  readonly draggedNode: AcwNode | null;
  readonly view: ValidatorWorkspaceView;
  readonly onPromote: (node: AcwNode, parentId: string) => void;
  readonly onDrop: (parentId: string) => (e: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="ctad-design-promote">
      {PROMOTE_TARGETS.map((t) => {
        const { Icon } = t;
        // Click-fallback feasibility: only meaningful when a node
        // is actively selected. The drop path runs its own pre-
        // screen at drop time using the same `view`.
        const quadrantExists = view.getNodeType(t.id) !== undefined;
        const probe =
          activeNode === null || !quadrantExists
            ? ({ ok: false, reason: "" } as const)
            : canCreateNode(
                activeNode.type as AcwElementType,
                t.id,
                view,
              );
        const clickEnabled = activeNode !== null && probe.ok;
        // Drag-time feasibility: identical pre-screen but keyed on
        // the dragged node, not the selected node. When a drag is
        // in flight and this quadrant would refuse, we tag the
        // outer drop card with `data-drag-refuses="true"` and a
        // distinguishing border so the user sees it BEFORE drop.
        const dragProbe =
          draggedNode === null || !quadrantExists
            ? ({ ok: true, reason: "" } as const)
            : canCreateNode(
                draggedNode.type as AcwElementType,
                t.id,
                view,
              );
        const dragInFlight = draggedNode !== null;
        const dragRefuses = dragInFlight && !dragProbe.ok;
        const dragAccepts = dragInFlight && dragProbe.ok && quadrantExists;
        // Visual hint:
        //   - quadrant missing            → grey, click disabled
        //   - no active node              → neutral "Drop a logical node here" (drop still works)
        //   - active node + grammar ok    → "Drop a logical node here" (click also works)
        //   - active node + grammar fail  → "(grammar refuses)" (click disabled, drop pre-screen will refuse)
        const showRefusedHint =
          quadrantExists && activeNode !== null && !probe.ok;
        const dropAvailable = quadrantExists; // drop always available when seeded
        // Compose the outer card classes. When a drag is in flight,
        // accepting quadrants get a positive ring and refusing
        // quadrants get a muted/strikethrough-style appearance.
        // When no drag is in flight, fall back to the prior look.
        const cardClass = !dropAvailable
          ? "border-border/30 bg-muted/30"
          : dragRefuses
            ? "border-destructive/40 bg-muted/40 opacity-60"
            : dragAccepts
              ? "border-foreground/60 bg-background ring-1 ring-foreground/30"
              : "border-border/50 bg-background hover:bg-muted/50";
        return (
          <div
            key={t.id}
            onDragOver={(e) => {
              // Only allow drop when the quadrant exists AND the
              // grammar pre-screen accepts the dragged node. This
              // makes the cursor reflect refusal (`dropEffect =
              // "none"`) rather than promising a drop the handler
              // would then refuse.
              if (
                dropAvailable &&
                e.dataTransfer.types.includes(CTAD_LOGICAL_NODE_DRAG_KEY)
              ) {
                if (dragInFlight && !dragProbe.ok) {
                  e.dataTransfer.dropEffect = "none";
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={onDrop(t.id)}
            data-testid={`ctad-design-promote-drop-${t.id}`}
            data-drag-refuses={dragRefuses ? "true" : "false"}
            data-drag-accepts={dragAccepts ? "true" : "false"}
            className={`rounded border ${cardClass}`}
          >
            <button
              type="button"
              aria-disabled={!clickEnabled}
              onClick={() => {
                if (activeNode !== null && clickEnabled) {
                  onPromote(activeNode, t.id);
                }
              }}
              className={`w-full flex flex-col items-center gap-1 px-2 py-3 text-xs ${
                showRefusedHint
                  ? "text-muted-foreground cursor-not-allowed"
                  : clickEnabled
                    ? ""
                    : "text-foreground/80"
              }`}
              title={
                showRefusedHint
                  ? `${t.label} ${LABELS.promoteRefusedSuffix}`
                  : t.label
              }
              data-testid={`ctad-design-promote-${t.id}`}
            >
              <Icon className="size-5" />
              <span className="text-center leading-tight">{t.label}</span>
              <span className="text-[9px] uppercase tracking-wide opacity-70">
                {showRefusedHint
                  ? LABELS.promoteRefusedSuffix
                  : LABELS.promoteDropHere}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

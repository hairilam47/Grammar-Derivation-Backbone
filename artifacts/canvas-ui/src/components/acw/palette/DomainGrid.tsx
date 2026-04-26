// EAStudio Phase 1 — domain grid (Task #99 visual alignment).
//
// Renders a 2x2 layout of flat zones, one per immutable domain
// container. Each zone:
//   - accepts palette drops (`application/x-eastudio-palette-kind`)
//     routed through the validator-gated `createNode` store API
//     with `parentId` set to the domain container's stable id;
//   - renders the container's child nodes as flat cards (`.es-cnode`)
//     wrapping the prototype's icon + primary + secondary text
//     layout. Each card carries `data-acw-node-id` so the unified
//     `StudioEdgeOverlay` can pick up its bounding rect for edge
//     drawing without reaching into the store.
//
// Connect mode wiring: each card listens for clicks. With Connect
// mode on, the first click arms the lens-keyed pending-source
// slice; the second click on a *different* node fires the
// validator-gated `createEdge` (CONNECTS). Same-node click clears
// the pending source. Outside Connect mode a click simply selects
// the node so the right-side properties panel binds to it.
//
// Per-card `node-conn-btn` and `node-del` affordances mirror the
// prototype: the connect button arms the source for a single
// CONNECTS edge regardless of the current Connect-mode toggle, and
// the delete button removes the card via the validator-gated
// `deleteNode`. Both are surfaced on hover / selection only so the
// resting state matches the prototype's clean card surface.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - All structural mutations route through the validator-gated
//     store API; refusals publish through `acwRefusalChannel` so
//     the lens's inline banner surfaces them verbatim.
//   - Zone accent colours and card border-left tints are pure UI
//     styling — no traffic-light, no judgement, no animation.
import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, X, Zap } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_DOMAIN_LABEL,
  ACW_DOMAIN_ICON,
  ACW_PALETTE,
  paletteItemByKind,
  paletteItemByLabel,
  type PaletteItem,
} from "@/acw/palette/paletteRegistry";
import {
  ACW_DOMAIN_CONTAINERS,
  findDomainContainerById,
} from "@/acw/palette/domainContainerSeed";
import { ACW_PALETTE_DATA_KEY } from "./PalettePanel";
import { StudioEdgeOverlay } from "@/components/acw/studio/StudioEdgeOverlay";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  type AcwNode,
} from "@/acw/acwStore";
import { publishRefusal } from "@/acw/acwRefusalChannel";
import {
  getConnectMode,
  getConnectPendingSource,
  getSelectedNodeId,
  setConnectPendingSource,
  setSelectedNodeId,
  getSelectedEdgeId,
  setSelectedEdgeId,
  setCurrentDomain,
  subscribeViewState,
} from "@/acw/acwViewState";
import type { AcwDomainTag } from "@/acw/acwGrammar";

const SEAL_LABEL = "Sealed";
const QUADRANT_HINT = "Drop a palette tile here.";
const CONNECT_HINT = "Connect from this node";
const DELETE_HINT = "Delete";

assertAllAcwPlaceholderLanguage([
  SEAL_LABEL,
  QUADRANT_HINT,
  CONNECT_HINT,
  DELETE_HINT,
]);

export interface DomainGridProps {
  readonly lensId: string;
}

export function DomainGrid({ lensId }: DomainGridProps) {
  const workspace = useAcwWorkspace();
  // Re-read view-state on subscriber tick so highlighting tracks
  // the active domain and the unified-overlay's selected-edge slice.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;
  const selectedEdgeId = getSelectedEdgeId(lensId);
  const selectedNodeId = getSelectedNodeId(lensId);
  const connectOn = getConnectMode(lensId);
  const pendingSource = getConnectPendingSource(lensId);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, AcwNode>();
    for (const node of workspace.structureGraph.nodes) m.set(node.id, node);
    return m;
  }, [workspace.structureGraph.nodes]);

  // Edge selection / delete handlers, lifted to grid scope so the
  // single overlay drives them uniformly. Toggle semantics: clicking
  // the already-selected edge dismisses it; selecting an edge clears
  // any standing node selection so only one of {node, edge} is
  // selected at a time per page.
  const onEdgeOverlayClick = (id: string) => {
    if (selectedEdgeId === id) {
      setSelectedEdgeId(lensId, null);
    } else {
      setSelectedEdgeId(lensId, id);
      setSelectedNodeId(lensId, null);
    }
  };
  const onEdgeOverlayDelete = (id: string) => {
    const r = deleteEdge(id);
    setSelectedEdgeId(lensId, null);
    if (!r.ok) publishRefusal(r.reason);
  };

  // Click on a node card. Connect mode + connect-button click both
  // route through this so source-then-destination semantics live in
  // one place.
  const onNodeClick = (
    id: string,
    explicitConnect: boolean,
  ) => {
    if (explicitConnect || connectOn) {
      if (pendingSource === null) {
        setConnectPendingSource(lensId, id);
        return;
      }
      if (pendingSource === id) {
        setConnectPendingSource(lensId, null);
        return;
      }
      const r = createEdge({
        kind: "CONNECTS",
        fromId: pendingSource,
        toId: id,
      });
      setConnectPendingSource(lensId, null);
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    // Idle click: select the node so the right-side panel opens.
    if (selectedNodeId === id) {
      setSelectedNodeId(lensId, null);
    } else {
      setSelectedNodeId(lensId, id);
      setSelectedEdgeId(lensId, null);
    }
  };

  const onNodeDelete = (id: string) => {
    if (selectedNodeId === id) setSelectedNodeId(lensId, null);
    if (pendingSource === id) setConnectPendingSource(lensId, null);
    const r = deleteNode(id);
    if (!r.ok) publishRefusal(r.reason);
  };

  return (
    <div className="es-canvas-wrap">
      <div
        ref={gridRef}
        data-testid="acw-studio-domain-grid"
        className="es-zones"
        style={{ position: "relative" }}
      >
        {ACW_DOMAIN_CONTAINERS.map((spec) => {
          const container = findDomainContainerById(spec.id);
          // Per Task #99 step 6: each zone renders every leaf
          // descendant of its domain container as a flat list,
          // matching the prototype. Walk the parent chain for
          // every non-container node and include those whose
          // ancestry hits this domain container. Sealed domain
          // containers themselves are excluded.
          const allNodes = workspace.structureGraph.nodes;
          const nodeById = new Map(allNodes.map((n) => [n.id, n] as const));
          const descendants = allNodes.filter((n) => {
            if (n.id === spec.id) return false;
            if (n.isDomainContainer === true) return false;
            let cursor: string | null = n.parentId;
            let guard = 0;
            while (cursor !== null && guard < 1024) {
              if (cursor === spec.id) return true;
              const parent = nodeById.get(cursor);
              if (parent === undefined) return false;
              cursor = parent.parentId;
              guard += 1;
            }
            return false;
          });
          return (
            <Zone
              key={spec.id}
              lensId={lensId}
              domain={spec.domain}
              containerId={spec.id}
              containerNode={container}
              children={descendants}
              onNodeClick={onNodeClick}
              onNodeDelete={onNodeDelete}
              selectedNodeId={selectedNodeId}
              pendingSource={pendingSource}
            />
          );
        })}
        <StudioEdgeOverlay
          gridRef={gridRef}
          edges={workspace.structureGraph.edges}
          selectedEdgeId={selectedEdgeId}
          pendingSourceId={pendingSource}
          onEdgeClick={onEdgeOverlayClick}
          onEdgeDelete={onEdgeOverlayDelete}
        />
      </div>
    </div>
  );
}

interface ZoneProps {
  readonly lensId: string;
  readonly domain: AcwDomainTag;
  readonly containerId: string;
  readonly containerNode: AcwNode | undefined;
  readonly children: readonly AcwNode[];
  readonly onNodeClick: (id: string, explicitConnect: boolean) => void;
  readonly onNodeDelete: (id: string) => void;
  readonly selectedNodeId: string | null;
  readonly pendingSource: string | null;
}

function Zone(props: ZoneProps) {
  const {
    lensId,
    domain,
    containerId,
    containerNode,
    children,
    onNodeClick,
    onNodeDelete,
    selectedNodeId,
    pendingSource,
  } = props;
  const Icon = ACW_DOMAIN_ICON[domain];
  const [isOver, setIsOver] = useState(false);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(ACW_PALETTE_DATA_KEY)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isOver) setIsOver(true);
  };
  const onDragLeave = () => {
    if (isOver) setIsOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const paletteKind = e.dataTransfer.getData(ACW_PALETTE_DATA_KEY);
    if (paletteKind === "") return;
    e.preventDefault();
    setIsOver(false);
    if (containerNode === undefined) {
      publishRefusal(
        "The domain container is not present. Reload the workspace to re-seed it.",
      );
      return;
    }
    setCurrentDomain(lensId, domain);

    const item = paletteItemByKind(paletteKind);
    if (item === undefined) {
      publishRefusal(`The palette item "${paletteKind}" is not registered.`);
      return;
    }
    if (item.domain !== domain) {
      publishRefusal(
        `The palette item "${item.label}" belongs to the ${item.domain} domain and is not permitted inside the ${domain} domain quadrant.`,
      );
      return;
    }
    const r = createNode({
      type: item.elementType,
      parentId: containerId,
      label: item.label,
      domainTag: domain,
    });
    if (!r.ok) publishRefusal(r.reason);
  };

  return (
    <section
      role="region"
      aria-label={ACW_DOMAIN_LABEL[domain]}
      data-testid={`acw-studio-quadrant-${domain}`}
      data-domain={domain}
      data-container-id={containerId}
      data-drop-active={isOver ? "true" : "false"}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="es-zone"
    >
      <header className="es-zone-head">
        <div className="es-zone-title">
          <Icon className="w-3.5 h-3.5" />
          <span>{ACW_DOMAIN_LABEL[domain]}</span>
        </div>
        {/* Per Task #99 step 6, the zone header carries a live
            descendant count badge (matching the prototype's
            `.zone-badge` element). The container itself remains
            sealed; the lock pictogram moves to a tooltip on the
            badge so the constraint is still discoverable without
            crowding the title row. */}
        <span
          className="es-zone-badge"
          data-testid={`acw-studio-quadrant-badge-${domain}`}
          data-count={children.length}
          title={SEAL_LABEL}
        >
          <Lock className="w-3 h-3" aria-hidden="true" />
          <span>{children.length}</span>
        </span>
      </header>
      <div
        className="es-zone-nodes"
        data-testid={`acw-studio-quadrant-body-${domain}`}
      >
        {children.length === 0 ? (
          <p className="es-zone-empty">{QUADRANT_HINT}</p>
        ) : (
          children.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              domain={domain}
              isSelected={selectedNodeId === node.id}
              isPendingSource={pendingSource === node.id}
              onClick={() => onNodeClick(node.id, false)}
              onConnect={() => onNodeClick(node.id, true)}
              onDelete={() => onNodeDelete(node.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

interface NodeCardProps {
  readonly node: AcwNode;
  readonly domain: AcwDomainTag;
  readonly isSelected: boolean;
  readonly isPendingSource: boolean;
  readonly onClick: () => void;
  readonly onConnect: () => void;
  readonly onDelete: () => void;
}

// Resolve which palette tile (if any) was used to materialise this
// node. Used for the icon and the secondary `subLabel` line; falls
// back to the first tile of the same domain so a node materialised
// outside the palette still gets a sensible icon and a domain-level
// sub-line rather than rendering the literal element type token.
function resolveTile(node: AcwNode, domain: AcwDomainTag): PaletteItem {
  const byLabel = paletteItemByLabel(node.label);
  if (byLabel !== undefined && byLabel.domain === domain) return byLabel;
  const fallback = ACW_PALETTE.find((p) => p.domain === domain);
  // ACW_PALETTE always contains at least one tile per domain; the
  // module-load assertion in paletteRegistry guarantees this.
  return fallback as PaletteItem;
}

function NodeCard(p: NodeCardProps) {
  const tile = resolveTile(p.node, p.domain);
  const { Icon } = tile;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        p.onClick();
      }}
      onKeyDown={(e) => {
        // role="button" elements must respond to Enter and Space
        // the way a native <button> would. preventDefault on Space
        // stops the page from scrolling when a card is focused.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          p.onClick();
        }
      }}
      data-testid={`acw-studio-node-${p.node.id}`}
      data-acw-node-id={p.node.id}
      data-domain={p.domain}
      data-selected={p.isSelected ? "true" : "false"}
      data-pending-source={p.isPendingSource ? "true" : "false"}
      className="es-cnode"
    >
      <span className="es-cnode-icon" aria-hidden="true">
        <Icon className="w-3 h-3" />
      </span>
      <span className="es-cnode-text">
        <span className="es-cnode-label">{p.node.label}</span>
        <span className="es-cnode-sub es-mono">{tile.subLabel}</span>
      </span>
      <span className="es-cnode-actions">
        <button
          type="button"
          className="es-cnode-btn"
          onClick={(e) => {
            e.stopPropagation();
            p.onConnect();
          }}
          aria-label={CONNECT_HINT}
          title={CONNECT_HINT}
          data-testid={`acw-studio-node-${p.node.id}-connect`}
        >
          <Zap className="w-3 h-3" />
        </button>
        <button
          type="button"
          className="es-cnode-btn"
          data-tone="danger"
          onClick={(e) => {
            e.stopPropagation();
            p.onDelete();
          }}
          aria-label={DELETE_HINT}
          title={DELETE_HINT}
          data-testid={`acw-studio-node-${p.node.id}-delete`}
        >
          <X className="w-3 h-3" />
        </button>
      </span>
    </div>
  );
}

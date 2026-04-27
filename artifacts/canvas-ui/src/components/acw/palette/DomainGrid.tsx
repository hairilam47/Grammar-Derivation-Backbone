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
// Per-card `node-conn-btn` affordance mirrors the prototype: the
// connect button arms the source for a single CONNECTS edge
// regardless of the current Connect-mode toggle. The prototype's
// per-card delete button is intentionally omitted in this
// alignment pass — node deletion would require a new store
// mutation that the task scope explicitly forbids; the user
// removes nodes via the workspace-wide Clear action in the top
// bar instead.
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
import { ArrowLeftRight, Lock } from "lucide-react";
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
  getActiveLod,
  getShowOrgOverlay,
} from "@/acw/acwViewState";
import { isVisibleAtLod, type AcwDomainTag } from "@/acw/acwGrammar";
import { NodeContextMenu } from "@/components/acw/studio/NodeContextMenu";
import { cssForOu } from "@/acw/orgUnits/ouHue";
import { getOu, subscribeOus } from "@/acw/orgUnits/ouStore";

const SEAL_LABEL = "Sealed";
const QUADRANT_HINT = "Drop a palette tile here.";
const CONNECT_HINT = "Connect from this node";
const EDGE_DELETE_CONFIRM = "Delete this connection?";
// Phase 3 — fragment used to compose the OU-augmented aria-label
// (e.g. `"Postgres (organisational unit: Platform Tribe)"`).
// Asserted against the placeholder vocabulary so the parenthetical
// phrasing required by the brief cannot drift.
const OU_ARIA_PREFIX = "(organisational unit:";

assertAllAcwPlaceholderLanguage([
  SEAL_LABEL,
  QUADRANT_HINT,
  CONNECT_HINT,
  EDGE_DELETE_CONFIRM,
  OU_ARIA_PREFIX,
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
  // Re-render when OU registry mutates (Add / Remove / rename) so
  // the overlay tint and aria augmentation track the current store.
  const [ouTick, setOuTick] = useState(0);
  useEffect(() => subscribeOus(() => setOuTick((t) => t + 1)), []);
  void ouTick;
  // Phase 3 OU overlay slice — when ON we tint each NodeCard whose
  // `organisationalUnitId` is set with `cssForOu(id)` (S=35%, L=22%).
  // The slice is per-lens; the toggle lives in StudioTopBar.
  const showOrgOverlay = getShowOrgOverlay(lensId);
  // Phase 3 right-click "Swap technology" menu — host-owned popover
  // state. The menu is portal-positioned at the cursor coordinates;
  // outside-click and Escape both dismiss. The host owns the state
  // so the menu component itself stays a presentational leaf and
  // never reaches into the view-state singleton.
  const [ctxMenu, setCtxMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (ctxMenu === null) return;
    const onDocClick = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);
  const selectedEdgeId = getSelectedEdgeId(lensId);
  const selectedNodeId = getSelectedNodeId(lensId);
  const connectOn = getConnectMode(lensId);
  const pendingSource = getConnectPendingSource(lensId);
  // EAStudio Phase 2 (LoS framework) — current Level of Specification
  // for this lens. Used below to drop nodes whose declared `lodRange`
  // does not include the active level (e.g. L3-only generated nodes
  // must not appear in the L1 / L2 flat grids).
  const activeLod = getActiveLod(lensId);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, AcwNode>();
    for (const node of workspace.structureGraph.nodes) m.set(node.id, node);
    return m;
  }, [workspace.structureGraph.nodes]);

  // Edge click handler — per Task #99 step 7 the prototype binds a
  // click on an edge path to a confirm dialog that deletes the
  // edge through the validator. We route the destructive call
  // exclusively through the validator-gated `deleteEdge` store
  // mutation; the dialog is the only confirm UX (no inline SVG
  // pill).
  const onEdgeOverlayClick = (id: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(EDGE_DELETE_CONFIRM);
      if (!ok) return;
    }
    const r = deleteEdge(id);
    setSelectedEdgeId(lensId, null);
    if (!r.ok) publishRefusal(r.reason);
  };
  // Retained for the overlay's existing `onEdgeDelete` API surface;
  // the confirm dialog above is the canonical entry point now, so
  // this just forwards through the validator.
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
            // EAStudio Phase 2 (LoS framework) — drop nodes whose
            // declared `lodRange` does not include the active LoS.
            // L3-only generated nodes (`lodRange: [3, 3]`) must
            // never leak into the L1 / L2 flat grids; legacy nodes
            // without a `lodRange` always pass.
            if (!isVisibleAtLod(n, activeLod)) return false;
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
              selectedNodeId={selectedNodeId}
              pendingSource={pendingSource}
              showOrgOverlay={showOrgOverlay}
              onNodeContextMenu={(id, x, y) =>
                setCtxMenu({ nodeId: id, x, y })
              }
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
      {/*
        Phase 3 right-click "Swap technology" menu — anchored at the
        cursor coordinates the host captured. The host listens for
        outside-click and Escape and clears `ctxMenu`; the menu
        component itself is a presentational leaf.
      */}
      {ctxMenu !== null
        ? (() => {
            const node = workspace.structureGraph.nodes.find(
              (n) => n.id === ctxMenu.nodeId,
            );
            if (node === undefined) return null;
            return (
              <NodeContextMenu
                node={node}
                x={ctxMenu.x}
                y={ctxMenu.y}
                activeLod={activeLod}
                onClose={() => setCtxMenu(null)}
              />
            );
          })()
        : null}
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
  readonly selectedNodeId: string | null;
  readonly pendingSource: string | null;
  readonly showOrgOverlay: boolean;
  readonly onNodeContextMenu: (
    nodeId: string,
    x: number,
    y: number,
  ) => void;
}

function Zone(props: ZoneProps) {
  const {
    lensId,
    domain,
    containerId,
    containerNode,
    children,
    onNodeClick,
    selectedNodeId,
    pendingSource,
    showOrgOverlay,
    onNodeContextMenu,
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
    // EAStudio Path B Phase 1 (Task #113) — forward the palette
    // tile's default semantic bindings onto the new node when the
    // tile declares them. Spread is used so an undefined default
    // stays absent on the request (and therefore on the persisted
    // node), preserving byte-identical shape for tiles that do not
    // ship a binding.
    const r = createNode({
      type: item.elementType,
      parentId: containerId,
      label: item.label,
      domainTag: domain,
      ...(item.boundTechnologyCategory !== undefined
        ? { boundTechnologyCategory: item.boundTechnologyCategory }
        : {}),
      ...(item.boundParam !== undefined
        ? { boundParam: item.boundParam }
        : {}),
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
          children.map((node) => {
            const ouId = node.organisationalUnitId;
            const ouName =
              ouId !== undefined ? getOu(ouId)?.name ?? null : null;
            // Overlay tint is applied only when (a) the per-lens
            // overlay slice is ON and (b) the node carries an OU id
            // and (c) the id resolves to a present unit. A dangling
            // id (the reading validator already rejects this on
            // load, but a removed-then-undo race could theoretically
            // surface one) silently skips tinting.
            const overlayCss =
              showOrgOverlay && ouId !== undefined && ouName !== null
                ? cssForOu(ouId)
                : null;
            return (
              <NodeCard
                key={node.id}
                node={node}
                domain={domain}
                isSelected={selectedNodeId === node.id}
                isPendingSource={pendingSource === node.id}
                overlayCss={overlayCss}
                ouName={ouName}
                onClick={() => onNodeClick(node.id, false)}
                onConnect={() => onNodeClick(node.id, true)}
                onContextMenu={(x, y) => onNodeContextMenu(node.id, x, y)}
                hasBoundParam={node.boundParam !== undefined}
              />
            );
          })
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
  // Phase 3 OU overlay — `null` means no tint (overlay off, or
  // node has no OU bound). When set, the host has already resolved
  // it through `cssForOu` (S=35%, L=22%, categorical-only).
  readonly overlayCss: string | null;
  // Phase 3 OU overlay — display name of the bound unit (when
  // resolvable). Used to augment the card's aria-label so screen
  // readers announce the assignment without depending on colour.
  readonly ouName: string | null;
  readonly onClick: () => void;
  readonly onConnect: () => void;
  // Phase 3 right-click "Swap technology" menu — receives the
  // viewport coordinates the host should anchor the popover at.
  readonly onContextMenu: (x: number, y: number) => void;
  // Phase 3 — gate the swap menu to nodes that actually carry a
  // CTAD binding. For unbound nodes the host releases the native
  // browser context menu rather than presenting an empty popover.
  readonly hasBoundParam: boolean;
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
  // ARIA augmentation for the OU overlay. Colour is categorical so
  // the assistive label MUST carry the unit name independently —
  // never rely on hue to convey membership. The augmentation is
  // applied ONLY when the overlay is actually rendered (overlayCss
  // !== null) so an OU bound to a node while the overlay is OFF
  // does not leak through assistive tech in a context where no
  // visual signal accompanies it. Phrasing is parenthetical so
  // screen readers announce the node label first, then the
  // membership clause.
  const ariaLabel =
    p.overlayCss !== null && p.ouName !== null
      ? `${p.node.label} (organisational unit: ${p.ouName})`
      : undefined;
  // The categorical hue lives on backgroundColor; CSS handles
  // hover / selected affordances on its own classes. We do NOT
  // touch foreground colour — the L=22% guarantees AA contrast
  // against the inherited near-white text without further
  // computation.
  const cardStyle =
    p.overlayCss !== null ? { backgroundColor: p.overlayCss } : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      style={cardStyle}
      onClick={(e) => {
        e.stopPropagation();
        p.onClick();
      }}
      onContextMenu={(e) => {
        // Phase 3: only intercept the native context menu when the
        // node carries a CTAD binding — there is nothing to swap on
        // an unbound node, so opening an empty popover would be a
        // dead-end UX. For unbound nodes we let the browser show
        // its default menu (or the host's parent handler take over).
        if (!p.hasBoundParam) return;
        e.preventDefault();
        e.stopPropagation();
        p.onContextMenu(e.clientX, e.clientY);
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
      data-ou-id={p.node.organisationalUnitId ?? ""}
      data-ou-overlay={p.overlayCss !== null ? "true" : "false"}
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
          <ArrowLeftRight className="w-3 h-3" />
        </button>
      </span>
    </div>
  );
}

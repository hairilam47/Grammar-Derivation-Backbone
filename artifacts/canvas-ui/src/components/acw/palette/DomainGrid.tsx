// EAStudio Phase 1 — domain grid (2x2 quadrant layout).
//
// Renders one quadrant per immutable domain container. Each
// quadrant embeds an `InteractiveCanvas2D` instance — the same
// validator-gated 2D primitive used by the other ACW lenses — so
// drag-to-move, drag-to-reparent, marquee-select, group, and
// collapse / expand all work in EAStudio without re-implementing
// any rendering primitive.
//
// On top of `InteractiveCanvas2D`, a thin wrapping div provides:
//   1. Palette drop intake. The wrapper accepts the
//      `application/x-eastudio-palette-kind` dataTransfer payload
//      and routes it through `createNode` with `parentId` set to
//      the quadrant's *current focus* — i.e. the container the
//      user has drilled down into. Two refusal layers run before
//      the store call: (a) UI-level domain alignment (the dropped
//      tile's `domain` must match the quadrant's `domain`); and
//      (b) the strict Business chain (a Business Process tile is
//      refused unless the current focus is an OrgUnit-tier Zone —
//      i.e. a Zone whose parent is itself a Zone, mirroring the
//      Department → OrgUnit → BusinessProcess hierarchy from the
//      spec). Both refusals publish through `acwRefusalChannel`.
//   2. A breadcrumb header showing the drill-down path. Clicking
//      a crumb pops back to that depth. The breadcrumb never
//      mutates the workspace; it only changes the per-quadrant
//      focus state held in local React state.
//
// `InteractiveCanvas2D` itself owns the drag-to-reparent path
// (which calls `updateNodeParent` and refuses through the same
// channel), so cross-quadrant card moves do not need a separate
// handler in this file — a Business OrgUnit dragged onto a
// Technology compute-node is gated by the grammar inside the
// existing 2D primitive.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Quadrant accent colours are pure UI styling — no traffic-
//     light, no judgement, no animation.
import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_DOMAIN_LABEL,
  ACW_DOMAIN_ACCENT,
  ACW_DOMAIN_ICON,
  paletteItemByKind,
} from "@/acw/palette/paletteRegistry";
import {
  ACW_DOMAIN_CONTAINERS,
  findDomainContainerById,
} from "@/acw/palette/domainContainerSeed";
import { ACW_PALETTE_DATA_KEY } from "./PalettePanel";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import {
  createNode,
  type AcwNode,
} from "@/acw/acwStore";
import { publishRefusal } from "@/acw/acwRefusalChannel";
import {
  getCurrentDomain,
  setCurrentDomain,
  subscribeViewState,
} from "@/acw/acwViewState";
import type { AcwDomainTag, AcwElementType } from "@/acw/acwGrammar";
import { InteractiveCanvas2D } from "@/components/acw/InteractiveCanvas2D";

const SEAL_LABEL = "Sealed";
const ROOT_CRUMB_LABEL = "Root";
const QUADRANT_HINT = "Drop a palette tile here.";

assertAllAcwPlaceholderLanguage([SEAL_LABEL, ROOT_CRUMB_LABEL, QUADRANT_HINT]);

// Per-quadrant studio lens-id prefix. Each quadrant's
// `InteractiveCanvas2D` runs under its own lens id so the
// collapse / view-state slices stay isolated per domain.
const STUDIO_LENS_ID_PREFIX = "studio-";

export interface DomainGridProps {
  readonly lensId: string;
}

export function DomainGrid({ lensId }: DomainGridProps) {
  const workspace = useAcwWorkspace();
  // Re-read view-state on subscriber tick so highlighting tracks
  // the active domain.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;
  const activeDomain = getCurrentDomain(lensId);

  // Build a single id→node lookup so each quadrant can resolve
  // its container's descendants and so the drop wrappers can
  // classify focus depth (Department-tier vs OrgUnit-tier) for
  // the strict Business chain refusal.
  const nodeById = useMemo(() => {
    const m = new Map<string, AcwNode>();
    for (const node of workspace.structureGraph.nodes) m.set(node.id, node);
    return m;
  }, [workspace.structureGraph.nodes]);

  return (
    <div
      data-testid="acw-studio-domain-grid"
      className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-auto"
    >
      {ACW_DOMAIN_CONTAINERS.map((spec) => {
        const container = findDomainContainerById(spec.id);
        return (
          <Quadrant
            key={spec.id}
            lensId={lensId}
            domain={spec.domain}
            containerId={spec.id}
            containerNode={container}
            nodeById={nodeById}
            allNodes={workspace.structureGraph.nodes}
            isActive={activeDomain === spec.domain}
            onActivate={() => setCurrentDomain(lensId, spec.domain)}
          />
        );
      })}
    </div>
  );
}

interface QuadrantProps {
  readonly lensId: string;
  readonly domain: AcwDomainTag;
  readonly containerId: string;
  readonly containerNode: AcwNode | undefined;
  readonly nodeById: ReadonlyMap<string, AcwNode>;
  readonly allNodes: readonly AcwNode[];
  readonly isActive: boolean;
  readonly onActivate: () => void;
}

function Quadrant(props: QuadrantProps) {
  const {
    lensId,
    domain,
    containerId,
    containerNode,
    nodeById,
    allNodes,
    isActive,
    onActivate,
  } = props;
  const Icon = ACW_DOMAIN_ICON[domain];
  const accent = ACW_DOMAIN_ACCENT[domain];

  // Per-quadrant drill-down focus. Defaults to the sealed
  // container; double-clicking a child node inside the embedded
  // 2D canvas pushes that node onto the focus path.
  const [focusPath, setFocusPath] = useState<readonly string[]>([
    containerId,
  ]);
  const focusedParentId = focusPath[focusPath.length - 1] ?? containerId;
  const focusedNode = nodeById.get(focusedParentId);

  // If the focused node has been removed (e.g. because the user
  // navigated away or a parent was collapsed), pop back to the
  // sealed container so the canvas stays consistent with the
  // store.
  useEffect(() => {
    if (focusedParentId !== containerId && !nodeById.has(focusedParentId)) {
      setFocusPath([containerId]);
    }
  }, [containerId, focusedParentId, nodeById]);

  const [isOver, setIsOver] = useState(false);

  // Classify the current focus for the strict Business chain. We
  // only need this in the Business quadrant; other domains accept
  // System under any Zone per the standard grammar. Returns:
  //   - "container"  : the sealed BusinessEntity quadrant root
  //   - "department" : a Zone whose parent is the BusinessEntity
  //                    (Department-tier — System refused here)
  //   - "orgunit"    : a Zone whose parent is itself a Zone
  //                    (OrgUnit-tier or deeper — System permitted)
  //   - "other"      : focus is on a non-Zone, non-container node
  //                    (don't apply business-chain extra refusal;
  //                    the grammar will gate normally)
  const classifyBusinessFocus = (): "container" | "department" | "orgunit" | "other" => {
    if (focusedParentId === containerId) return "container";
    const node = nodeById.get(focusedParentId);
    if (node === undefined) return "other";
    if (node.type !== "Zone") return "other";
    if (node.parentId === null) return "other";
    const parent = nodeById.get(node.parentId);
    if (parent === undefined) return "other";
    if (parent.type === "BusinessEntity") return "department";
    if (parent.type === "Zone") return "orgunit";
    return "other";
  };

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
    onActivate();

    const item = paletteItemByKind(paletteKind);
    if (item === undefined) {
      publishRefusal(
        `The palette item "${paletteKind}" is not registered.`,
      );
      return;
    }
    // (a) Domain alignment refusal — the tile's domain must match
    // the quadrant's domain.
    if (item.domain !== domain) {
      publishRefusal(
        `The palette item "${item.label}" belongs to the ${item.domain} domain and is not permitted inside the ${domain} domain quadrant.`,
      );
      return;
    }
    // (b) Strict Business chain — a Business Process (System) is
    // permitted only when the current focus is an OrgUnit-tier
    // Zone. The grammar permits System under any Zone (used by
    // the Application quadrant for Application-in-Zone), so this
    // additional refusal is applied at the UI layer for the
    // Business domain only and references the spec chain
    // explicitly in its reason text.
    if (
      domain === "business" &&
      (item.elementType as AcwElementType) === "System"
    ) {
      const tier = classifyBusinessFocus();
      if (tier !== "orgunit") {
        publishRefusal(
          'A Business process is not permitted directly inside the Business container or a Department-tier Zone. Drill into an Org unit first; the chain is BusinessEntity → Department → Org unit → Business process.',
        );
        return;
      }
    }

    const r = createNode({
      type: item.elementType,
      parentId: focusedParentId,
      label: item.label,
      domainTag: domain,
    });
    if (!r.ok) publishRefusal(r.reason);
  };

  // Compose the breadcrumb labels by walking the focus path back
  // through `nodeById`. The first entry is the sealed container
  // (label "Root"); every subsequent entry is the node's label.
  const breadcrumbs: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
  }> = focusPath.map((id, i) => {
    if (i === 0) return { id, label: ROOT_CRUMB_LABEL };
    const node = nodeById.get(id);
    return { id, label: node?.label ?? id };
  });

  // The InteractiveCanvas2D primitive needs `nodes` to include
  // every node it might surface or drill into. Passing
  // `allNodes` keeps the lens generic — the canvas will filter
  // to the focused-parent's children internally.
  const headerAccent = isActive ? accent : "border-border/50 text-muted-foreground";

  // Restrict the in-canvas Group affordance to container types
  // that fit this quadrant's chain. Grammar still owns final
  // legality; this just trims the UI menu.
  const permitContainerType = (t: AcwElementType): boolean => {
    if (domain === "technology") return t === "Zone" || t === "ComputeNode";
    return t === "Zone";
  };

  const canvasLensId = `${STUDIO_LENS_ID_PREFIX}${domain}`;

  return (
    <section
      role="region"
      aria-label={ACW_DOMAIN_LABEL[domain]}
      data-testid={`acw-studio-quadrant-${domain}`}
      data-domain={domain}
      data-container-id={containerId}
      data-active={isActive ? "true" : "false"}
      data-drop-active={isOver ? "true" : "false"}
      data-focused-parent={focusedParentId}
      onClick={onActivate}
      className={`relative flex flex-col rounded border ${
        isOver ? "border-primary/70 bg-primary/5" : "border-border/40 bg-card/30"
      } min-h-[260px] transition-colors`}
    >
      <header
        className={`flex items-center justify-between px-3 py-2 border-b border-border/30 rounded-t ${headerAccent}`}
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest">
          <Icon className="w-4 h-4" />
          <span>{ACW_DOMAIN_LABEL[domain]}</span>
        </div>
        <div
          className="flex items-center gap-1 text-[9px] uppercase tracking-widest opacity-70"
          title={SEAL_LABEL}
        >
          <Lock className="w-3 h-3" />
          <span>{SEAL_LABEL}</span>
        </div>
      </header>

      {/* Breadcrumb — always rendered so the focus depth is
          visible even when the path is just the sealed root. */}
      <nav
        className="flex items-center flex-wrap gap-1 px-3 py-1 border-b border-border/20 text-[10px] font-mono text-muted-foreground"
        data-testid={`acw-studio-quadrant-crumbs-${domain}`}
      >
        {breadcrumbs.map((c, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={c.id} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="w-3 h-3 opacity-50" /> : null}
              {isLast ? (
                <span
                  data-testid={`acw-studio-crumb-current-${domain}`}
                  className="text-foreground"
                >
                  {c.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFocusPath((p) => p.slice(0, i + 1));
                  }}
                  className="hover:text-foreground underline-offset-2 hover:underline"
                >
                  {c.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {/* Embedded 2D canvas + palette drop wrapper. The wrapper
          owns the palette drop intake; the canvas itself owns
          drag-to-move / reparent / collapse / select. */}
      <div
        className="flex-1"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid={`acw-studio-quadrant-body-${domain}`}
      >
        <InteractiveCanvas2D
          lensId={canvasLensId}
          nodes={allNodes}
          edges={[]}
          focusedParentId={focusedParentId}
          onDrillDown={(nodeId) => {
            // Push the drilled-into node onto the focus path,
            // *only* if the node is a descendant of this
            // quadrant's container; defensive in case the canvas
            // somehow surfaces a node from elsewhere.
            const target = nodeById.get(nodeId);
            if (target === undefined) return;
            // Walk ancestors until we hit either this quadrant's
            // container (accept) or the workspace root (refuse).
            let cursor: AcwNode | undefined = target;
            let guard = 0;
            while (cursor !== undefined && guard < 1024) {
              if (cursor.parentId === containerId || cursor.id === containerId) {
                setFocusPath((p) => [...p, nodeId]);
                return;
              }
              if (cursor.parentId === null) return;
              cursor = nodeById.get(cursor.parentId);
              guard += 1;
            }
          }}
          emptyHint={focusedNode === undefined || focusedParentId === containerId
            ? QUADRANT_HINT
            : undefined}
          height="100%"
          testId={`acw-studio-canvas-${domain}`}
          permitContainerType={permitContainerType}
        />
      </div>
    </section>
  );
}

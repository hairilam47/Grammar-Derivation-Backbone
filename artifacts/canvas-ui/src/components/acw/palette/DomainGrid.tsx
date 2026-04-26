// EAStudio Phase 1 — domain grid (2x2 quadrant layout).
//
// Renders one quadrant per immutable domain container. Each
// quadrant lists the depth-1 children of its domain container as
// HTML5-draggable cards. Two interactions are wired:
//   1. Drop from the palette → `createNode` with parentId set to
//      the quadrant's domain container, plus the domain marker
//      stamped in. The validator gates the operation; refusals
//      route through `acwRefusalChannel` so the shared banner
//      surfaces them.
//   2. Drag a card within or across quadrants → for the same-
//      quadrant case we update the position via
//      `updateNodePosition`; for the cross-quadrant case we attempt
//      a reparent via `updateNodeParent`. Both paths re-route
//      refusals through the channel.
//
// Phase 1 deliberate scope: each quadrant is a lightweight HTML
// surface (not an embedded `InteractiveCanvas2D`). Embedding four
// instances of the full 2D canvas at once is a Phase 2 concern.
// The constitutional invariants are preserved either way: the
// store's validator gating is identical regardless of which
// surface initiated the drop / drag.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Quadrant accent colours are pure UI styling — no traffic-
//     light, no judgement, no animation.
import type { DragEvent } from "react";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
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
  updateNodeParent,
  type AcwNode,
} from "@/acw/acwStore";
import { publishRefusal } from "@/acw/acwRefusalChannel";
import {
  getCurrentDomain,
  setCurrentDomain,
  subscribeViewState,
} from "@/acw/acwViewState";
import type { AcwDomainTag } from "@/acw/acwGrammar";

const EMPTY_QUADRANT_HINT = "Drop a palette tile here.";
const SEAL_LABEL = "Sealed";

assertAllAcwPlaceholderLanguage([EMPTY_QUADRANT_HINT, SEAL_LABEL]);

// dataTransfer key for an in-grid card drag (distinct from the
// palette tile's key so a quadrant drop handler can tell whether
// the drag originated from the palette or from another card).
const ACW_CARD_DATA_KEY = "application/x-eastudio-card-id";

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

  // Compute children-of-each-container in a single pass.
  const childrenByDomainId = new Map<string, AcwNode[]>();
  for (const spec of ACW_DOMAIN_CONTAINERS) {
    childrenByDomainId.set(spec.id, []);
  }
  for (const node of workspace.structureGraph.nodes) {
    if (node.parentId !== null && childrenByDomainId.has(node.parentId)) {
      childrenByDomainId.get(node.parentId)!.push(node);
    }
  }

  return (
    <div
      data-testid="acw-studio-domain-grid"
      className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-auto"
    >
      {ACW_DOMAIN_CONTAINERS.map((spec) => {
        const container = findDomainContainerById(spec.id);
        const children = childrenByDomainId.get(spec.id) ?? [];
        return (
          <Quadrant
            key={spec.id}
            lensId={lensId}
            domain={spec.domain}
            containerId={spec.id}
            containerNode={container}
            children={children}
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
  readonly children: readonly AcwNode[];
  readonly isActive: boolean;
  readonly onActivate: () => void;
}

function Quadrant(props: QuadrantProps) {
  const {
    lensId,
    domain,
    containerId,
    containerNode,
    children,
    isActive,
    onActivate,
  } = props;
  const Icon = ACW_DOMAIN_ICON[domain];
  const accent = ACW_DOMAIN_ACCENT[domain];
  const [isOver, setIsOver] = useState(false);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    // Only signal "drop permitted" when the drag carries one of the
    // two known payload keys. Filtering here prevents arbitrary
    // dragged content (e.g. a desktop file) from triggering the
    // hover affordance.
    const types = Array.from(e.dataTransfer.types);
    if (
      types.includes(ACW_PALETTE_DATA_KEY) ||
      types.includes(ACW_CARD_DATA_KEY)
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = types.includes(ACW_PALETTE_DATA_KEY)
        ? "copy"
        : "move";
      if (!isOver) setIsOver(true);
    }
  };

  const onDragLeave = () => {
    if (isOver) setIsOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    if (containerNode === undefined) {
      publishRefusal(
        "The domain container is not present. Reload the workspace to re-seed it.",
      );
      return;
    }
    // Activate the target domain on drop — keeps the tab bar in
    // sync with where the user just dropped.
    void lensId;
    onActivate();

    // Resolve the dragged payload. Palette drops materialise a new
    // node; card drops attempt a reparent into this quadrant.
    const paletteKind = e.dataTransfer.getData(ACW_PALETTE_DATA_KEY);
    const cardId = e.dataTransfer.getData(ACW_CARD_DATA_KEY);
    if (paletteKind !== "") {
      const item = paletteItemByKind(paletteKind);
      if (item === undefined) {
        publishRefusal(
          `The palette item "${paletteKind}" is not registered.`,
        );
        return;
      }
      const r = createNode({
        type: item.elementType,
        parentId: containerNode.id,
        label: item.label,
        domainTag: domain,
      });
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    if (cardId !== "") {
      // Refuse a no-op move (same parent) without consulting the
      // store — keeps the channel silent for spurious drops.
      const found = findDomainContainerById(cardId);
      if (found === undefined) return;
      if (found.parentId === containerNode.id) return;
      const r = updateNodeParent(cardId, containerNode.id);
      if (!r.ok) publishRefusal(r.reason);
    }
  };

  // Per-domain accent — applied to the header pill so the four
  // quadrants are visually distinct without judgement colour.
  const headerAccent = isActive ? accent : "border-border/50 text-muted-foreground";

  return (
    <section
      role="region"
      aria-label={ACW_DOMAIN_LABEL[domain]}
      data-testid={`acw-studio-quadrant-${domain}`}
      data-domain={domain}
      data-container-id={containerId}
      data-active={isActive ? "true" : "false"}
      data-drop-active={isOver ? "true" : "false"}
      onClick={onActivate}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex flex-col rounded border ${
        isOver ? "border-primary/70 bg-primary/5" : "border-border/40 bg-card/30"
      } min-h-[180px] transition-colors`}
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

      <div
        className="flex-1 p-2 flex flex-wrap gap-2 content-start"
        data-testid={`acw-studio-quadrant-body-${domain}`}
      >
        {children.length === 0 ? (
          <p
            data-testid={`acw-studio-quadrant-empty-${domain}`}
            className="text-[11px] italic text-muted-foreground p-2"
          >
            {EMPTY_QUADRANT_HINT}
          </p>
        ) : (
          children.map((child) => (
            <DomainCard
              key={child.id}
              node={child}
              domain={domain}
              containerNode={containerNode}
            />
          ))
        )}
      </div>
    </section>
  );
}

interface DomainCardProps {
  readonly node: AcwNode;
  readonly domain: AcwDomainTag;
  readonly containerNode: AcwNode | undefined;
}

function DomainCard({ node, domain, containerNode }: DomainCardProps) {
  void containerNode;
  void domain;
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(ACW_CARD_DATA_KEY, node.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div
      role="article"
      draggable
      onDragStart={onDragStart}
      data-testid={`acw-studio-card-${node.id}`}
      data-node-type={node.type}
      data-node-parent={node.parentId ?? "root"}
      className="flex items-center gap-2 px-2 py-1.5 border border-border/50 rounded bg-background/80 cursor-grab active:cursor-grabbing text-xs font-mono"
    >
      <span className="truncate max-w-[160px]">{node.label}</span>
    </div>
  );
}

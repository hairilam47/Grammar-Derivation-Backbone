// EAStudio Phase 1 — domain grid (2x2 quadrant layout).
//
// Renders one quadrant per immutable domain container. Each
// quadrant displays the descendants of its domain container as
// HTML5-draggable cards. Three interactions are wired:
//   1. Drop a palette tile onto a quadrant background → `createNode`
//      with parentId set to the quadrant's domain container. The
//      validator gates the operation. Two refusal layers run:
//      first a UI-level domain alignment check (the dropped tile's
//      `domain` must match the quadrant's `domain`, otherwise the
//      grid refuses without consulting the store), then the
//      grammar validator inside `createNode`. Both refusal paths
//      publish through `acwRefusalChannel` so the StudioCanvas
//      banner surfaces them.
//   2. Drop a palette tile onto an existing card → `createNode`
//      with parentId set to the card's id. This is the Business
//      chain authoring path: drop a Department onto the Business
//      quadrant, drop an OrgUnit onto the Department card, drop a
//      Business Process onto the OrgUnit card. The grammar
//      validator refuses ill-formed nestings (e.g. a Business
//      Process dropped on the Business container directly) and the
//      banner surfaces the neutral refusal text.
//   3. Drag a card across quadrants → attempt a reparent via
//      `updateNodeParent`; the validator gates the reparent the
//      same way it gates a fresh creation.
//
// Phase 1 deliberate scope: each quadrant is a lightweight HTML
// surface (not an embedded `InteractiveCanvas2D`). Embedding four
// instances of the full 2D canvas — together with x/y positioning,
// resizable container chrome, and the connect-mode SVG overlay —
// is the Phase 2 concern that pairs with the Properties panel and
// Connect mode in the spec. The constitutional invariants are
// preserved regardless of which surface initiates the drop / drag,
// because the store's validator gating is the single source of
// legality.
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

  // Build a global id→node lookup so the per-quadrant drop handler
  // can resolve cross-quadrant card moves without re-walking the
  // node list. The lookup also lets `DomainCard` accept palette
  // drops onto a card — needed to author Business chains
  // (Department → OrgUnit → Process) by drop, since the strict
  // grammar refuses parenting a Process directly under Business.
  const nodeById = new Map<string, AcwNode>();
  for (const node of workspace.structureGraph.nodes) {
    nodeById.set(node.id, node);
  }

  // Compute descendants-of-each-container. Phase 1 displays every
  // descendant (not just depth-1 children) inside the quadrant so a
  // nested Business chain remains visible after authoring; Phase 2
  // will replace this flat layout with the embedded 2D canvas.
  const descendantsByDomainId = new Map<string, AcwNode[]>();
  for (const spec of ACW_DOMAIN_CONTAINERS) {
    descendantsByDomainId.set(spec.id, []);
  }
  const findDomainAncestor = (start: AcwNode): string | undefined => {
    let cursor: AcwNode | undefined = start;
    let guard = 0;
    while (cursor !== undefined && guard < 1024) {
      if (descendantsByDomainId.has(cursor.id)) return cursor.id;
      if (cursor.parentId === null) return undefined;
      cursor = nodeById.get(cursor.parentId);
      guard += 1;
    }
    return undefined;
  };
  for (const node of workspace.structureGraph.nodes) {
    if (descendantsByDomainId.has(node.id)) continue;
    const domainId = findDomainAncestor(node);
    if (domainId !== undefined) {
      descendantsByDomainId.get(domainId)!.push(node);
    }
  }

  return (
    <div
      data-testid="acw-studio-domain-grid"
      className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-auto"
    >
      {ACW_DOMAIN_CONTAINERS.map((spec) => {
        const container = findDomainContainerById(spec.id);
        const descendants = descendantsByDomainId.get(spec.id) ?? [];
        return (
          <Quadrant
            key={spec.id}
            lensId={lensId}
            domain={spec.domain}
            containerId={spec.id}
            containerNode={container}
            descendants={descendants}
            nodeById={nodeById}
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
  readonly descendants: readonly AcwNode[];
  readonly nodeById: ReadonlyMap<string, AcwNode>;
  readonly isActive: boolean;
  readonly onActivate: () => void;
}

function Quadrant(props: QuadrantProps) {
  const {
    lensId,
    domain,
    containerId,
    containerNode,
    descendants,
    nodeById,
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
      // UI-level alignment refusal: a tile from one domain dropped
      // into another domain's quadrant is refused without consulting
      // the store. The store validator would still gate the
      // operation by element type, but this earlier refusal carries
      // the domain context so the banner explains *why* the drop is
      // refused (e.g. dropping a Compute node on the Business
      // quadrant is structurally legal at the grammar level but
      // semantically wrong for the four-domain canvas).
      if (item.domain !== domain) {
        publishRefusal(
          `The palette item "${item.label}" belongs to the ${item.domain} domain and is not permitted inside the ${domain} domain quadrant.`,
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
      // Resolve the dragged card via the workspace lookup. A drop on
      // the quadrant background reparents the card directly under
      // this quadrant's domain container — useful for promoting a
      // deeply nested card back to the top of its domain. Cross-
      // quadrant moves (e.g. dragging an Application card from the
      // Application quadrant into the Technology quadrant) are
      // gated by the grammar validator inside `updateNodeParent`,
      // so an illegal move surfaces a refusal banner rather than
      // mutating the store.
      const card = nodeById.get(cardId);
      if (card === undefined) return;
      // Refuse a no-op (already directly under this container)
      // without consulting the store — keeps the channel silent
      // for spurious drops.
      if (card.parentId === containerNode.id) return;
      // Refuse self-drops (would create a cycle).
      if (card.id === containerNode.id) return;
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
        {descendants.length === 0 ? (
          <p
            data-testid={`acw-studio-quadrant-empty-${domain}`}
            className="text-[11px] italic text-muted-foreground p-2"
          >
            {EMPTY_QUADRANT_HINT}
          </p>
        ) : (
          descendants.map((child) => (
            <DomainCard
              key={child.id}
              node={child}
              domain={domain}
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
}

function DomainCard({ node, domain }: DomainCardProps) {
  const [isOver, setIsOver] = useState(false);

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(ACW_CARD_DATA_KEY, node.id);
    e.dataTransfer.effectAllowed = "move";
  };

  // Card-as-drop-target: accept palette tiles dropped on this card
  // and route them through `createNode` with this card as the
  // parent. The grammar validator gates the operation, so an
  // ill-formed nesting (e.g. dropping a Compute tile onto a KPI
  // Card) surfaces a refusal banner. The handler stops propagation
  // so the parent quadrant's drop handler does not also fire and
  // create a sibling under the domain container.
  const onCardDragOver = (e: DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(ACW_PALETTE_DATA_KEY)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isOver) setIsOver(true);
  };
  const onCardDragLeave = () => {
    if (isOver) setIsOver(false);
  };
  const onCardDrop = (e: DragEvent<HTMLDivElement>) => {
    const paletteKind = e.dataTransfer.getData(ACW_PALETTE_DATA_KEY);
    if (paletteKind === "") return;
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    const item = paletteItemByKind(paletteKind);
    if (item === undefined) {
      publishRefusal(
        `The palette item "${paletteKind}" is not registered.`,
      );
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
      parentId: node.id,
      label: item.label,
      domainTag: domain,
    });
    if (!r.ok) publishRefusal(r.reason);
  };

  return (
    <div
      role="article"
      draggable
      onDragStart={onDragStart}
      onDragOver={onCardDragOver}
      onDragLeave={onCardDragLeave}
      onDrop={onCardDrop}
      data-testid={`acw-studio-card-${node.id}`}
      data-node-type={node.type}
      data-node-parent={node.parentId ?? "root"}
      data-drop-active={isOver ? "true" : "false"}
      className={`flex items-center gap-2 px-2 py-1.5 border rounded bg-background/80 cursor-grab active:cursor-grabbing text-xs font-mono transition-colors ${
        isOver ? "border-primary/70 bg-primary/10" : "border-border/50"
      }`}
    >
      <span className="truncate max-w-[160px]">{node.label}</span>
    </div>
  );
}

// EAStudio Phase 1 — palette panel (left rail).
//
// Renders the palette tiles for the currently active domain. Each
// tile is HTML5 draggable; the drag carries the `paletteKind`
// string so the receiving DomainGrid can resolve the underlying
// grammar element type via `paletteItemByKind`. The panel itself
// owns no workspace state — the active domain comes from
// `acwViewState`.
//
// Visual alignment with the prototype HTML (Task #99): every tile
// renders an icon chip + primary label + secondary `subLabel`
// rather than a single line of text.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - The panel never mutates the workspace; it only initiates
//     drags. The drop handler in DomainGrid is the single
//     validator-gated entry point.
import { useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_DOMAIN_LABEL,
  paletteItemsByDomain,
  type PaletteItem,
} from "@/acw/palette/paletteRegistry";
import type { AcwDomainTag } from "@/acw/acwGrammar";

const PANEL_TITLE = "Palette";
const COLLAPSE_LABEL = "Collapse palette";
const EXPAND_LABEL = "Expand palette";

assertAllAcwPlaceholderLanguage([PANEL_TITLE, COLLAPSE_LABEL, EXPAND_LABEL]);

// HTML5 dataTransfer key — shared with DomainGrid's drop handler.
export const ACW_PALETTE_DATA_KEY = "application/x-eastudio-palette-kind";

export interface PalettePanelProps {
  readonly activeDomain: AcwDomainTag;
}

export function PalettePanel({ activeDomain }: PalettePanelProps) {
  const items = paletteItemsByDomain(activeDomain);
  // Local-only collapse state. The panel still tracks its active
  // domain through the global `acwViewState` slice; only the
  // visual reveal/hide of the tile list is local. Per Task #99
  // step 5 we keep the chevron pinned in the title row so the
  // surface column itself never disappears.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      data-testid="acw-studio-palette"
      data-active-domain={activeDomain}
      data-collapsed={collapsed ? "true" : "false"}
      className={`es-palette${collapsed ? " es-palette-collapsed" : ""}`}
    >
      <div className="es-palette-title">
        <Layers className="w-3.5 h-3.5" />
        <span>{PANEL_TITLE}</span>
        <span style={{ opacity: 0.6 }}>· {ACW_DOMAIN_LABEL[activeDomain]}</span>
        <button
          type="button"
          className="es-palette-collapse-btn"
          aria-label={collapsed ? EXPAND_LABEL : COLLAPSE_LABEL}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
          data-testid="acw-studio-palette-collapse"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {collapsed ? null : (
        <ul
          className="es-palette-list"
          data-testid="acw-studio-palette-list"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {items.map((item) => (
            <PaletteTile key={item.paletteKind} item={item} />
          ))}
        </ul>
      )}
    </aside>
  );
}

interface PaletteTileProps {
  readonly item: PaletteItem;
}

// Module-scoped reference to the active drag-ghost element so
// `dragend` (which fires after `dragleave`/`drop`) can reliably
// remove it. A WeakMap keyed by the drag's source DOM node would
// be tidier but the HTML5 drag protocol fires only one drag at a
// time per document, so a single ref is sufficient and avoids
// retaining the source element after the drag completes.
let activeDragGhost: HTMLDivElement | null = null;

function disposeDragGhost(): void {
  if (activeDragGhost === null) return;
  if (activeDragGhost.parentNode !== null) {
    activeDragGhost.parentNode.removeChild(activeDragGhost);
  }
  activeDragGhost = null;
}

function PaletteTile({ item }: PaletteTileProps) {
  const { Icon } = item;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(ACW_PALETTE_DATA_KEY, item.paletteKind);
          e.dataTransfer.effectAllowed = "copy";
          // Per Task #99 step 5: build a prototype-style drag
          // ghost — a faint, slightly rotated clone of the future
          // node card — and use it as the platform drag image so
          // the cursor visually carries the future card while the
          // user is choosing a destination zone. The element lives
          // outside the React tree (appended to <body>) so it can
          // never accidentally hijack a parent's drop handler.
          if (typeof document === "undefined") return;
          disposeDragGhost();
          const ghost = document.createElement("div");
          ghost.className = "es-drag-ghost eastudio-root";
          ghost.setAttribute("data-domain", item.domain);
          ghost.setAttribute("aria-hidden", "true");
          ghost.style.position = "fixed";
          // Park the ghost off-screen until the platform reads it
          // for the drag image; otherwise some browsers flash it
          // at (0,0) for one frame before swapping in the cursor
          // overlay.
          ghost.style.top = "-1000px";
          ghost.style.left = "-1000px";
          ghost.style.pointerEvents = "none";
          ghost.innerHTML = `<span class="es-drag-ghost-icon"></span><span class="es-drag-ghost-text"><span class="es-drag-ghost-label"></span><span class="es-drag-ghost-sub"></span></span>`;
          const labelNode = ghost.querySelector(".es-drag-ghost-label");
          const subNode = ghost.querySelector(".es-drag-ghost-sub");
          if (labelNode !== null) labelNode.textContent = item.label;
          if (subNode !== null) subNode.textContent = item.subLabel;
          document.body.appendChild(ghost);
          activeDragGhost = ghost;
          if (typeof e.dataTransfer.setDragImage === "function") {
            e.dataTransfer.setDragImage(ghost, 18, 18);
          }
        }}
        onDragEnd={() => disposeDragGhost()}
        onKeyDown={(e) => {
          // role="button" elements need an Enter / Space activation
          // path even though the primary affordance is HTML5 drag.
          // No click target exists yet, so the activation here is a
          // no-op that simply prevents the default scroll on Space.
          if (e.key === " ") {
            e.preventDefault();
          }
        }}
        data-testid={`acw-palette-tile-${item.paletteKind}`}
        data-palette-kind={item.paletteKind}
        data-domain={item.domain}
        className="es-palette-item"
      >
        <span className="es-pal-icon" aria-hidden="true">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="es-pal-text">
          <span className="es-pal-label">{item.label}</span>
          <span className="es-pal-sub es-mono">{item.subLabel}</span>
        </span>
      </div>
    </li>
  );
}

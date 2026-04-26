// EAStudio — collapsible right-side "Decision Contract" navigation
// (Task #100).
//
// Renders a thin right rail inside the `.eastudio-root` surface that
// groups the four governance routes — Decision Canvas, Portfolio,
// Signals, Reflection — under a single "Decision Contract" header.
// The rail is collapsible: when collapsed it shrinks to icon-only
// width; when expanded it shows icon + label and the active route
// is visually indicated.
//
// Routes are taken verbatim from `src/App.tsx`:
//   /decision-canvas  ->  Decision Canvas
//   /portfolio        ->  Portfolio
//   /signals          ->  Signals
//   /reflection       ->  Reflection
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - The rail is a real layout column (sibling of the studio shell
//     column), not an overlay. It owns its own width and never
//     receives pointer events on behalf of the canvas.
//   - The rail mutates nothing in the workspace; navigation is
//     handled by wouter `<Link>` components.
//
// Task #101 — collapsed/expanded state is persisted in
// `localStorage` under the namespaced key
// `eastudio:decisionContractNav:collapsed` so a user who prefers
// the icon-only rail does not have to collapse it on every visit.
// The default for a first-time visitor (and for any environment
// where storage is unavailable, e.g. SSR or a private-mode reject)
// remains "expanded".
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const NAV_TITLE = "Decision Contract";
const COLLAPSE_LABEL = "Collapse navigation";
const EXPAND_LABEL = "Expand navigation";

// Namespaced under `eastudio:` so it cannot collide with other
// UI-state keys persisted by unrelated workspaces. The value is
// the literal string "true" or "false" — anything else is treated
// as "no preference recorded" and we fall back to expanded.
const COLLAPSED_STORAGE_KEY = "eastudio:decisionContractNav:collapsed";

function readPersistedCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return false;
  } catch {
    return false;
  }
}

function writePersistedCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false",
    );
  } catch {
    // Storage may be unavailable (private mode, quota exceeded,
    // disabled by the user). Persistence is a convenience; failing
    // to write must never break the rail's interactivity.
  }
}

interface NavLink {
  readonly path: string;
  readonly label: string;
  readonly Icon: LucideIcon;
}

const NAV_LINKS: readonly NavLink[] = [
  { path: "/decision-canvas", label: "Decision Canvas", Icon: LayoutGrid },
  { path: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { path: "/signals", label: "Signals", Icon: Activity },
  { path: "/reflection", label: "Reflection", Icon: BookOpen },
];

assertAllAcwPlaceholderLanguage([
  NAV_TITLE,
  COLLAPSE_LABEL,
  EXPAND_LABEL,
  ...NAV_LINKS.map((l) => l.label),
]);

export function DecisionContractNav() {
  // Lazy initializer reads the persisted preference exactly once
  // on mount. Subsequent toggles re-write through the effect
  // below, keeping storage in sync without re-reading on every
  // render.
  const [collapsed, setCollapsed] = useState<boolean>(
    readPersistedCollapsed,
  );
  const [location] = useLocation();

  useEffect(() => {
    writePersistedCollapsed(collapsed);
  }, [collapsed]);

  return (
    <aside
      className="es-rnav"
      data-testid="acw-studio-decision-contract-nav"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={NAV_TITLE}
    >
      <div className="es-rnav-header">
        {collapsed ? (
          <span className="es-rnav-mark" aria-hidden="true">
            <ShieldCheck className="w-3.5 h-3.5" />
          </span>
        ) : (
          <span className="es-rnav-title">{NAV_TITLE}</span>
        )}
        <button
          type="button"
          className="es-rnav-toggle"
          aria-label={collapsed ? EXPAND_LABEL : COLLAPSE_LABEL}
          aria-expanded={!collapsed}
          aria-controls="acw-studio-decision-contract-nav-list"
          onClick={() => setCollapsed((c) => !c)}
          onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              setCollapsed((c) => !c);
            }
          }}
          data-testid="acw-studio-decision-contract-nav-toggle"
        >
          {collapsed ? (
            <ChevronLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <ul
        id="acw-studio-decision-contract-nav-list"
        className="es-rnav-list"
        data-testid="acw-studio-decision-contract-nav-list"
      >
        {NAV_LINKS.map((link) => {
          const active = location === link.path;
          const { Icon } = link;
          return (
            <li key={link.path}>
              <Link
                href={link.path}
                className="es-rnav-item"
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
                data-testid={`acw-studio-decision-contract-nav-link-${link.path.replace(/^\//, "")}`}
                title={collapsed ? link.label : undefined}
              >
                <span className="es-rnav-item-icon" aria-hidden="true">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="es-rnav-item-label">{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

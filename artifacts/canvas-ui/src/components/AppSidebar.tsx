import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Link, useLocation } from "wouter";
import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSignature,
  Home,
  Layers,
  Layout,
  LayoutGrid,
  Menu,
  Radio,
  Shield,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  testId: string;
  matches: (loc: string) => boolean;
}

interface SubNavItem extends NavItem {
  parentTestId: string;
}

const TOP_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    label: "Landing",
    icon: Home,
    testId: "nav-landing",
    matches: (loc) => loc === "/",
  },
];

const DESIGN_CONTRACT_ITEMS: readonly NavItem[] = [
  {
    href: "/decision-canvas",
    label: "Decision Canvas",
    icon: FileSignature,
    testId: "nav-decision-canvas",
    matches: (loc) => loc === "/decision-canvas",
  },
  {
    href: "/ctad",
    label: "CTAD",
    icon: Layers,
    testId: "nav-ctad",
    matches: (loc) => loc === "/ctad" || loc.startsWith("/ctad/"),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: LayoutGrid,
    testId: "nav-portfolio",
    matches: (loc) => loc === "/portfolio" || loc.startsWith("/exposure/"),
  },
  {
    href: "/signals",
    label: "Signals",
    icon: Radio,
    testId: "nav-signals",
    matches: (loc) => loc === "/signals",
  },
  {
    href: "/reflection",
    label: "Reflection",
    icon: Eye,
    testId: "nav-reflection",
    matches: (loc) => loc === "/reflection",
  },
];

const WORKSPACE_ITEM: NavItem = {
  href: "/workspace/context",
  label: "Architecture Workspace",
  icon: Workflow,
  testId: "nav-workspace",
  matches: (loc) =>
    loc === "/workspace" ||
    loc.startsWith("/workspace/") ||
    loc === "/acw/derived" ||
    loc.startsWith("/acw/derived/"),
};

const SUB_ITEMS: readonly SubNavItem[] = [
  {
    href: "/acw/derived",
    label: "Derived view",
    icon: Boxes,
    testId: "nav-acw-derived",
    parentTestId: "nav-workspace",
    matches: (loc) => loc === "/acw/derived" || loc.startsWith("/acw/derived/"),
  },
];

const COLLAPSE_LABEL = "Collapse navigation";
const EXPAND_LABEL = "Expand navigation";
const OPEN_NAV_LABEL = "Open navigation";
const CLOSE_LABEL = "Close navigation";
const DESIGN_CONTRACT_LABEL = "Design Contract";
const APP_TITLE = "Architecture Decision Canvas";

// Persisted under a separate key from the right-side EAStudio rail
// so the two collapsibles do not share state.
const COLLAPSED_STORAGE_KEY = "app:sidebar:collapsed";

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
    // Storage may be unavailable; persistence is a convenience.
  }
}

interface PageTitleEntry {
  match: (loc: string) => boolean;
  title: string;
}

const PAGE_TITLES: readonly PageTitleEntry[] = [
  { match: (l) => l === "/", title: "Landing" },
  { match: (l) => l === "/decision-canvas", title: "Decision Canvas" },
  { match: (l) => l === "/ctad" || l.startsWith("/ctad/"), title: "CTAD" },
  { match: (l) => l === "/portfolio", title: "Portfolio" },
  { match: (l) => l.startsWith("/exposure/"), title: "Exposure" },
  { match: (l) => l === "/signals", title: "Signals" },
  { match: (l) => l === "/reflection", title: "Reflection" },
  {
    match: (l) =>
      l === "/governance/containment" ||
      l.startsWith("/governance/containment/"),
    title: "Containment",
  },
  {
    match: (l) => l === "/acw/derived" || l.startsWith("/acw/derived/"),
    title: "Derived view",
  },
  {
    match: (l) => l === "/workspace" || l.startsWith("/workspace/"),
    title: "Architecture Workspace",
  },
];

function resolvePageTitle(location: string): string {
  const hit = PAGE_TITLES.find((e) => e.match(location));
  return hit ? hit.title : APP_TITLE;
}

interface AppSidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  isMobile: boolean;
}

export function AppSidebar({
  collapsed,
  mobileOpen,
  onMobileClose,
  isMobile,
}: AppSidebarProps) {
  const [location] = useLocation();
  const designContractActive = DESIGN_CONTRACT_ITEMS.some((i) =>
    i.matches(location),
  );
  const workspaceActive = WORKSPACE_ITEM.matches(location);
  const [groupOpen, setGroupOpen] = useState<boolean>(
    () => designContractActive,
  );

  // Auto-expand the group when the active route belongs to one of
  // its children. Never auto-collapse; the user keeps control.
  useEffect(() => {
    if (designContractActive) setGroupOpen(true);
  }, [designContractActive]);

  // The collapsed-rail visual hides labels — when the user is in
  // collapsed mode the children are surfaced as flat icon links so
  // they remain reachable.
  const showGroupChildren = !collapsed && groupOpen;

  const renderItem = (item: NavItem, indent = false) => {
    const Icon = item.icon;
    const active = item.matches(location);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={`app-sidebar-item ${
            active ? "app-sidebar-item--active" : ""
          } ${indent ? "app-sidebar-item--indent" : ""}`}
          data-testid={item.testId}
          data-active={active ? "true" : "false"}
          aria-current={active ? "page" : undefined}
          title={collapsed ? item.label : undefined}
          onClick={onMobileClose}
        >
          <span className="app-sidebar-item-icon" aria-hidden="true">
            <Icon className="w-4 h-4" />
          </span>
          <span className="app-sidebar-item-label">{item.label}</span>
          {active && (
            <span
              className="app-sidebar-item-bar nav-active-bar"
              aria-hidden="true"
            />
          )}
        </Link>
      </li>
    );
  };

  // Workspace sub-link surfaces only when its parent or itself is
  // active (mirrors the prior GlobalNav behaviour).
  const workspaceSubs = SUB_ITEMS.filter(
    (s) =>
      s.parentTestId === WORKSPACE_ITEM.testId &&
      (workspaceActive || s.matches(location)),
  );

  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onMobileClose();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="app-sidebar-backdrop md:hidden"
          onClick={onBackdropClick}
          aria-hidden="true"
          data-testid="app-sidebar-backdrop"
        />
      )}
      <aside
        className="app-sidebar"
        data-collapsed={collapsed ? "true" : "false"}
        data-mobile-open={mobileOpen ? "true" : "false"}
        aria-label="Primary navigation"
        aria-hidden={isMobile && !mobileOpen ? true : undefined}
        // `inert` removes the subtree from focus order. React's
        // type defs accept a boolean here.
        inert={isMobile && !mobileOpen ? true : undefined}
      >
        <div className="app-sidebar-header">
          <span className="app-sidebar-brand" aria-hidden="true">
            <ShieldCheck className="w-4 h-4" />
          </span>
          {!collapsed && (
            <span className="app-sidebar-brand-label">{APP_TITLE}</span>
          )}
          {isMobile && (
            <button
              type="button"
              className="app-sidebar-toggle"
              onClick={onMobileClose}
              aria-label={CLOSE_LABEL}
              data-testid="app-sidebar-mobile-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <nav
          className="app-sidebar-nav"
          data-testid="global-nav"
          aria-label="Primary"
        >
          <ul className="app-sidebar-list">
            {TOP_ITEMS.map((item) => renderItem(item))}

            <li className="app-sidebar-group">
              {collapsed ? (
                // Collapsed rail: surface the parent as a non-
                // interactive icon (kept for the test-id contract)
                // followed by the flat child icons so every route
                // remains reachable without expanding the rail.
                <div
                  className={`app-sidebar-item app-sidebar-item--group ${
                    designContractActive ? "app-sidebar-item--active" : ""
                  }`}
                  data-testid="nav-design-contract"
                  data-active={designContractActive ? "true" : "false"}
                  data-open="false"
                  aria-expanded="false"
                  role="presentation"
                  title={DESIGN_CONTRACT_LABEL}
                >
                  <span className="app-sidebar-item-icon" aria-hidden="true">
                    <Shield className="w-4 h-4" />
                  </span>
                  <span className="app-sidebar-item-label">
                    {DESIGN_CONTRACT_LABEL}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className={`app-sidebar-item app-sidebar-item--group ${
                    designContractActive ? "app-sidebar-item--active" : ""
                  }`}
                  data-testid="nav-design-contract"
                  data-active={designContractActive ? "true" : "false"}
                  data-open={groupOpen ? "true" : "false"}
                  aria-expanded={groupOpen}
                  aria-controls="nav-design-contract-list"
                  onClick={() => setGroupOpen((v) => !v)}
                  onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setGroupOpen((v) => !v);
                    }
                  }}
                >
                  <span className="app-sidebar-item-icon" aria-hidden="true">
                    <Shield className="w-4 h-4" />
                  </span>
                  <span className="app-sidebar-item-label">
                    {DESIGN_CONTRACT_LABEL}
                  </span>
                  <span className="app-sidebar-group-chevron" aria-hidden="true">
                    {groupOpen ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </span>
                </button>
              )}

              <ul
                id="nav-design-contract-list"
                className="app-sidebar-sublist"
                data-open={showGroupChildren ? "true" : "false"}
                hidden={!showGroupChildren && !collapsed}
              >
                {DESIGN_CONTRACT_ITEMS.map((item) =>
                  renderItem(item, !collapsed),
                )}
              </ul>
            </li>

            {renderItem(WORKSPACE_ITEM)}
            {workspaceSubs.length > 0 && (
              <li>
                <ul className="app-sidebar-sublist" data-open="true">
                  {workspaceSubs.map((s) => renderItem(s, !collapsed))}
                </ul>
              </li>
            )}
          </ul>
        </nav>
      </aside>
    </>
  );
}

interface AppShellProps {
  children: React.ReactNode;
}

function useIsMobile(): boolean {
  // Tailwind's default `md` breakpoint is 768px; the matchMedia
  // query is the single source of truth for mobile mode here.
  const query = "(max-width: 767.98px)";
  const get = () => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const [isMobile, setIsMobile] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(readPersistedCollapsed);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [location] = useLocation();
  const lastLocation = useRef<string>(location);
  const isMobile = useIsMobile();
  const pageTitle = resolvePageTitle(location);

  useEffect(() => {
    writePersistedCollapsed(collapsed);
  }, [collapsed]);

  // Close the mobile overlay whenever the route changes.
  useEffect(() => {
    if (lastLocation.current !== location) {
      setMobileOpen(false);
      lastLocation.current = location;
    }
  }, [location]);

  // Esc closes the mobile overlay; ignored when typing.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (t && t.isContentEditable);
      if (editable) return;
      setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const onTopbarToggle = () => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((c) => !c);
    }
  };

  return (
    <div className="app-shell" data-testid="app-shell">
      <AppSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        isMobile={isMobile}
      />
      <div
        className={`app-shell-content ${
          collapsed
            ? "app-shell-content--collapsed"
            : "app-shell-content--expanded"
        }`}
      >
        <header
          className="app-shell-topbar glass-header"
          data-testid="app-topbar"
        >
          <div className="app-shell-topbar-inner">
            <button
              type="button"
              className="app-shell-topbar-toggle"
              onClick={onTopbarToggle}
              aria-label={
                isMobile
                  ? mobileOpen
                    ? CLOSE_LABEL
                    : OPEN_NAV_LABEL
                  : collapsed
                    ? EXPAND_LABEL
                    : COLLAPSE_LABEL
              }
              aria-expanded={isMobile ? mobileOpen : !collapsed}
              data-testid="app-topbar-toggle"
            >
              {isMobile ? (
                <Menu className="w-4 h-4" />
              ) : collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
            <span className="app-shell-topbar-brand" aria-hidden="true">
              <Layout className="w-4 h-4" />
            </span>
            <span
              className="app-shell-topbar-title"
              data-testid="app-topbar-title"
            >
              {pageTitle}
            </span>
          </div>
          <div
            className="hairline-accent h-px w-full opacity-60"
            aria-hidden="true"
          />
        </header>
        {children}
      </div>
    </div>
  );
}

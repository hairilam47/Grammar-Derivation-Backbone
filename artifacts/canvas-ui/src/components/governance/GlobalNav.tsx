import { Link, useLocation } from "wouter";
import { Home, FileSignature, LayoutGrid, Radio, Eye, Workflow, Layers, Boxes } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  testId: string;
  matches: (loc: string) => boolean;
}

// Sub-link surfaces under a parent nav item only when the user
// is in that parent's section (or in the sub-link itself). This
// keeps Track 3 ("Derived view") visibly subordinate to the
// Architecture Workspace tier, not a peer of it.
interface SubNavItem extends NavItem {
  parentTestId: string;
}

const PRIMARY_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    label: "Landing",
    icon: Home,
    testId: "nav-landing",
    matches: (loc) => loc === "/",
  },
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
  {
    href: "/workspace/context",
    label: "Architecture Workspace",
    icon: Workflow,
    testId: "nav-workspace",
    matches: (loc) =>
      loc === "/workspace" ||
      loc.startsWith("/workspace/") ||
      loc === "/acw/derived" ||
      loc.startsWith("/acw/derived/"),
  },
];

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

export function GlobalNav() {
  const [location] = useLocation();
  return (
    <nav
      className="flex items-center gap-3 text-xs uppercase tracking-widest"
      data-testid="global-nav"
    >
      {PRIMARY_ITEMS.map((item, idx) => {
        const Icon = item.icon;
        const active = item.matches(location);
        // Sub-links surface only when their parent is active or
        // the sub-link itself is.
        const subs = SUB_ITEMS.filter(
          (s) => s.parentTestId === item.testId && (active || s.matches(location)),
        );
        return (
          <span key={item.href} className="flex items-center gap-3">
            {idx > 0 && <span className="text-muted-foreground/40">·</span>}
            <Link
              href={item.href}
              className={`flex items-center gap-1.5 hover:text-primary transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={item.testId}
            >
              <Icon className="w-3.5 h-3.5" /> {item.label}
            </Link>
            {subs.map((s) => {
              const SubIcon = s.icon;
              const subActive = s.matches(location);
              return (
                <span key={s.href} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground/50 text-[10px]">›</span>
                  <Link
                    href={s.href}
                    className={`flex items-center gap-1.5 hover:text-primary transition-colors text-[11px] normal-case ${
                      subActive ? "text-primary" : "text-muted-foreground/80"
                    }`}
                    data-testid={s.testId}
                  >
                    <SubIcon className="w-3 h-3" /> {s.label}
                  </Link>
                </span>
              );
            })}
          </span>
        );
      })}
    </nav>
  );
}

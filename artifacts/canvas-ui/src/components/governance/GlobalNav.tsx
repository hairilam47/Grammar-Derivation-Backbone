import { Link, useLocation } from "wouter";
import { Home, FileSignature, LayoutGrid, Radio, Eye, Workflow, Layers } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  testId: string;
  matches: (loc: string) => boolean;
}

const ITEMS: readonly NavItem[] = [
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
    matches: (loc) => loc === "/workspace" || loc.startsWith("/workspace/"),
  },
];

export function GlobalNav() {
  const [location] = useLocation();
  return (
    <nav
      className="flex items-center gap-3 text-xs uppercase tracking-widest"
      data-testid="global-nav"
    >
      {ITEMS.map((item, idx) => {
        const Icon = item.icon;
        const active = item.matches(location);
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
          </span>
        );
      })}
    </nav>
  );
}

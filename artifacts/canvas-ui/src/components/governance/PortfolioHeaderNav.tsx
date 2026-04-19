import { Link, useLocation } from "wouter";
import { LayoutGrid, Layout, Radio, Eye, Shield } from "lucide-react";

export function PortfolioHeaderNav() {
  const [location] = useLocation();
  return (
    <nav className="flex items-center gap-3 text-xs uppercase tracking-widest">
      <Link
        href="/"
        className={`flex items-center gap-1.5 hover:text-primary transition-colors ${
          location === "/" ? "text-primary" : "text-muted-foreground"
        }`}
        data-testid="link-canvas"
      >
        <Layout className="w-3.5 h-3.5" /> Canvas
      </Link>
      <span className="text-muted-foreground/40">·</span>
      <Link
        href="/portfolio"
        className={`flex items-center gap-1.5 hover:text-primary transition-colors ${
          location === "/portfolio" ? "text-primary" : "text-muted-foreground"
        }`}
        data-testid="link-portfolio"
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Portfolio
      </Link>
      <span className="text-muted-foreground/40">·</span>
      <Link
        href="/signals"
        className={`flex items-center gap-1.5 hover:text-primary transition-colors ${
          location === "/signals" ? "text-primary" : "text-muted-foreground"
        }`}
        data-testid="link-signals"
      >
        <Radio className="w-3.5 h-3.5" /> Signals
      </Link>
      <span className="text-muted-foreground/40">·</span>
      <Link
        href="/reflection"
        className={`flex items-center gap-1.5 hover:text-primary transition-colors ${
          location === "/reflection" ? "text-primary" : "text-muted-foreground"
        }`}
        data-testid="link-reflection"
      >
        <Eye className="w-3.5 h-3.5" /> Reflection
      </Link>
      <span className="text-muted-foreground/40">·</span>
      <Link
        href="/governance/containment"
        className={`flex items-center gap-1.5 hover:text-primary transition-colors ${
          location === "/governance/containment"
            ? "text-primary"
            : "text-muted-foreground"
        }`}
        data-testid="link-containment"
      >
        <Shield className="w-3.5 h-3.5" /> Containment
      </Link>
    </nav>
  );
}

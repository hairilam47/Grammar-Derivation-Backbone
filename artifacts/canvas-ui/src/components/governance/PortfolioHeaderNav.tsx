import { Link, useLocation } from "wouter";
import { LayoutGrid, Layout } from "lucide-react";

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
    </nav>
  );
}

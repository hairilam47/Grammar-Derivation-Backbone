import type { LucideIcon } from "lucide-react";
import { Layout } from "lucide-react";
import { GlobalNav } from "@/components/governance/GlobalNav";

interface AppHeaderProps {
  icon?: LucideIcon;
  title?: string;
}

export function AppHeader({
  icon: Icon = Layout,
  title = "Architecture Decision Canvas",
}: AppHeaderProps) {
  return (
    <header className="glass-header sticky top-0 z-10">
      <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="brand-mark" aria-hidden="true">
            <Icon />
          </span>
          <span className="font-semibold tracking-tight text-sm">
            {title}
          </span>
        </div>
        <GlobalNav />
      </div>
      <div className="hairline-accent h-px w-full opacity-60" aria-hidden="true" />
    </header>
  );
}

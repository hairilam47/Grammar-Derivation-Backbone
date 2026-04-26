import type { LucideIcon } from "lucide-react";

interface AppHeaderProps {
  icon?: LucideIcon;
  title?: string;
}

// Task #108 — primary navigation moved to the left-side AppSidebar
// and the brand mark + page title now live in the slim
// `AppShell` top header rendered above the routed content. This
// component is intentionally a no-op so existing pages can keep
// their imports without rendering a duplicate brand strip.
export function AppHeader(_props: AppHeaderProps) {
  return null;
}

// ACW Workspace Builder — workspace shell + lens-style sub-navigation.
//
// The shell renders the top app nav (GlobalNav), an
// ACW-specific sub-nav listing the five TOGAF-aligned lenses, and a
// content slot for the active lens view. Navigation is "lens, not
// step": no progress indicators, no next / previous, no maturity or
// completion language. The same workspace is observed through five
// different lenses.
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Workflow } from "lucide-react";
import { GlobalNav } from "@/components/governance/GlobalNav";
import { AuthoringPanel } from "@/components/acw/AuthoringPanel";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
// Side-effect imports: ACW grammar hook stubs, isolation invariant,
// and v1 grammar invariants. Each runs module-load assertions;
// importing them here ensures any regression fails the build before
// the shell renders.
import "@/acw/acwGrammarHooks";
import "@/acw/acwIsolationInvariants.test-shape";
import "@/acw/acwGrammarInvariants.test-shape";
// v2 visual-layer invariants. Importing this side-effect module
// runs the bundle-load assertions for the per-lens view-state
// schema, drag-to-reparent validator gating, cycle prevention,
// and structural inertness of position / collapse operations.
import "@/acw/acwGrammarV2Invariants.test-shape";

const SHELL_TITLE = "Architecture Composition Workspace";
const SHELL_HINT =
  "An empty workspace shell. Each lens here is a different reading of the same workspace.";

export interface AcwLens {
  readonly path: string;
  readonly label: string;
  readonly togafLayer: string;
}

export const ACW_LENSES: readonly AcwLens[] = [
  {
    path: "/workspace/context",
    label: "Context & Domain",
    togafLayer: "Business",
  },
  {
    path: "/workspace/landscape",
    label: "System Landscape",
    togafLayer: "Application",
  },
  {
    path: "/workspace/integration",
    label: "Integration",
    togafLayer: "Application + Data",
  },
  {
    path: "/workspace/deployment",
    label: "Deployment & Infrastructure",
    togafLayer: "Technology",
  },
  {
    path: "/workspace/operations",
    label: "Operations & Continuity",
    togafLayer: "Cross-layer",
  },
  {
    path: "/workspace/studio",
    label: "EAStudio canvas",
    togafLayer: "Cross-layer",
  },
];

assertAllAcwPlaceholderLanguage([
  SHELL_TITLE,
  SHELL_HINT,
  ...ACW_LENSES.map((l) => l.label),
  ...ACW_LENSES.map((l) => l.togafLayer),
]);

export interface WorkspaceShellProps {
  children: ReactNode;
  /**
   * When `true` the shell suppresses its inline body chrome (the
   * shell hint paragraph and the always-on `<AuthoringPanel />`)
   * so a lens that owns its own fullscreen surface can host the
   * authoring affordance inside its floating overlay instead.
   *
   * Header + sub-nav stay rendered unconditionally so the
   * route-level chrome remains reachable above the fullscreen
   * canvas (mirrors the Track 3 fullscreen z-index discipline:
   * the canvas sits at `z-0` and the sticky header at `z-10`).
   *
   * Defaults to `false` so the four non-fullscreen lenses (Context
   * & Domain, Integration, Operations & Continuity, plus either
   * fullscreen lens when fullscreen has been toggled off) keep
   * the prior inline behaviour.
   */
  hideShellChrome?: boolean;
}

export function WorkspaceShell({
  children,
  hideShellChrome = false,
}: WorkspaceShellProps) {
  const [location] = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Workflow className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">
              {SHELL_TITLE}
            </span>
          </div>
          <GlobalNav />
        </div>
      </header>

      <div
        className="border-b border-border/40 bg-muted/10 sticky top-14 z-10"
        data-testid="acw-lens-nav"
      >
        <div className="container max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-widest">
          {ACW_LENSES.map((lens) => {
            const active = location === lens.path;
            return (
              <Link
                key={lens.path}
                href={lens.path}
                className={`px-2 py-1 rounded border transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-primary"
                }`}
                data-testid={`acw-lens-link-${lens.path.split("/").pop()}`}
              >
                {lens.label}
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-6 space-y-4">
        {hideShellChrome ? null : (
          <>
            <p
              className="text-[11px] text-muted-foreground italic"
              data-testid="acw-shell-hint"
            >
              {SHELL_HINT}
            </p>
            <AuthoringPanel />
          </>
        )}
        {children}
      </main>
    </div>
  );
}

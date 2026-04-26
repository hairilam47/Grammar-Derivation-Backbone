// EAStudio Phase 1 — domain tab bar.
//
// Four-button switcher above the StudioCanvas grid. The active
// domain comes from / writes back to the `acwViewState` slice via
// `getCurrentDomain` / `setCurrentDomain`, so the choice is
// per-lens and persisted alongside the existing collapse and
// 2D/3D-mode preferences.
//
// Constitutional discipline:
//   - Pure UI affordance. The bar mutates view-state only; the
//     workspace document is untouched on every click.
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
import { useEffect, useState } from "react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { ACW_DOMAIN_TAGS, type AcwDomainTag } from "@/acw/acwGrammar";
import {
  ACW_DOMAIN_LABEL,
  ACW_DOMAIN_ACCENT,
  ACW_DOMAIN_ICON,
} from "@/acw/palette/paletteRegistry";
import {
  getCurrentDomain,
  setCurrentDomain,
  subscribeViewState,
} from "@/acw/acwViewState";

const BAR_LABEL = "Domain";

assertAllAcwPlaceholderLanguage([BAR_LABEL]);

export interface DomainTabBarProps {
  readonly lensId: string;
}

export function DomainTabBar({ lensId }: DomainTabBarProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  // Re-read on every render so the bar stays in sync with external
  // mutations (e.g. a different surface calling setCurrentDomain).
  void tick;
  const active = getCurrentDomain(lensId);

  return (
    <div
      data-testid="acw-studio-domain-tab-bar"
      data-lens-id={lensId}
      data-active-domain={active}
      className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-card/40 backdrop-blur"
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-1">
        {BAR_LABEL}:
      </span>
      {ACW_DOMAIN_TAGS.map((tag: AcwDomainTag) => {
        const Icon = ACW_DOMAIN_ICON[tag];
        const accent = ACW_DOMAIN_ACCENT[tag];
        const isActive = active === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => setCurrentDomain(lensId, tag)}
            data-testid={`acw-studio-domain-tab-${tag}`}
            data-active={isActive ? "true" : "false"}
            aria-pressed={isActive}
            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono transition-colors ${
              isActive
                ? accent
                : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{ACW_DOMAIN_LABEL[tag]}</span>
          </button>
        );
      })}
    </div>
  );
}

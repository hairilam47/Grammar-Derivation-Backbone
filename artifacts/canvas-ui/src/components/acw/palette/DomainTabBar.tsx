// EAStudio Phase 1 — domain tab bar (Task #99 visual alignment).
//
// Four-button switcher above the StudioCanvas grid. The active
// domain comes from / writes back to the `acwViewState` slice via
// `getCurrentDomain` / `setCurrentDomain`, so the choice is
// per-lens and persisted alongside the existing collapse and
// 2D/3D-mode preferences. The bar uses the prototype's bottom-
// border accent styling (per-domain CSS variable picked up by
// `[data-domain]`).
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
  ACW_DOMAIN_ICON,
} from "@/acw/palette/paletteRegistry";
import {
  getCurrentDomain,
  setCurrentDomain,
  subscribeViewState,
} from "@/acw/acwViewState";

assertAllAcwPlaceholderLanguage([...Object.values(ACW_DOMAIN_LABEL)]);

export interface DomainTabBarProps {
  readonly lensId: string;
}

export function DomainTabBar({ lensId }: DomainTabBarProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;
  const active = getCurrentDomain(lensId);

  return (
    <nav
      data-testid="acw-studio-domain-tab-bar"
      data-lens-id={lensId}
      data-active-domain={active}
      className="es-dtabs"
      role="tablist"
    >
      {ACW_DOMAIN_TAGS.map((tag: AcwDomainTag) => {
        const Icon = ACW_DOMAIN_ICON[tag];
        const isActive = active === tag;
        return (
          <button
            key={tag}
            type="button"
            role="tab"
            onClick={() => setCurrentDomain(lensId, tag)}
            data-testid={`acw-studio-domain-tab-${tag}`}
            data-active={isActive ? "true" : "false"}
            data-domain={tag}
            aria-pressed={isActive}
            aria-selected={isActive}
            className="es-dtab"
          >
            {/* Prototype's `.dot` element — a 7×7 colour swatch
                drawn in the domain's `--<domain>` token. CSS picks
                the colour up via the `[data-domain]` attribute
                cascade so the markup stays domain-agnostic. */}
            <span className="es-dtab-dot" aria-hidden="true" />
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{ACW_DOMAIN_LABEL[tag]}</span>
          </button>
        );
      })}
    </nav>
  );
}

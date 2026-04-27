// EAStudio Path B Phase 3 — right-click "Swap technology" menu.
//
// Renders a small absolute-positioned popover anchored at the
// cursor coordinates the host (DomainGrid) supplies. The menu lists
// every alternative option of the node's bound CTAD parameter; the
// currently-selected option is annotated and not actionable. Click
// on any other option fires the validator-gated `updateNodeBinding`
// with `{ boundParam: { sectionId, paramId, optionValue } }` so the
// swap reuses the existing semantic-binding pipeline (no parallel
// mutation path, no allow-list widening).
//
// Constitutional discipline:
//   - Lucide icons only (no emoji).
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - The host is responsible for showing / hiding; this component
//     is a pure render of `(node, x, y, onClose)` and never reaches
//     into the view-state singleton itself.
//   - Outside-click and Escape both close. Both behaviours live in
//     the host so the menu component stays a presentational leaf.
//
// "No other options available." is rendered in a disabled list item when the
// bound parameter has only one option (or when the resolver returns
// an empty list because the binding is stale). The empty-state copy
// is intentionally neutral — no judgment, no instruction.
import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import type { AcwNode } from "@/acw/acwStore";
import { updateNodeBinding } from "@/acw/acwStore";
import { resolveBoundOption, resolveBoundOptions } from "@/acw/semantic/techNodeBinding";
import { publishRefusal } from "@/acw/acwRefusalChannel";
import {
  invalidateL3Memo,
  runL3GeneratorForPersistedArchitectures,
} from "@/acw/l3/l3Generator";

const MENU_TITLE = "Swap technology";
const NO_OPTIONS = "No other options available.";
const CURRENT_SUFFIX = "current";
const CANCEL_LABEL = "Cancel";

assertAllAcwPlaceholderLanguage([
  MENU_TITLE,
  NO_OPTIONS,
  CURRENT_SUFFIX,
  CANCEL_LABEL,
]);

export interface NodeContextMenuProps {
  readonly node: AcwNode;
  readonly x: number;
  readonly y: number;
  // Phase 3 — current LoS level. The Phase-2 L3 generator memoizes
  // its output keyed on (architectureId, ctadStateHash); a swap
  // changes the L2 origin's `boundParam` but does NOT change CTAD
  // state, so the memo would skip the generator on the next entry
  // and the L3 surface would render stale children. We invalidate
  // unconditionally on every accepted swap so the next L3 entry
  // always rebuilds, AND when activeLod === 3 we additionally
  // re-run the persisted-roster entry point so the live surface
  // reflects the swap immediately.
  readonly activeLod: 1 | 2 | 3;
  readonly onClose: () => void;
}

export function NodeContextMenu(props: NodeContextMenuProps) {
  const { node, x, y, activeLod, onClose } = props;
  const options = useMemo(() => resolveBoundOptions(node), [node]);
  const current = useMemo(() => resolveBoundOption(node, undefined), [node]);

  const onPick = (value: string) => {
    if (node.boundParam === undefined) {
      onClose();
      return;
    }
    if (current === value) {
      onClose();
      return;
    }
    const r = updateNodeBinding(node.id, {
      boundParam: {
        sectionId: node.boundParam.sectionId,
        paramId: node.boundParam.paramId,
        optionValue: value,
      },
    });
    if (!r.ok) {
      publishRefusal(r.reason);
      onClose();
      return;
    }
    // Phase 3 contract: a successful swap MUST invalidate the L3
    // memo so the next L3 entry rebuilds against the new boundParam.
    // When the user is already at L3, immediately re-run the
    // persisted-roster generator so the visible surface refreshes
    // in the same gesture (no need to leave and re-enter L3).
    invalidateL3Memo();
    if (activeLod === 3) {
      runL3GeneratorForPersistedArchitectures();
    }
    onClose();
  };

  // The menu is a non-modal popover. We intentionally do NOT trap
  // focus or render a scrim — the host listens for outside-click
  // and Escape and dismisses. This keeps the menu a pure leaf and
  // matches the prototype's lightweight context affordance.
  return (
    <div
      role="menu"
      aria-label={MENU_TITLE}
      data-testid="acw-studio-node-context-menu"
      data-acw-node-id={node.id}
      className="es-context-menu"
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 30,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="es-context-menu-head">
        <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
        <span>{MENU_TITLE}</span>
      </header>
      <ul className="es-context-menu-list">
        {options.length === 0 ? (
          <li
            className="es-context-menu-empty"
            data-testid="acw-studio-node-context-menu-empty"
          >
            {NO_OPTIONS}
          </li>
        ) : (
          options.map((opt) => {
            const isCurrent = current === opt;
            return (
              <li key={opt}>
                <button
                  type="button"
                  role="menuitem"
                  className="es-context-menu-item"
                  data-current={isCurrent ? "true" : "false"}
                  data-testid={`acw-studio-node-context-menu-item-${opt}`}
                  disabled={isCurrent}
                  onClick={() => onPick(opt)}
                >
                  <span>{opt}</span>
                  {isCurrent ? (
                    <span className="es-context-menu-current">
                      {CURRENT_SUFFIX}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
      <footer className="es-context-menu-foot">
        <button
          type="button"
          className="es-context-menu-cancel"
          data-testid="acw-studio-node-context-menu-cancel"
          onClick={onClose}
        >
          {CANCEL_LABEL}
        </button>
      </footer>
    </div>
  );
}

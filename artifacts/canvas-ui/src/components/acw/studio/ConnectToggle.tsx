// EAStudio Phase 2 — Connect-mode toggle.
//
// A single thin button that flips the lens-keyed
// `connectModeByLens` slice in `acwViewState`. When the toggle is
// on, clicks on leaf nodes inside any quadrant fire a
// click-source-then-destination CONNECTS edge creation flow that
// the host page (`StudioCanvas` → `DomainGrid`) wires through the
// validator-gated `createEdge` mutation.
//
// The toggle owns no edge-creation logic itself. It only flips the
// boolean view-state slice and clears the pending-source slice on
// turn-off so a half-completed Connect cannot leak into a future
// session.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - State lives in the lens-keyed view-state singleton; this
//     component is a pure render of that slice.
import { useEffect, useState } from "react";
import { Plug, PlugZap } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  getConnectMode,
  getConnectPendingSource,
  setConnectMode,
  subscribeViewState,
} from "@/acw/acwViewState";

const ON_LABEL = "Connect mode: on";
const OFF_LABEL = "Connect mode: off";
const HINT_PENDING = "Click a destination node to draw a connection.";
const HINT_IDLE = "Click a source node, then a destination, to draw a connection.";

assertAllAcwPlaceholderLanguage([ON_LABEL, OFF_LABEL, HINT_PENDING, HINT_IDLE]);

export interface ConnectToggleProps {
  readonly lensId: string;
}

export function ConnectToggle({ lensId }: ConnectToggleProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;

  const on = getConnectMode(lensId);
  const pending = getConnectPendingSource(lensId);

  return (
    <div
      data-testid="acw-studio-connect-toggle"
      data-connect-mode={on ? "on" : "off"}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        onClick={() => setConnectMode(lensId, !on)}
        data-testid="acw-studio-connect-toggle-button"
        aria-pressed={on}
        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] uppercase tracking-widest transition-colors ${
          on
            ? "border-primary bg-primary/10 text-primary"
            : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
        }`}
      >
        {on ? <PlugZap className="w-3.5 h-3.5" /> : <Plug className="w-3.5 h-3.5" />}
        <span>{on ? ON_LABEL : OFF_LABEL}</span>
      </button>
      {on ? (
        <span
          className="text-[10px] text-muted-foreground"
          data-testid="acw-studio-connect-toggle-hint"
        >
          {pending !== null ? HINT_PENDING : HINT_IDLE}
        </span>
      ) : null}
    </div>
  );
}

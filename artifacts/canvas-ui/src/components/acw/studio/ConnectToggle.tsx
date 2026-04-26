// EAStudio Phase 2 — Connect-mode toggle.
//
// The Connect button is now part of the StudioTopBar action group
// so this stand-alone component is no longer mounted in the lens.
// It is kept as a thin re-export shim for any consumer that still
// imports `ConnectToggle` so a future surface (e.g. a fullscreen
// preview overlay) can mount it on its own without round-tripping
// the top bar.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - State lives in the lens-keyed view-state singleton; this
//     component is a pure render of that slice plus a setter call.
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  getConnectMode,
  setConnectMode,
  setConnectPendingSource,
  setSelectedEdgeId,
  subscribeViewState,
} from "@/acw/acwViewState";

const CONNECT_LABEL = "Connect";

assertAllAcwPlaceholderLanguage([CONNECT_LABEL]);

export interface ConnectToggleProps {
  readonly lensId: string;
}

export function ConnectToggle({ lensId }: ConnectToggleProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;

  const on = getConnectMode(lensId);

  const onClick = () => {
    const next = !on;
    setConnectMode(lensId, next);
    if (!next) setConnectPendingSource(lensId, null);
    setSelectedEdgeId(lensId, null);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="acw-studio-connect-toggle-button-standalone"
      aria-pressed={on}
      data-active={on ? "true" : "false"}
      className="es-btn"
    >
      <Zap className="w-3.5 h-3.5" />
      <span>{CONNECT_LABEL}</span>
    </button>
  );
}

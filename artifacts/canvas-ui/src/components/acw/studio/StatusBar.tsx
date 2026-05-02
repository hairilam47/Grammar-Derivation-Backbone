// EAStudio Phase 2 — bottom status bar (Task #99 visual alignment).
//
// Surfaces two pure read-outs the user needs while editing:
//   1. Live counts: nodes, edges (CONNECTS only — the only edge
//      kind EAStudio surfaces in Phase 2).
//   2. Mode: design / connect / pending-connect.
//
// The bar reads its data from the live grammar hook + the
// lens-keyed view-state slices; it never mutates anything.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Vocabulary uses "permitted" not "allowed".
//
// Task #165: a previously-rendered framework-name badge
// ("TOGAF 10 · ArchiMate 3.2") was removed from this surface to
// avoid carrying third-party trademark text in the user interface.
// The underlying file/symbol/type identifiers (togafContainment.ts,
// TOGAF_ARTEFACT_DOCKING, etc.) are intentionally untouched — those
// names are internal and do not appear on screen.
import { useEffect, useState } from "react";
import { Network, MousePointer2, Plug } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import {
  getConnectMode,
  getConnectPendingSource,
  subscribeViewState,
} from "@/acw/acwViewState";

const NODES_LABEL = "Nodes";
const EDGES_LABEL = "Connections";
const MODE_LABEL = "Mode";
const MODE_IDLE = "Design";
const MODE_CONNECT_IDLE = "Connect";
const MODE_CONNECT_PENDING = "Connect (pending)";

assertAllAcwPlaceholderLanguage([
  NODES_LABEL,
  EDGES_LABEL,
  MODE_LABEL,
  MODE_IDLE,
  MODE_CONNECT_IDLE,
  MODE_CONNECT_PENDING,
]);

export interface StatusBarProps {
  readonly lensId: string;
}

export function StatusBar({ lensId }: StatusBarProps) {
  const ws = useAcwWorkspace();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;

  // Per Task #99: the status-bar `n nodes` count reflects user-
  // authored components only — the four sealed domain containers
  // are infrastructure, not content, and counting them double-
  // counts every drop the user makes (the prototype's own status
  // strip excludes them for the same reason).
  const nodeCount = ws.structureGraph.nodes.filter(
    (n) => n.isDomainContainer !== true,
  ).length;
  const connectsCount = ws.structureGraph.edges.filter(
    (e) => e.kind === "CONNECTS",
  ).length;

  const connectOn = getConnectMode(lensId);
  const pending = getConnectPendingSource(lensId);
  const modeText = !connectOn
    ? MODE_IDLE
    : pending !== null
      ? MODE_CONNECT_PENDING
      : MODE_CONNECT_IDLE;
  const ModeIcon = !connectOn ? MousePointer2 : Plug;

  return (
    <footer
      data-testid="acw-studio-status-bar"
      data-mode={connectOn ? (pending !== null ? "pending" : "connect") : "idle"}
      className="es-status"
    >
      <div className="es-status-group">
        <span className="es-status-cell" data-testid="acw-studio-status-bar-nodes">
          <Network className="w-3 h-3" />
          <span className="es-status-key">{NODES_LABEL}</span>
          <span className="es-status-val">{nodeCount}</span>
        </span>
        <span className="es-status-cell" data-testid="acw-studio-status-bar-edges">
          <Plug className="w-3 h-3" />
          <span className="es-status-key">{EDGES_LABEL}</span>
          <span className="es-status-val">{connectsCount}</span>
        </span>
        <span className="es-status-cell" data-testid="acw-studio-status-bar-mode">
          <ModeIcon className="w-3 h-3" />
          <span className="es-status-key">{MODE_LABEL}</span>
          <span className="es-status-val">{modeText}</span>
        </span>
      </div>
    </footer>
  );
}

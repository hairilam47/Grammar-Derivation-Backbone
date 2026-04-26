// EAStudio Phase 2 — bottom status bar.
//
// Surfaces three pure read-outs the user needs while editing:
//   1. Live counts: nodes, edges (CONNECTS only — the only edge
//      kind EAStudio surfaces in Phase 2).
//   2. Mode: idle / connect / pending-connect.
//   3. A neutral "TOGAF / ArchiMate-aligned" badge. The badge is
//      a label only — no judgement, no scoring, no compliance
//      claim — and lives in the status bar so consumers can see
//      that the four-domain layout follows TOGAF's domain set
//      (Business, Data, Application, Technology) and ArchiMate's
//      layered viewpoint without inventing per-node decoration.
//
// The bar reads its data from the live grammar hook + the
// lens-keyed view-state slices; it never mutates anything.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Vocabulary uses "permitted" not "allowed"; the badge text is
//     literally framework names with no marketing modifier.
import { useEffect, useState } from "react";
import { Network, MousePointer2, Plug, ShieldCheck } from "lucide-react";
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
const MODE_IDLE = "Idle";
const MODE_CONNECT_IDLE = "Connect (pick source)";
const MODE_CONNECT_PENDING = "Connect (pick destination)";
const FRAMEWORK_BADGE = "TOGAF / ArchiMate-aligned";

assertAllAcwPlaceholderLanguage([
  NODES_LABEL,
  EDGES_LABEL,
  MODE_LABEL,
  MODE_IDLE,
  MODE_CONNECT_IDLE,
  MODE_CONNECT_PENDING,
  FRAMEWORK_BADGE,
]);

export interface StatusBarProps {
  readonly lensId: string;
}

export function StatusBar({ lensId }: StatusBarProps) {
  const ws = useAcwWorkspace();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;

  const nodeCount = ws.structureGraph.nodes.length;
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
  const modeIcon = !connectOn ? (
    <MousePointer2 className="w-3 h-3" />
  ) : (
    <Plug className="w-3 h-3" />
  );

  return (
    <footer
      data-testid="acw-studio-status-bar"
      data-mode={connectOn ? (pending !== null ? "pending" : "connect") : "idle"}
      className="flex items-center justify-between gap-3 px-3 py-1.5 border-t border-border/30 text-[10px] font-mono text-muted-foreground"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex items-center gap-1"
          data-testid="acw-studio-status-bar-nodes"
        >
          <Network className="w-3 h-3" />
          <span className="uppercase tracking-widest">{NODES_LABEL}</span>
          <span className="text-foreground tabular-nums">{nodeCount}</span>
        </span>
        <span
          className="flex items-center gap-1"
          data-testid="acw-studio-status-bar-edges"
        >
          <Plug className="w-3 h-3" />
          <span className="uppercase tracking-widest">{EDGES_LABEL}</span>
          <span className="text-foreground tabular-nums">{connectsCount}</span>
        </span>
        <span
          className="flex items-center gap-1"
          data-testid="acw-studio-status-bar-mode"
        >
          {modeIcon}
          <span className="uppercase tracking-widest">{MODE_LABEL}</span>
          <span className="text-foreground">{modeText}</span>
        </span>
      </div>
      <span
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest"
        data-testid="acw-studio-status-bar-framework-badge"
      >
        <ShieldCheck className="w-3 h-3" />
        <span>{FRAMEWORK_BADGE}</span>
      </span>
    </footer>
  );
}

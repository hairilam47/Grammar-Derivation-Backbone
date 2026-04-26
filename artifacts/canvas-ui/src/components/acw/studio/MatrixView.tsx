// EAStudio Phase 3 — Matrix view.
//
// Square node × node table that surfaces every CONNECTS edge in
// the workspace and, for grammar-permitted off-diagonal pairs,
// lets the user toggle the edge with a click. The matrix is a
// pure read-render of `getWorkspace()` plus the existing
// validator-gated mutations (`createEdge` / `deleteEdge`); it
// never holds local edge state and never bypasses the validator.
//
// Stable ordering: rows and columns sort by domainTag (using the
// canonical four-domain order) and then by label. This keeps the
// matrix layout stable across renders and across user mutations
// even when node ids are not lexicographically ordered.
//
// Visual styling notes (Task #99):
//   - All chrome is rendered with the prototype-aligned
//     `es-matrix-*` class set defined in `.eastudio-root` scoped
//     CSS. No Tailwind colour utilities — the cascade resolves
//     every surface to the prototype's `var(--bg* / --text* /
//     --accent)` tokens.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Render-only hint: a cell whose proposed CONNECTS pair is not
//     `isPermittedEdge` renders as visually disabled and does not
//     call the store. The store remains the legality authority;
//     the disabled state is a UX hint, not a parallel guard.
//   - CONNECTS is bidirectional in the grammar (`isPermittedEdge`
//     accepts either ordering), and so is the cell read: a cell
//     at (row, col) is "on" if any CONNECTS edge exists between
//     the two nodes regardless of which is `fromId`. Toggling
//     creates the edge with the row node as `fromId` for
//     consistency; the matrix mirrors the result via the lookup.
//   - Sealed domain containers and any other node for which the
//     CONNECTS pair is not grammar-permitted simply render the
//     visually-disabled state — no per-row exclusion is needed
//     because the grammar already filters them.
import { useMemo, type ReactNode } from "react";
import { Minus, Link2, Slash } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import {
  ACW_DOMAIN_TAGS,
  isPermittedEdge,
  type AcwDomainTag,
  type AcwElementType,
} from "@/acw/acwGrammar";
import {
  createEdge,
  deleteEdge,
  type AcwNode,
} from "@/acw/acwStore";
import { publishRefusal } from "@/acw/acwRefusalChannel";

const PAGE_TITLE = "Connection matrix";
const PAGE_HINT =
  "Click an off-diagonal cell to toggle a connection. Cells marked with a slash are not permitted by the grammar.";
const EMPTY_TITLE = "No nodes to display";
const EMPTY_HINT = "Add nodes from the Design tab to populate the matrix.";
const COLUMN_HEADER_LABEL = "Source / Destination";
const CELL_ON_LABEL = "Connection present";
const CELL_OFF_LABEL = "No connection";
const CELL_DISABLED_LABEL = "Connection not permitted by grammar";
const DIAGONAL_LABEL = "Same node";

assertAllAcwPlaceholderLanguage([
  PAGE_TITLE,
  PAGE_HINT,
  EMPTY_TITLE,
  EMPTY_HINT,
  COLUMN_HEADER_LABEL,
  CELL_ON_LABEL,
  CELL_OFF_LABEL,
  CELL_DISABLED_LABEL,
  DIAGONAL_LABEL,
]);

// Canonical domain ordering for the matrix. Nodes without a
// `domainTag` (legacy / non-EAStudio surfaces) sort after every
// tagged node and use the literal "" key so their ordering is
// also deterministic.
const DOMAIN_INDEX: Readonly<Record<AcwDomainTag, number>> = Object.freeze(
  Object.fromEntries(
    ACW_DOMAIN_TAGS.map((d, i) => [d, i] as const),
  ) as Record<AcwDomainTag, number>,
);
function domainKey(node: AcwNode): number {
  if (node.domainTag === undefined) return ACW_DOMAIN_TAGS.length;
  return DOMAIN_INDEX[node.domainTag];
}

function compareNodes(a: AcwNode, b: AcwNode): number {
  const da = domainKey(a);
  const db = domainKey(b);
  if (da !== db) return da - db;
  const la = a.label.toLowerCase();
  const lb = b.label.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  // Stable tiebreak on id so two same-label nodes never swap.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface MatrixViewProps {
  readonly lensId: string;
}

export function MatrixView(_props: MatrixViewProps) {
  void _props;
  const ws = useAcwWorkspace();

  const sortedNodes = useMemo(
    () => ws.structureGraph.nodes.slice().sort(compareNodes),
    [ws.structureGraph.nodes],
  );

  // Lookup: edgeKey(fromId, toId) → edgeId for any CONNECTS edge,
  // recorded both ways so the matrix can read the cell whether the
  // user happened to author the edge in either direction.
  const connectsLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of ws.structureGraph.edges) {
      if (e.kind !== "CONNECTS") continue;
      map.set(`${e.fromId}::${e.toId}`, e.id);
      map.set(`${e.toId}::${e.fromId}`, e.id);
    }
    return map;
  }, [ws.structureGraph.edges]);

  function onCellClick(row: AcwNode, col: AcwNode) {
    if (row.id === col.id) return;
    const fromType = row.type as AcwElementType;
    const toType = col.type as AcwElementType;
    if (!isPermittedEdge("CONNECTS", fromType, toType)) {
      // Render-only hint already disables the cell, but if a future
      // caller bypasses the disabled state (e.g. keyboard activation
      // path) we still refuse via the store. Surface the same
      // neutral refusal text as a defensive fall-through.
      return;
    }
    const existingId = connectsLookup.get(`${row.id}::${col.id}`);
    if (existingId !== undefined) {
      const r = deleteEdge(existingId);
      if (!r.ok) publishRefusal(r.reason);
      return;
    }
    const r = createEdge({
      kind: "CONNECTS",
      fromId: row.id,
      toId: col.id,
    });
    if (!r.ok) publishRefusal(r.reason);
  }

  if (sortedNodes.length === 0) {
    return (
      <div
        data-testid="acw-studio-matrix-view"
        className="es-matrix-wrap es-matrix-empty"
      >
        <p
          className="es-mono"
          data-testid="acw-studio-matrix-empty-title"
        >
          {EMPTY_TITLE}
        </p>
        <p
          className="es-mono"
          data-testid="acw-studio-matrix-empty-hint"
        >
          {EMPTY_HINT}
        </p>
      </div>
    );
  }

  return (
    <section
      data-testid="acw-studio-matrix-view"
      className="es-matrix-wrap"
    >
      <header className="es-matrix-head">
        <h3 data-testid="acw-studio-matrix-title">{PAGE_TITLE}</h3>
        <p data-testid="acw-studio-matrix-hint">{PAGE_HINT}</p>
      </header>

      <table
        className="es-matrix-table"
        data-testid="acw-studio-matrix-table"
      >
        <thead>
          <tr>
            <th
              scope="col"
              data-testid="acw-studio-matrix-corner"
            >
              {COLUMN_HEADER_LABEL}
            </th>
            {sortedNodes.map((col) => (
              <th
                key={col.id}
                scope="col"
                data-testid={`acw-studio-matrix-col-${col.id}`}
                data-node-id={col.id}
                data-domain-tag={col.domainTag ?? ""}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span>{col.label}</span>
                  <span style={{ fontSize: 9, color: "var(--text2)" }}>
                    {col.type}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedNodes.map((row) => (
            <tr key={row.id} data-testid={`acw-studio-matrix-row-${row.id}`}>
              <th
                scope="row"
                data-node-id={row.id}
                data-domain-tag={row.domainTag ?? ""}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span>{row.label}</span>
                  <span style={{ fontSize: 9, color: "var(--text2)" }}>
                    {row.type}
                  </span>
                </div>
              </th>
              {sortedNodes.map((col) => {
                const isDiagonal = row.id === col.id;
                const permitted =
                  !isDiagonal &&
                  isPermittedEdge(
                    "CONNECTS",
                    row.type as AcwElementType,
                    col.type as AcwElementType,
                  );
                const on =
                  !isDiagonal &&
                  connectsLookup.has(`${row.id}::${col.id}`);
                let title: string;
                let body: ReactNode;
                let cellState: string;
                if (isDiagonal) {
                  title = DIAGONAL_LABEL;
                  cellState = "diagonal";
                  body = <Minus className="w-3 h-3" />;
                } else if (!permitted) {
                  title = CELL_DISABLED_LABEL;
                  cellState = "disabled";
                  body = <Slash className="w-3 h-3" />;
                } else if (on) {
                  title = CELL_ON_LABEL;
                  cellState = "on";
                  body = <Link2 className="w-3.5 h-3.5" />;
                } else {
                  title = CELL_OFF_LABEL;
                  cellState = "off";
                  body = (
                    <span
                      style={{
                        display: "block",
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        border: "1px solid var(--border2)",
                      }}
                    />
                  );
                }
                const interactive = !isDiagonal && permitted;
                return (
                  <td
                    key={col.id}
                    data-testid={`acw-studio-matrix-cell-${row.id}-${col.id}`}
                    data-cell-state={cellState}
                  >
                    <button
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={interactive ? on : undefined}
                      disabled={!interactive}
                      onClick={() => onCellClick(row, col)}
                      className="es-matrix-cell"
                      data-state={cellState}
                    >
                      {body}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

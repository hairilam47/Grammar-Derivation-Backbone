// ACW v1 — shared lens-side renderer.
//
// Each of the five lens views invokes this panel with its own filter
// over the shared `structureGraph`, satisfying master prompt §12:
// "wire each lens view to the shared structureGraph so that all five
// lenses render the same nodes and edges through their respective
// filters". The panel itself owns no semantics — it lists nodes and
// edges that pass the predicates as plain neutral text.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_ELEMENT_TYPE_LABEL,
  ACW_EDGE_KIND_LABEL,
} from "@/acw/acwGrammar";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import type { AcwEdge, AcwNode } from "@/acw/acwStore";

const NODES_TITLE = "Elements in this lens";
const EDGES_TITLE = "Relationships in this lens";
const NODES_EMPTY = "No elements pass this lens filter.";
const EDGES_EMPTY = "No relationships pass this lens filter.";
const PARENT_PREFIX = "inside";
const ROOT_LABEL = "workspace root";

assertAllAcwPlaceholderLanguage([
  NODES_TITLE,
  EDGES_TITLE,
  NODES_EMPTY,
  EDGES_EMPTY,
  PARENT_PREFIX,
  ROOT_LABEL,
]);

export interface LiveStructurePanelProps {
  testIdPrefix: string;
  nodeFilter: (node: AcwNode) => boolean;
  edgeFilter?: (edge: AcwEdge, nodes: readonly AcwNode[]) => boolean;
}

export function LiveStructurePanel(props: LiveStructurePanelProps) {
  const { testIdPrefix, nodeFilter, edgeFilter } = props;
  const workspace = useAcwWorkspace();
  const allNodes = workspace.structureGraph.nodes;
  const visibleNodes = allNodes.filter(nodeFilter);
  const visibleEdges = workspace.structureGraph.edges.filter(
    edgeFilter ? (e) => edgeFilter(e, allNodes) : () => false,
  );
  const nodeById = new Map(allNodes.map((n) => [n.id, n] as const));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card data-testid={`${testIdPrefix}-nodes`}>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {NODES_TITLE}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-[11px] space-y-1">
          {visibleNodes.length === 0 ? (
            <p
              className="italic text-muted-foreground/70"
              data-testid={`${testIdPrefix}-nodes-empty`}
            >
              {NODES_EMPTY}
            </p>
          ) : (
            <ul className="space-y-1">
              {visibleNodes.map((n) => {
                const parent = n.parentId ? nodeById.get(n.parentId) : undefined;
                const parentText = parent
                  ? `${PARENT_PREFIX} ${ACW_ELEMENT_TYPE_LABEL[parent.type]} ${parent.label}`
                  : `${PARENT_PREFIX} ${ROOT_LABEL}`;
                return (
                  <li
                    key={n.id}
                    data-testid={`${testIdPrefix}-node-${n.id}`}
                    className="border border-border/40 rounded px-2 py-1 flex items-baseline gap-2"
                  >
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {ACW_ELEMENT_TYPE_LABEL[n.type]}
                    </span>
                    <span className="font-mono">{n.label}</span>
                    <span className="text-[10px] text-muted-foreground/70 ml-auto">
                      {parentText}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {edgeFilter !== undefined ? (
        <Card data-testid={`${testIdPrefix}-edges`}>
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {EDGES_TITLE}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] space-y-1">
            {visibleEdges.length === 0 ? (
              <p
                className="italic text-muted-foreground/70"
                data-testid={`${testIdPrefix}-edges-empty`}
              >
                {EDGES_EMPTY}
              </p>
            ) : (
              <ul className="space-y-1">
                {visibleEdges.map((e) => {
                  const from = nodeById.get(e.fromId);
                  const to = nodeById.get(e.toId);
                  if (!from || !to) return null;
                  return (
                    <li
                      key={e.id}
                      data-testid={`${testIdPrefix}-edge-${e.id}`}
                      className="border border-border/40 rounded px-2 py-1 flex items-baseline gap-2"
                    >
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {ACW_EDGE_KIND_LABEL[e.kind]}
                      </span>
                      <span className="font-mono">{from.label}</span>
                      <span className="text-[10px] text-muted-foreground/70">→</span>
                      <span className="font-mono">{to.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

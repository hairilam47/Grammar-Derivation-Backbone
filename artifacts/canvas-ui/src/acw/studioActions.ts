// EAStudio Phase 1–3 visual alignment (Task #99) — Studio top-bar
// action helpers.
//
// The prototype top-bar exposes two destructive shortcuts:
//   * `Sample` — wipe the canvas and re-seed it with a small
//     four-domain example so a first-time user can see the surface
//     populated immediately;
//   * `Clear` — wipe every user-authored card and connection while
//     leaving the four sealed domain containers in place.
//
// Both helpers route every mutation through the validator-gated
// store API (`deleteNode`, `deleteEdge`, `createNode`, `createEdge`)
// — there is no direct mutation of `localStorage` and no bypass of
// the refusal channel. A refused mutation publishes through the
// shared `acwRefusalChannel` so the studio's inline banner surfaces
// the verbatim reason; the helper continues with the remaining
// items so a single refusal cannot leave the canvas in a half-
// torn-down state.
import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  getWorkspace,
} from "./acwStore";
import { publishRefusal } from "./acwRefusalChannel";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_DOMAIN_CONTAINERS,
  ensureDomainContainers,
} from "./palette/domainContainerSeed";
import { paletteItemByLabel } from "./palette/paletteRegistry";
import type { AcwDomainTag } from "./acwGrammar";

// Confirm-dialog copy. Surfaces the same intent the prototype's
// `confirm("Clear all components?")` did but in workspace-neutral
// language. Asserted at module load so it never drifts into a
// forbidden ACW token.
const CLEAR_CONFIRM =
  "Clear every node and connection from the workspace?";

assertAllAcwPlaceholderLanguage([CLEAR_CONFIRM]);

// Wipe every user-authored card and connection from the workspace
// while leaving the four sealed domain containers intact. Edges are
// removed first so leaf-node deletion does not cascade through any
// refusal that would leave the structureGraph holding dangling
// endpoints.
//
// Per Task #99 step 9 the call is gated behind a confirm dialog.
// `confirmFn` is injectable so the unit tests can drive the path
// deterministically without a real `window`. In production the
// caller passes `window.confirm`; if no `window` is available
// (SSR, tests with no jsdom override) the function falls through
// without prompting — the seed path is the only consumer that
// needs the dialog and it always runs in the browser.
export function clearStudio(
  confirmFn: ((message: string) => boolean) | null = null,
): void {
  const ask = confirmFn ?? (typeof window !== "undefined" ? window.confirm.bind(window) : null);
  if (ask !== null) {
    if (!ask(CLEAR_CONFIRM)) return;
  }
  ensureDomainContainers();
  const before = getWorkspace();
  for (const e of [...before.structureGraph.edges]) {
    const r = deleteEdge(e.id);
    if (!r.ok) publishRefusal(r.reason);
  }
  // Re-read after the edge sweep so the snapshot we delete from
  // reflects the writes above.
  const mid = getWorkspace();
  // Sort by descending depth so deeper nodes are removed before
  // their ancestors. Depth is computed via the `parentId` chain so
  // a future surface that re-introduces drilldown does not start
  // refusing every delete.
  const depthOf = (id: string): number => {
    const byId = new Map(mid.structureGraph.nodes.map((n) => [n.id, n] as const));
    let cursor: string | null = id;
    let d = 0;
    let guard = 0;
    while (cursor !== null && guard < 1024) {
      const n = byId.get(cursor);
      if (n === undefined) return d;
      if (n.parentId === null) return d;
      cursor = n.parentId;
      d += 1;
      guard += 1;
    }
    return d;
  };
  const candidates = mid.structureGraph.nodes
    .filter((n) => n.isDomainContainer !== true)
    .slice()
    .sort((a, b) => depthOf(b.id) - depthOf(a.id));
  for (const n of candidates) {
    const r = deleteNode(n.id);
    if (!r.ok) publishRefusal(r.reason);
  }
}

// Sample data — verbatim from the prototype's `autoLayout` routine
// so the post-reset canvas matches the prototype's first-paint
// layout. Each entry pairs a palette label (which the registry
// resolves to a tile) with a custom display label the seed uses
// when materialising the node. Connections name their endpoints
// by the same custom display labels so the seeded edges always
// land on the right pair regardless of how the registry orders
// the palette internally.
const SAMPLE_TILES: ReadonlyArray<{
  readonly domain: AcwDomainTag;
  readonly paletteLabel: string;
  readonly displayLabel: string;
}> = Object.freeze([
  { domain: "business", paletteLabel: "Strategy Map", displayLabel: "Digital Strategy" },
  { domain: "business", paletteLabel: "Capability Map", displayLabel: "Customer Journey" },
  { domain: "business", paletteLabel: "Governance Model", displayLabel: "Risk Governance" },
  { domain: "data", paletteLabel: "Data Store", displayLabel: "Enterprise Data Lake" },
  { domain: "data", paletteLabel: "Master Data", displayLabel: "Customer MDM" },
  { domain: "data", paletteLabel: "ETL Pipeline", displayLabel: "Real-time ETL" },
  { domain: "application", paletteLabel: "API Gateway", displayLabel: "API Gateway" },
  { domain: "application", paletteLabel: "Microservice", displayLabel: "Order Service" },
  { domain: "application", paletteLabel: "Web Portal", displayLabel: "Customer Portal" },
  { domain: "technology", paletteLabel: "Cloud Region", displayLabel: "AWS us-east-1" },
  { domain: "technology", paletteLabel: "IAM Service", displayLabel: "Okta IAM" },
  { domain: "technology", paletteLabel: "Monitoring", displayLabel: "Datadog APM" },
] as const);

// Cross-domain sample connections referenced by display label.
// Verbatim mirror of the prototype's autoLayout
// `connections.push(...)` block. Per Task #99 step 9, every
// `createEdge` call routes through the existing validator; if any
// refusal fires, the seed aborts and surfaces the verbatim reason
// through the refusal channel. This keeps the grammar — not the
// seed — as the single legality authority.
const SAMPLE_EDGES: ReadonlyArray<{
  readonly fromLabel: string;
  readonly toLabel: string;
}> = Object.freeze([
  { fromLabel: "Digital Strategy", toLabel: "Enterprise Data Lake" },
  { fromLabel: "Enterprise Data Lake", toLabel: "API Gateway" },
  { fromLabel: "API Gateway", toLabel: "AWS us-east-1" },
  { fromLabel: "Customer Journey", toLabel: "Order Service" },
] as const);

const CONTAINER_BY_DOMAIN: Readonly<Record<AcwDomainTag, string>> =
  Object.freeze(
    Object.fromEntries(
      ACW_DOMAIN_CONTAINERS.map((c) => [c.domain, c.id] as const),
    ) as Record<AcwDomainTag, string>,
  );

// Wipe the canvas and lay down the prototype's sample workspace.
// The seed is deterministic (same palette resolution, same display
// labels, same connection list every run) so a refresh after Sample
// shows an identical layout.
export function seedStudioSample(): void {
  clearStudio();
  // Map display label → freshly created node id so the connection
  // pass below can resolve endpoints without scanning the workspace
  // for the most-recently-created node with a given label.
  const idByLabel = new Map<string, string>();
  for (const t of SAMPLE_TILES) {
    const item = paletteItemByLabel(t.paletteLabel);
    if (item === undefined) {
      // Palette mismatch is structural — abort so the seed never
      // produces a partial workspace.
      publishRefusal(
        `The sample tile "${t.paletteLabel}" is not present in the palette.`,
      );
      return;
    }
    const containerId = CONTAINER_BY_DOMAIN[t.domain];
    const r = createNode({
      type: item.elementType,
      parentId: containerId,
      label: t.displayLabel,
      domainTag: t.domain,
    });
    if (!r.ok) {
      // Per Task #99 step 9: any validator refusal aborts the seed
      // and surfaces the verbatim reason. The store's invariant
      // chain has already rejected the offending mutation, so the
      // workspace is left in whatever state preceded the bad call.
      publishRefusal(r.reason);
      return;
    }
    idByLabel.set(t.displayLabel, r.id);
  }
  for (const edge of SAMPLE_EDGES) {
    const fromId = idByLabel.get(edge.fromLabel);
    const toId = idByLabel.get(edge.toLabel);
    if (fromId === undefined || toId === undefined) {
      publishRefusal(
        `The sample connection "${edge.fromLabel}" → "${edge.toLabel}" cannot be created because one of its endpoints did not seed.`,
      );
      return;
    }
    const r = createEdge({
      kind: "CONNECTS",
      fromId,
      toId,
    });
    if (!r.ok) {
      publishRefusal(r.reason);
      return;
    }
  }
}

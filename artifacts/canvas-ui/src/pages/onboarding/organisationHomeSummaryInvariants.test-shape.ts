// Build-time invariants for the Organisation Home work-item
// summary helper. Asserts at module load:
//   1. `total` counts every non-archived item (including the
//      auto-seeded `ea-blueprint`).
//   2. `byType` excludes `ea-blueprint` and tallies the other
//      three types correctly.
//   3. Archived items are skipped from both counters.
//   4. An empty input produces zeroed counters.

import type { WorkItem } from "@/governance/workItemStore";
import { summariseWorkItems } from "./organisationHomeSummary";

function wi(
  id: string,
  type: WorkItem["type"],
  archived: boolean,
): WorkItem {
  return {
    id,
    orgId: "org-probexxxxxx",
    type,
    title: id,
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    archived,
  };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(`[organisationHomeSummary invariants] ${msg}`);
  }
}

function probe(): void {
  const empty = summariseWorkItems([]);
  assert(empty.total === 0, "empty total must be 0");
  assert(
    empty.byType.project === 0 &&
      empty.byType.enhancement === 0 &&
      empty.byType["change-request"] === 0,
    "empty byType must be all zero",
  );

  const mixed: readonly WorkItem[] = [
    wi("wi-blueprintaa", "ea-blueprint", false),
    wi("wi-projecta1", "project", false),
    wi("wi-projecta2", "project", false),
    wi("wi-enhancea1", "enhancement", false),
    wi("wi-changea11", "change-request", false),
    wi("wi-archiveda1", "project", true),
    wi("wi-archiveda2", "ea-blueprint", true),
  ];
  const s = summariseWorkItems(mixed);
  assert(
    s.total === 5,
    `total must include the EA Blueprint and exclude archived rows; got ${s.total}`,
  );
  assert(
    s.byType.project === 2,
    `project count must be 2 (archived excluded); got ${s.byType.project}`,
  );
  assert(
    s.byType.enhancement === 1,
    `enhancement count must be 1; got ${s.byType.enhancement}`,
  );
  assert(
    s.byType["change-request"] === 1,
    `change-request count must be 1; got ${s.byType["change-request"]}`,
  );
}

probe();

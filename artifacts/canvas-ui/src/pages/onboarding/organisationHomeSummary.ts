// Pure-function helpers for the Organisation Home hub.

import type { WorkItem, WorkItemType } from "@/governance/workItemStore";

export interface WorkItemBreakdown {
  readonly total: number;
  readonly byType: Readonly<
    Record<Exclude<WorkItemType, "ea-blueprint">, number>
  >;
}

// `total` counts every non-archived Work Item (including the
// auto-seeded EA Blueprint). `byType` excludes EA Blueprint
// because it is rendered separately on its own card.
export function summariseWorkItems(
  items: readonly WorkItem[],
): WorkItemBreakdown {
  const byType: Record<Exclude<WorkItemType, "ea-blueprint">, number> = {
    project: 0,
    enhancement: 0,
    "change-request": 0,
  };
  let total = 0;
  for (const wi of items) {
    if (wi.archived) continue;
    total += 1;
    if (wi.type === "ea-blueprint") continue;
    byType[wi.type] += 1;
  }
  return { total, byType };
}

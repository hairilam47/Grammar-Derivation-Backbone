// Placeholder WorkItem identity.
//
// Stage A (ADC Wizard Retrofit) introduces requirements / modules /
// requirements-contract data that conceptually belong to a "WorkItem"
// (the unit of architectural work an architect is reasoning about).
// A full WorkItem store with onboarding, ownership, and lifecycle
// fields is out of scope for this retrofit; until that store lands,
// every requirement / module / contract is keyed to this single
// hard-coded placeholder id.
//
// Keeping the id behind a function (rather than inlining the literal
// in every store) makes the swap to a real WorkItem store a one-file
// edit, and makes it grep-able for future work.

export const PLACEHOLDER_WORK_ITEM_ID = "work-item-placeholder" as const;

export interface WorkItemPlaceholder {
  readonly workItemId: typeof PLACEHOLDER_WORK_ITEM_ID;
  readonly title: string;
}

const PLACEHOLDER: WorkItemPlaceholder = Object.freeze({
  workItemId: PLACEHOLDER_WORK_ITEM_ID,
  title: "Current architectural work",
});

export function getPlaceholderWorkItem(): WorkItemPlaceholder {
  return PLACEHOLDER;
}

export function getPlaceholderWorkItemId(): string {
  return PLACEHOLDER_WORK_ITEM_ID;
}

// WorkItemDashboard — second surface in the onboarding flow. Lists
// every Work Item that belongs to the active Organisation. Offers
// a "Create Work Item" CTA. Selecting a Work Item persists the
// active workItemId and navigates to the Workspace Hub.
//
// Phase 2 (SaaS Onboarding). Every static label is asserted against
// `assertAllOnboardingLanguage` at module load.

import { useEffect, useMemo, useSyncExternalStore, useState } from "react";
import { useLocation } from "wouter";
import { Briefcase, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentScope } from "@/governance/CurrentOrgWorkItemContext";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import {
  getOrganisation,
  subscribe as subscribeOrgs,
  getStoreVersion as getOrgStoreVersion,
} from "@/governance/orgStore";
import {
  listWorkItemsForOrg,
  subscribe as subscribeWorkItems,
  getStoreVersion as getWorkItemStoreVersion,
  type WorkItem,
} from "@/governance/workItemStore";
import { NewWorkItemDialog } from "./NewWorkItemDialog";

const TYPE_LABELS = {
  "ea-blueprint": "EA Blueprint",
  project: "Project",
  enhancement: "Enhancement",
  "change-request": "Change Request",
} as const;

// Plural labels used as section headings. The dashboard renders
// one section per Work-Item type so the user sees the EA Blueprint
// stand apart from operational Projects, Enhancements, and
// Change Requests.
const TYPE_SECTION_LABELS = {
  "ea-blueprint": "EA Blueprints",
  project: "Projects",
  enhancement: "Enhancements",
  "change-request": "Change Requests",
} as const;

// Section render order. EA Blueprint is always first because every
// organisation carries exactly one and it anchors the operational
// Work Items (Projects / Enhancements / Change Requests) below.
const TYPE_RENDER_ORDER: readonly (keyof typeof TYPE_SECTION_LABELS)[] = [
  "ea-blueprint",
  "project",
  "enhancement",
  "change-request",
];

const STATIC_LABELS = {
  heading: "Work Items",
  description: "Open an existing Work Item or create a new one.",
  emptyTitle: "No Work Items yet",
  emptyHint: "Every Organisation begins with an EA Blueprint Work Item.",
  createButton: "Create Work Item",
  openButton: "Open",
  switchOrgButton: "Switch Organisation",
  ...TYPE_LABELS,
  ...TYPE_SECTION_LABELS,
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

export default function WorkItemDashboard() {
  const { orgId, setOrgId, setWorkItemId } = useCurrentScope();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const orgVersion = useSyncExternalStore(
    subscribeOrgs,
    getOrgStoreVersion,
    getOrgStoreVersion,
  );
  const wiVersion = useSyncExternalStore(
    subscribeWorkItems,
    getWorkItemStoreVersion,
    getWorkItemStoreVersion,
  );

  const org = useMemo(
    () => (orgId ? getOrganisation(orgId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, orgVersion],
  );
  const items: readonly WorkItem[] = useMemo(
    () => (orgId ? listWorkItemsForOrg(orgId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, wiVersion],
  );

  // Group by type so each section can be rendered under its own
  // heading. `listWorkItemsForOrg` already returns items sorted
  // (EA Blueprint first, then by createdAt ascending), so each
  // group preserves a stable order.
  const itemsByType = useMemo(() => {
    const groups: Record<keyof typeof TYPE_SECTION_LABELS, WorkItem[]> = {
      "ea-blueprint": [],
      project: [],
      enhancement: [],
      "change-request": [],
    };
    for (const wi of items) groups[wi.type].push(wi);
    return groups;
  }, [items]);

  // Defensive — the router gate should never let us land here
  // without an active org, but if it does we redirect home.
  useEffect(() => {
    if (!orgId) navigate("/");
  }, [orgId, navigate]);

  if (!orgId) return null;

  // Selecting (or creating) a Work Item must land the user on the
  // Workspace Hub — the third surface in the onboarding flow
  // (Org Selector → Work-Item Dashboard → Workspace Hub) — NOT
  // directly on an ADC/CTAD/ACW tool. RootGate at "/" renders the
  // WorkspaceHub once both `orgId` and `workItemId` are set.
  function handleOpen(id: string) {
    setWorkItemId(id);
    navigate("/");
  }

  function handleCreated(id: string) {
    setDialogOpen(false);
    setWorkItemId(id);
    navigate("/");
  }

  function handleSwitchOrg() {
    setOrgId(null);
    navigate("/");
  }

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground flex flex-col"
      data-testid="work-item-dashboard"
    >
      <main className="flex-1 container max-w-4xl mx-auto px-4 py-16">
        <div
          className="mb-10 flex flex-wrap items-start justify-between gap-4"
          data-testid="work-item-dashboard-heading"
        >
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {STATIC_LABELS.heading}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {org ? `${org.name} — ${STATIC_LABELS.description}` : STATIC_LABELS.description}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleSwitchOrg}
            data-testid="button-switch-org"
          >
            {STATIC_LABELS.switchOrgButton}
          </Button>
        </div>

        <div className="mb-6">
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="gap-2"
            data-testid="button-create-work-item"
          >
            <Plus className="w-4 h-4" />
            {STATIC_LABELS.createButton}
          </Button>
        </div>

        {items.length === 0 ? (
          <Card data-testid="work-item-empty">
            <CardHeader className="space-y-2">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-secondary/60 border border-border/60">
                <Briefcase className="w-5 h-5" aria-hidden="true" />
              </span>
              <CardTitle>{STATIC_LABELS.emptyTitle}</CardTitle>
              <CardDescription>{STATIC_LABELS.emptyHint}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div
            className="space-y-10"
            data-testid="work-item-list"
          >
            {TYPE_RENDER_ORDER.map((type) => {
              const group = itemsByType[type];
              if (group.length === 0) return null;
              return (
                <section
                  key={type}
                  className="space-y-4"
                  data-testid={`work-item-section-${type}`}
                >
                  <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    {TYPE_SECTION_LABELS[type]}
                  </h2>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {group.map((wi) => (
                      <li key={wi.id}>
                        <Card
                          className="lift flex flex-col"
                          data-testid={`work-item-card-${wi.id}`}
                        >
                          <CardHeader className="space-y-2">
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/60 border border-border/60">
                              <Briefcase className="w-4 h-4" aria-hidden="true" />
                            </span>
                            <CardTitle className="text-base">{wi.title}</CardTitle>
                            <CardDescription className="text-xs">
                              {TYPE_LABELS[wi.type]}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="mt-auto">
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => handleOpen(wi.id)}
                              data-testid={`button-open-work-item-${wi.id}`}
                            >
                              {STATIC_LABELS.openButton}
                            </Button>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <NewWorkItemDialog
        open={dialogOpen}
        orgId={orgId}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

// Compact Organisation + Work-Item switcher rendered in the
// AppShell topbar.
//
// Phase 2 (SaaS Onboarding) — surfaces the active scope on every
// page so the architect always knows which tenant they are in.
// Clicking the org chip clears the active scope and returns to the
// OrgSelector; clicking the Work-Item chip clears only the active
// Work Item and returns to the WorkItemDashboard. The switcher is
// hidden when no scope is active (the user is currently on the
// OrgSelector). Every static label is asserted against
// `assertAllOnboardingLanguage` at module load.

import { useMemo, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { Building2, Briefcase } from "lucide-react";

import { useCurrentScope } from "@/governance/CurrentOrgWorkItemContext";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import {
  getOrganisation,
  subscribe as subscribeOrgs,
  getStoreVersion as getOrgStoreVersion,
} from "@/governance/orgStore";
import {
  getWorkItem,
  subscribe as subscribeWorkItems,
  getStoreVersion as getWorkItemStoreVersion,
} from "@/governance/workItemStore";

const STATIC_LABELS = {
  switchOrgTitle: "Switch Organisation",
  switchWorkItemTitle: "Switch Work Item",
} as const;

assertAllOnboardingLanguage([
  STATIC_LABELS.switchOrgTitle,
  STATIC_LABELS.switchWorkItemTitle,
]);

export function OrgWorkItemSwitcher() {
  const { orgId, workItemId, setOrgId, setWorkItemId } = useCurrentScope();
  const [, navigate] = useLocation();

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
  const wi = useMemo(
    () => (workItemId ? getWorkItem(workItemId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workItemId, wiVersion],
  );

  if (!orgId) return null;

  return (
    <div
      className="hidden md:flex items-center gap-1 ml-auto mr-2 text-xs"
      data-testid="org-work-item-switcher"
    >
      <button
        type="button"
        onClick={() => {
          setOrgId(null);
          navigate("/");
        }}
        title={STATIC_LABELS.switchOrgTitle}
        aria-label={STATIC_LABELS.switchOrgTitle}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors"
        data-testid="topbar-switch-org"
      >
        <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="max-w-[12rem] truncate">{org?.name ?? orgId}</span>
      </button>
      {workItemId && (
        <>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => {
              setWorkItemId(null);
              navigate("/dashboard");
            }}
            title={STATIC_LABELS.switchWorkItemTitle}
            aria-label={STATIC_LABELS.switchWorkItemTitle}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors"
            data-testid="topbar-switch-work-item"
          >
            <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="max-w-[12rem] truncate">{wi?.title ?? workItemId}</span>
          </button>
        </>
      )}
    </div>
  );
}

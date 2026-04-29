// Compact Organisation + Work-Item switcher rendered in the
// AppShell topbar.
//
// Phase 2 (SaaS Onboarding) — surfaces the active scope on every
// page so the architect always knows which tenant they are in.
// Clicking the org chip opens a dropdown with three actions:
// switch (default click on the chip), rename, or delete. Clicking
// the Work-Item chip clears only the active Work Item and returns
// to the WorkItemDashboard. The switcher is hidden when no scope
// is active. Every static label is asserted against
// `assertAllOnboardingLanguage` at module load.
//
// Task #146 adds the Rename / Delete Organisation actions on the
// org chip via a Radix dropdown menu, with their corresponding
// dialog modals.

import { useMemo, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { Building2, Briefcase, ChevronDown } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

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
import { RenameOrgDialog } from "@/components/RenameOrgDialog";
import { DeleteOrgDialog } from "@/components/DeleteOrgDialog";

const STATIC_LABELS = {
  switchOrgTitle: "Switch Organisation",
  switchWorkItemTitle: "Switch Work Item",
  orgActionsLabel: "Organisation actions",
  switchOrgItem: "Switch Organisation",
  renameOrgItem: "Rename Organisation",
  deleteOrgItem: "Delete Organisation",
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

export function OrgWorkItemSwitcher() {
  const { orgId, workItemId, setOrgId, setWorkItemId } = useCurrentScope();
  const [, navigate] = useLocation();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  function handleSwitchOrg() {
    setOrgId(null);
    navigate("/");
  }

  function handleDeleted() {
    setDeleteOpen(false);
    setOrgId(null);
    setWorkItemId(null);
    navigate("/");
  }

  return (
    <>
      <div
        className="hidden md:flex items-center gap-1 ml-auto mr-2 text-xs"
        data-testid="org-work-item-switcher"
      >
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              title={STATIC_LABELS.orgActionsLabel}
              aria-label={STATIC_LABELS.orgActionsLabel}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors"
              data-testid="topbar-switch-org"
            >
              <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="max-w-[12rem] truncate">
                {org?.name ?? orgId}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[12rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              data-testid="topbar-org-actions-menu"
            >
              <DropdownMenu.Item
                onSelect={() => handleSwitchOrg()}
                className="flex items-center px-2 py-1.5 text-xs rounded-sm cursor-pointer outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                data-testid="menuitem-switch-org"
              >
                {STATIC_LABELS.switchOrgItem}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => setRenameOpen(true)}
                disabled={!org}
                className="flex items-center px-2 py-1.5 text-xs rounded-sm cursor-pointer outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 data-[disabled]:cursor-default"
                data-testid="menuitem-rename-org"
              >
                {STATIC_LABELS.renameOrgItem}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px my-1 bg-border" />
              <DropdownMenu.Item
                onSelect={() => setDeleteOpen(true)}
                disabled={!org}
                className="flex items-center px-2 py-1.5 text-xs rounded-sm cursor-pointer outline-none text-destructive data-[highlighted]:bg-destructive/10 data-[disabled]:opacity-50 data-[disabled]:cursor-default"
                data-testid="menuitem-delete-org"
              >
                {STATIC_LABELS.deleteOrgItem}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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
              <span className="max-w-[12rem] truncate">
                {wi?.title ?? workItemId}
              </span>
            </button>
          </>
        )}
      </div>
      {org && (
        <>
          <RenameOrgDialog
            open={renameOpen}
            orgId={org.id}
            currentName={org.name}
            onClose={() => setRenameOpen(false)}
            onRenamed={() => setRenameOpen(false)}
          />
          <DeleteOrgDialog
            open={deleteOpen}
            orgId={org.id}
            orgName={org.name}
            onClose={() => setDeleteOpen(false)}
            onDeleted={handleDeleted}
          />
        </>
      )}
    </>
  );
}

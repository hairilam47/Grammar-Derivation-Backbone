// OrganisationHomePage — `/org-home` four-card hub.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { Building2, FileText, Layers, Network, User2 } from "lucide-react";

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
  SECTOR_LABELS,
  NATURE_OF_BUSINESS_LABELS,
} from "@/governance/orgStore";
import {
  getEaBlueprintForOrg,
  listWorkItemsForOrg,
  subscribe as subscribeWorkItems,
  getStoreVersion as getWorkItemStoreVersion,
  type WorkItemType,
} from "@/governance/workItemStore";
import { summariseWorkItems } from "./organisationHomeSummary";
import {
  listModules,
  subscribe as subscribeModules,
  getStoreVersion as getModuleStoreVersion,
} from "@/governance/moduleCatalogStore";
import {
  countBoundBpmnTasks,
  readBpmnTasksForBlueprint,
} from "./orgStructureBpmn";
import { OrganisationProfileDialog } from "./OrganisationProfileDialog";

const TYPE_BREAKDOWN_LABELS: Readonly<
  Record<Exclude<WorkItemType, "ea-blueprint">, string>
> = {
  project: "Projects",
  enhancement: "Enhancements",
  "change-request": "Change Requests",
};

const STATIC_LABELS = {
  heading: "Organisation Home",
  description:
    "A single hub for the active Organisation. Open the Enterprise Architecture Blueprint, view the Organisation Structure, edit the Organisation Profile, or jump into the full Work-Item list.",
  switchOrgButton: "Switch Organisation",
  blueprintTitle: "Enterprise Architecture Blueprint",
  blueprintDescription:
    "Open the auto-seeded Enterprise Architecture Blueprint Work Item.",
  blueprintOpenButton: "Open Blueprint",
  blueprintMissing:
    "No Enterprise Architecture Blueprint Work Item is registered for this Organisation.",
  blueprintLastUpdatedLabel: "Last updated",
  blueprintNoDescription: "No description provided.",
  structureTitle: "Organisation Structure",
  structureDescription:
    "View the Modules and the Business-Process map for this Organisation.",
  structureOpenButton: "View Structure",
  structureModules: "Modules",
  structureBpmn: "Business-Process tasks",
  profileTitle: "Organisation Profile",
  profileDescription:
    "Edit the Organisation name, Sector, or Nature of business.",
  profileOpenButton: "Edit Profile",
  profileSectorLabel: "Sector",
  profileNatureLabel: "Nature of business",
  workItemsTitle: "Work Items",
  workItemsDescription:
    "View the full list of Work Items, or create a new Project, Enhancement, or Change Request.",
  workItemsOpenButton: "View Work Items",
  workItemsTotal: "Active Work Items",
  noOrgTitle: "No Organisation selected",
  noOrgHint: "Pick an Organisation to open this Home hub.",
  ...TYPE_BREAKDOWN_LABELS,
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

function formatShortDate(iso: string): string {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function OrganisationHomePage() {
  const { orgId, setOrgId, setWorkItemId } = useCurrentScope();
  const [, navigate] = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);

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
  const modVersion = useSyncExternalStore(
    subscribeModules,
    getModuleStoreVersion,
    getModuleStoreVersion,
  );

  const organisation = useMemo(
    () => (orgId ? getOrganisation(orgId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, orgVersion],
  );
  const workItems = useMemo(
    () => (orgId ? listWorkItemsForOrg(orgId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, wiVersion],
  );
  const eaBlueprint = useMemo(
    () => (orgId ? getEaBlueprintForOrg(orgId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, wiVersion],
  );
  const moduleCount = useMemo(
    () => (orgId ? listModules().length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, modVersion],
  );
  const bpmnTaskCount = useMemo(
    () =>
      orgId && eaBlueprint
        ? countBoundBpmnTasks(
            readBpmnTasksForBlueprint(orgId, eaBlueprint.id),
          )
        : 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, eaBlueprint?.id, wiVersion, modVersion],
  );
  const breakdown = useMemo(
    () => summariseWorkItems(workItems),
    [workItems],
  );

  useEffect(() => {
    document.title = STATIC_LABELS.heading;
  }, []);

  useEffect(() => {
    if (!orgId || eaBlueprint) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[OrganisationHomePage] No EA Blueprint Work Item for Organisation "${orgId}".`,
    );
  }, [orgId, eaBlueprint]);

  if (!orgId || !organisation) {
    return (
      <div
        className="min-h-[100dvh] bg-background text-foreground flex flex-col"
        data-testid="org-home-no-org"
      >
        <main className="flex-1 container max-w-4xl mx-auto px-4 py-16">
          <Card>
            <CardHeader className="space-y-2">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-secondary/60 border border-border/60">
                <Building2 className="w-5 h-5" aria-hidden="true" />
              </span>
              <CardTitle>{STATIC_LABELS.noOrgTitle}</CardTitle>
              <CardDescription>{STATIC_LABELS.noOrgHint}</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  function handleOpenBlueprint() {
    if (!eaBlueprint) return;
    setWorkItemId(eaBlueprint.id);
    navigate("/workspace/studio");
  }

  function handleSwitchOrg() {
    setOrgId(null);
    navigate("/");
  }

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground flex flex-col"
      data-testid="org-home"
    >
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-12">
        <div
          className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          data-testid="org-home-heading"
        >
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {organisation.name}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {STATIC_LABELS.description}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleSwitchOrg}
            className="self-start"
            data-testid="button-switch-org"
          >
            {STATIC_LABELS.switchOrgButton}
          </Button>
        </div>

        <ul
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          data-testid="org-home-cards"
        >
          <li>
            <Card
              className="lift flex flex-col h-full"
              data-testid="card-org-blueprint"
            >
              <CardHeader className="space-y-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/60 border border-border/60">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                </span>
                <CardTitle className="text-base">
                  {STATIC_LABELS.blueprintTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {STATIC_LABELS.blueprintDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-2">
                {eaBlueprint ? (
                  <div className="space-y-1">
                    <p
                      className="text-sm font-medium truncate"
                      data-testid="text-blueprint-title"
                    >
                      {eaBlueprint.title}
                    </p>
                    <p
                      className="text-xs text-muted-foreground line-clamp-2"
                      data-testid="text-blueprint-description"
                    >
                      {eaBlueprint.description.trim().length > 0
                        ? eaBlueprint.description
                        : STATIC_LABELS.blueprintNoDescription}
                    </p>
                    <p
                      className="text-xs text-muted-foreground tabular-nums"
                      data-testid="text-blueprint-last-updated"
                    >
                      {STATIC_LABELS.blueprintLastUpdatedLabel}:{" "}
                      {formatShortDate(eaBlueprint.createdAt)}
                    </p>
                  </div>
                ) : (
                  <p
                    className="text-xs text-destructive"
                    data-testid="text-blueprint-missing"
                  >
                    {STATIC_LABELS.blueprintMissing}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleOpenBlueprint}
                  disabled={!eaBlueprint}
                  data-testid="button-open-blueprint"
                >
                  {STATIC_LABELS.blueprintOpenButton}
                </Button>
              </CardContent>
            </Card>
          </li>

          <li>
            <Card
              className="lift flex flex-col h-full"
              data-testid="card-org-structure"
            >
              <CardHeader className="space-y-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/60 border border-border/60">
                  <Layers className="w-4 h-4" aria-hidden="true" />
                </span>
                <CardTitle className="text-base">
                  {STATIC_LABELS.structureTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {STATIC_LABELS.structureDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-2">
                <ul
                  className="text-xs text-muted-foreground space-y-1"
                  data-testid="list-structure-counts"
                >
                  <li className="flex items-center justify-between">
                    <span>{STATIC_LABELS.structureModules}</span>
                    <span
                      className="tabular-nums"
                      data-testid="count-structure-modules"
                    >
                      {moduleCount}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{STATIC_LABELS.structureBpmn}</span>
                    <span
                      className="tabular-nums"
                      data-testid="count-structure-bpmn"
                    >
                      {bpmnTaskCount}
                    </span>
                  </li>
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/org-structure")}
                  data-testid="button-open-org-structure"
                >
                  {STATIC_LABELS.structureOpenButton}
                </Button>
              </CardContent>
            </Card>
          </li>

          <li>
            <Card
              className="lift flex flex-col h-full"
              data-testid="card-org-profile"
            >
              <CardHeader className="space-y-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/60 border border-border/60">
                  <User2 className="w-4 h-4" aria-hidden="true" />
                </span>
                <CardTitle className="text-base">
                  {STATIC_LABELS.profileTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {STATIC_LABELS.profileDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-2">
                <ul
                  className="text-xs text-muted-foreground space-y-1"
                  data-testid="list-profile-summary"
                >
                  <li className="flex items-center justify-between gap-2">
                    <span>{STATIC_LABELS.profileSectorLabel}</span>
                    <span
                      className="text-right truncate"
                      data-testid="text-profile-sector"
                    >
                      {SECTOR_LABELS[organisation.sector]}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span>{STATIC_LABELS.profileNatureLabel}</span>
                    <span
                      className="text-right truncate"
                      data-testid="text-profile-nature"
                    >
                      {NATURE_OF_BUSINESS_LABELS[organisation.natureOfBusiness]}
                    </span>
                  </li>
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setProfileOpen(true)}
                  data-testid="button-open-org-profile"
                >
                  {STATIC_LABELS.profileOpenButton}
                </Button>
              </CardContent>
            </Card>
          </li>

          <li>
            <Card
              className="lift flex flex-col h-full"
              data-testid="card-org-work-items"
            >
              <CardHeader className="space-y-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/60 border border-border/60">
                  <Network className="w-4 h-4" aria-hidden="true" />
                </span>
                <CardTitle className="text-base">
                  {STATIC_LABELS.workItemsTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {STATIC_LABELS.workItemsDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-2">
                <ul
                  className="text-xs text-muted-foreground space-y-1"
                  data-testid="list-work-item-counts"
                >
                  <li className="flex items-center justify-between font-medium">
                    <span>{STATIC_LABELS.workItemsTotal}</span>
                    <span
                      className="tabular-nums"
                      data-testid="count-work-items-total"
                    >
                      {breakdown.total}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{TYPE_BREAKDOWN_LABELS.project}</span>
                    <span
                      className="tabular-nums"
                      data-testid="count-work-items-project"
                    >
                      {breakdown.byType.project}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{TYPE_BREAKDOWN_LABELS.enhancement}</span>
                    <span
                      className="tabular-nums"
                      data-testid="count-work-items-enhancement"
                    >
                      {breakdown.byType.enhancement}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{TYPE_BREAKDOWN_LABELS["change-request"]}</span>
                    <span
                      className="tabular-nums"
                      data-testid="count-work-items-change-request"
                    >
                      {breakdown.byType["change-request"]}
                    </span>
                  </li>
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-open-work-items"
                >
                  {STATIC_LABELS.workItemsOpenButton}
                </Button>
              </CardContent>
            </Card>
          </li>
        </ul>
      </main>

      <OrganisationProfileDialog
        open={profileOpen}
        organisation={organisation}
        onClose={() => setProfileOpen(false)}
        onSaved={() => setProfileOpen(false)}
      />
    </div>
  );
}

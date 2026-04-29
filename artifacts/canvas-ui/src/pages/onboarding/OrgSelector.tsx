// OrgSelector — first surface a user lands on when no Organisation
// is currently active. Lists every Organisation in the registry and
// offers a "Create Organisation" CTA that opens NewOrgDialog. On
// selection, persists the active orgId via `useCurrentScope` and
// navigates to the Work-Item Dashboard.
//
// Phase 2 (SaaS Onboarding) — every static label rendered by this
// component is asserted against `assertAllOnboardingLanguage` at
// module load (Phase 2 step 6).

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { Building2, Plus } from "lucide-react";

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
  listOrganisations,
  subscribe as subscribeOrgs,
  getStoreVersion as getOrgStoreVersion,
  SECTOR_LABELS,
  NATURE_OF_BUSINESS_LABELS,
  type Organisation,
} from "@/governance/orgStore";
import { NewOrgDialog } from "./NewOrgDialog";

const STATIC_LABELS = {
  heading: "Choose an Organisation",
  description:
    "Select an Organisation to open its Work Items, or create a new one.",
  emptyTitle: "No Organisations yet",
  emptyHint: "Create the first Organisation to begin.",
  createButton: "Create Organisation",
  openButton: "Open",
  sectorLabel: "Sector",
  natureLabel: "Nature of business",
  ...SECTOR_LABELS,
  ...NATURE_OF_BUSINESS_LABELS,
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

export default function OrgSelector() {
  const { setOrgId } = useCurrentScope();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const version = useSyncExternalStore(
    subscribeOrgs,
    getOrgStoreVersion,
    getOrgStoreVersion,
  );
  const orgs: readonly Organisation[] = useMemo(
    () => listOrganisations(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  function handleSelect(orgId: string) {
    setOrgId(orgId);
    navigate("/dashboard");
  }

  function handleCreated(orgId: string) {
    setDialogOpen(false);
    setOrgId(orgId);
    navigate("/dashboard");
  }

  useEffect(() => {
    document.title = STATIC_LABELS.heading;
  }, []);

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground flex flex-col"
      data-testid="org-selector"
    >
      <main className="flex-1 container max-w-4xl mx-auto px-4 py-16">
        <div className="mb-10 space-y-3" data-testid="org-selector-heading">
          <h1 className="text-3xl font-semibold tracking-tight">
            {STATIC_LABELS.heading}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {STATIC_LABELS.description}
          </p>
        </div>

        <div className="mb-6">
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="gap-2"
            data-testid="button-create-org"
          >
            <Plus className="w-4 h-4" />
            {STATIC_LABELS.createButton}
          </Button>
        </div>

        {orgs.length === 0 ? (
          <Card data-testid="org-empty">
            <CardHeader className="space-y-2">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-secondary/60 border border-border/60">
                <Building2 className="w-5 h-5" aria-hidden="true" />
              </span>
              <CardTitle>{STATIC_LABELS.emptyTitle}</CardTitle>
              <CardDescription>{STATIC_LABELS.emptyHint}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            data-testid="org-list"
          >
            {orgs.map((org) => (
              <li key={org.id}>
                <Card
                  className="lift flex flex-col"
                  data-testid={`org-card-${org.id}`}
                >
                  <CardHeader className="space-y-2">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/60 border border-border/60">
                      <Building2 className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <CardTitle className="text-base">{org.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {STATIC_LABELS.sectorLabel}:{" "}
                      {SECTOR_LABELS[org.sector]} ·{" "}
                      {STATIC_LABELS.natureLabel}:{" "}
                      {NATURE_OF_BUSINESS_LABELS[org.natureOfBusiness]}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleSelect(org.id)}
                      data-testid={`button-open-org-${org.id}`}
                    >
                      {STATIC_LABELS.openButton}
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>

      <NewOrgDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

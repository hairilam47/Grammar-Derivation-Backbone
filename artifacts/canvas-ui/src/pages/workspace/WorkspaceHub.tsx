// WorkspaceHub — third surface in the onboarding flow and the
// post-Phase-2 replacement for the legacy LandingPage. Reachable
// only when both an active Organisation and an active Work Item
// are resolved. Renders the same three intent cards (ADC / CTAD /
// ACW) the legacy LandingPage rendered, scoped now to the active
// Work Item, plus a small breadcrumb showing
// "Organisation · Work Item" and a switcher.
//
// Phase 2 (SaaS Onboarding). The intent-card copy itself is META
// (it describes what each surface IS) and is intentionally not run
// through `assertAllOnboardingLanguage` — the constitutional ADC /
// CTAD / ACW vocabulary tiers continue to govern the inner pages.
// Only the breadcrumb / switcher labels rendered by THIS component
// are asserted against `assertAllOnboardingLanguage`.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { FileSignature, Workflow, Layers } from "lucide-react";

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
  getWorkItem,
  subscribe as subscribeWorkItems,
  getStoreVersion as getWorkItemStoreVersion,
} from "@/governance/workItemStore";

const STATIC_LABELS = {
  switchWorkItem: "Switch Work Item",
  switchOrganisation: "Switch Organisation",
  separator: " · ",
} as const;

assertAllOnboardingLanguage([
  STATIC_LABELS.switchWorkItem,
  STATIC_LABELS.switchOrganisation,
]);

// META intent-card copy. Identical to the legacy LandingPage so
// downstream tests that key off these strings keep working.
interface IntentCard {
  testId: string;
  icon: typeof FileSignature;
  title: string;
  description: string;
  hints: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  ctaTestId: string;
}

const CARDS: readonly IntentCard[] = [
  {
    testId: "intent-card-adc",
    icon: FileSignature,
    title: "ADC \u2014 Design Contract",
    description: "Form, approve, and record a formal architecture decision.",
    hints: [
      "Grammar-based decision formation",
      "One-way freeze and governance record",
      "Produces ADS and ECP artefacts",
    ],
    ctaLabel: "Start a Decision",
    ctaHref: "/decision-canvas",
    ctaTestId: "intent-cta-adc",
  },
  {
    testId: "intent-card-ctad",
    icon: Layers,
    title: "CTAD \u2014 Technology Exploration",
    description:
      "Explore technology configurations permitted by an approved decision.",
    hints: [
      "Interpretive and reversible",
      "Reads an approved decision read-only",
      "No approval, no recommendation, no scoring",
    ],
    ctaLabel: "Open Technology Exploration",
    ctaHref: "/ctad",
    ctaTestId: "intent-cta-ctad",
  },
  {
    testId: "intent-card-acw",
    icon: Workflow,
    title: "ACW \u2014 Architecture Workspace",
    description:
      "Explore and map the current architecture and system structure.",
    hints: [
      "Non-governing and exploratory",
      "Safe to explore and experiment",
      "No decisions are recorded",
    ],
    ctaLabel: "Open Workspace",
    ctaHref: "/workspace",
    ctaTestId: "intent-cta-acw",
  },
];

export default function WorkspaceHub() {
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

  // Router gate is the primary defence; this is a defensive redirect.
  useEffect(() => {
    if (!orgId) navigate("/");
    else if (!workItemId) navigate("/dashboard");
  }, [orgId, workItemId, navigate]);

  if (!orgId || !workItemId) return null;

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground flex flex-col"
      data-testid="workspace-hub"
    >
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-16">
        <div
          className="mb-12 flex flex-wrap items-start justify-between gap-4"
          data-testid="workspace-hub-breadcrumb"
        >
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {org?.name}
              {STATIC_LABELS.separator}
              {wi?.title}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight max-w-3xl">
              Choose how you want to{" "}
              <span className="gradient-text">engage with the architecture</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setWorkItemId(null);
                navigate("/dashboard");
              }}
              data-testid="button-hub-switch-work-item"
            >
              {STATIC_LABELS.switchWorkItem}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOrgId(null);
                navigate("/");
              }}
              data-testid="button-hub-switch-org"
            >
              {STATIC_LABELS.switchOrganisation}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="intent-cards">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.testId}
                data-testid={card.testId}
                className="lift flex flex-col group relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-base)] gradient-accent-soft pointer-events-none"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-x-0 top-0 h-px hairline-accent opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-base)]"
                  aria-hidden="true"
                />
                <CardHeader className="space-y-3 relative">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-secondary/60 border border-border/60 text-foreground group-hover:text-primary transition-colors duration-[var(--motion-base)]">
                    <Icon
                      className="w-5 h-5"
                      aria-hidden="true"
                      data-testid={`${card.testId}-icon`}
                    />
                  </span>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-6 relative">
                  <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4">
                    {card.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                  <Link href={card.ctaHref}>
                    <Button
                      variant="outline"
                      className="w-full"
                      data-testid={card.ctaTestId}
                    >
                      {card.ctaLabel}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}

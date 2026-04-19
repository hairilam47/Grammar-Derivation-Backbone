import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { Eye, Layout } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PortfolioHeaderNav } from "@/components/governance/PortfolioHeaderNav";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import {
  deriveExposure,
  type ExposurePayload,
} from "@/governance/exposureDerive";
import {
  assertAllReflectiveLanguage,
} from "@/governance/staticTextGuard";

// Permanent interpretation banner. Verbatim per the Phase 1 spec.
const INTERPRETATION_BANNER =
  "This view shows where an approved decision places institutional exposure. It does not assess, rank, recommend, or require action.";

// Verbatim empty-state sentence per the Phase 1 spec.
const EMPTY_SENTENCE = "No exposure surfaces identified for this decision.";

const NOT_FOUND_TEXT = "Decision not found.";
const PAGE_TITLE = "Decision Exposure";
const SECTION_GOVERNANCE = "Governance Domains";
const SECTION_SCRUTINY = "External Scrutiny Vectors";
const SECTION_IMPACT = "Impact Surfaces";
const SECTION_IMPACT_INSTITUTIONAL = "Institutional";
const SECTION_IMPACT_PRODUCT = "Product";
const SECTION_IMPACT_INFRASTRUCTURE = "Infrastructure";
const SECTION_FUNCTIONS = "Organisational Functions Affected";
const BACK_TO_PORTFOLIO = "Back to portfolio";

// PH1-HC4: the Decision Exposure View must use the strictest available
// language guard so no recommendation, ranking, or urgency vocabulary
// can leak into the rendered surface.
//
// The INTERPRETATION_BANNER is intentionally exempt: it is the
// verbatim Phase 1 spec banner and is itself a meta-disclaimer that
// negates those exact words ("does not assess, rank, recommend, or
// require action"). Substring guards cannot distinguish the negated
// usage from a leak, so the banner is checked by spec equality
// instead of vocabulary match.
const SPEC_BANNER =
  "This view shows where an approved decision places institutional exposure. It does not assess, rank, recommend, or require action.";
if (INTERPRETATION_BANNER !== SPEC_BANNER) {
  throw new Error(
    "Decision Exposure interpretation banner has drifted from the Phase 1 spec wording.",
  );
}
assertAllReflectiveLanguage([
  EMPTY_SENTENCE,
  NOT_FOUND_TEXT,
  PAGE_TITLE,
  SECTION_GOVERNANCE,
  SECTION_SCRUTINY,
  SECTION_IMPACT,
  SECTION_IMPACT_INSTITUTIONAL,
  SECTION_IMPACT_PRODUCT,
  SECTION_IMPACT_INFRASTRUCTURE,
  SECTION_FUNCTIONS,
  BACK_TO_PORTFOLIO,
]);

export default function Exposure() {
  const [, params] = useRoute<{ adsId: string }>("/exposure/:adsId");
  const adsId = params?.adsId ?? "";
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);

  useEffect(() => {
    setEntries(listEntries());
  }, []);

  const entry = useMemo(() => {
    if (!adsId) return null;
    const matches = entries.filter((e) => e.adsId === adsId);
    if (matches.length === 0) return null;
    // Resolve the latest version; PortfolioEntry.adsVersion is the
    // architectural hash (string), not monotonic. We fall back to the
    // most recent decisionDate, then to the first match by stable order.
    const sorted = [...matches].sort((a, b) =>
      a.decisionDate < b.decisionDate ? 1 : -1,
    );
    return sorted[0];
  }, [adsId, entries]);

  const payload: ExposurePayload | null = useMemo(
    () => (entry ? deriveExposure(entry) : null),
    [entry],
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Eye className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">
              {PAGE_TITLE}
            </span>
          </div>
          <PortfolioHeaderNav />
        </div>
      </header>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Card
          data-testid="exposure-banner"
          className="border-border bg-muted/30"
        >
          <CardContent className="py-4 text-xs leading-relaxed text-muted-foreground">
            {INTERPRETATION_BANNER}
          </CardContent>
        </Card>

        {!entry || !payload ? (
          <NotFoundPanel />
        ) : (
          <>
            <DecisionHeader entry={entry} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ListSection
                title={SECTION_GOVERNANCE}
                testid="section-governance-domains"
                items={payload.governanceDomains.map((d) => d.label)}
              />
              <ListSection
                title={SECTION_SCRUTINY}
                testid="section-scrutiny-vectors"
                items={payload.scrutinyVectors.map((d) => d.label)}
              />
              <ImpactSurfacesSection payload={payload.impactSurfaces} />
              <ListSection
                title={SECTION_FUNCTIONS}
                testid="section-functions-affected"
                items={payload.functionsAffected.map((f) => f)}
              />
            </div>
            <div className="pt-2">
              <Link href="/portfolio">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  data-testid="link-back-portfolio"
                >
                  <Layout className="w-3.5 h-3.5" /> {BACK_TO_PORTFOLIO}
                </Button>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function DecisionHeader({ entry }: { entry: PortfolioEntry }) {
  return (
    <div data-testid="exposure-decision-header" className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {entry.adsId} · v{entry.adsVersion}
      </div>
      <h1 className="text-xl font-bold tracking-tight">{entry.projectName}</h1>
      <div className="text-xs text-muted-foreground">
        Approving authority: {entry.approvingAuthority} · Decision date:{" "}
        {entry.decisionDate}
      </div>
    </div>
  );
}

function NotFoundPanel() {
  return (
    <Card data-testid="exposure-not-found">
      <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
        <p>{NOT_FOUND_TEXT}</p>
        <Link href="/portfolio">
          <Button variant="outline" size="sm" className="gap-2">
            <Layout className="w-3.5 h-3.5" /> {BACK_TO_PORTFOLIO}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ListSection({
  title,
  items,
  testid,
}: {
  title: string;
  items: string[];
  testid: string;
}) {
  return (
    <Card data-testid={testid}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs">
        {items.length === 0 ? (
          <p className="text-muted-foreground" data-testid={`${testid}-empty`}>
            {EMPTY_SENTENCE}
          </p>
        ) : (
          <ul className="list-disc pl-5 space-y-1" data-testid={`${testid}-list`}>
            {items.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactSurfacesSection({
  payload,
}: {
  payload: ExposurePayload["impactSurfaces"];
}) {
  const allEmpty =
    payload.institutional.length === 0 &&
    payload.product.length === 0 &&
    payload.infrastructure.length === 0;

  return (
    <Card data-testid="section-impact-surfaces">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {SECTION_IMPACT}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-4">
        {allEmpty ? (
          <p
            className="text-muted-foreground"
            data-testid="section-impact-surfaces-empty"
          >
            {EMPTY_SENTENCE}
          </p>
        ) : (
          <>
            <ImpactSubgroup
              title={SECTION_IMPACT_INSTITUTIONAL}
              items={payload.institutional}
              testid="impact-institutional"
            />
            <ImpactSubgroup
              title={SECTION_IMPACT_PRODUCT}
              items={payload.product}
              testid="impact-product"
            />
            <ImpactSubgroup
              title={SECTION_IMPACT_INFRASTRUCTURE}
              items={payload.infrastructure}
              testid="impact-infrastructure"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactSubgroup({
  title,
  items,
  testid,
}: {
  title: string;
  items: string[];
  testid: string;
}) {
  return (
    <div data-testid={testid}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground" data-testid={`${testid}-empty`}>
          {EMPTY_SENTENCE}
        </p>
      ) : (
        <ul className="list-disc pl-5 space-y-0.5">
          {items.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

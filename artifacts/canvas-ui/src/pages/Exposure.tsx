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
  deriveExposureNarratives,
  type ExposureNarratives,
} from "@/governance/exposureNarratives";
import {
  deriveResponsibilityLens,
  RESPONSIBILITY_LENS_PREFIX,
  RESPONSIBILITY_LENS_EMPTY,
  type ResponsibilityLens,
} from "@/governance/responsibilityLens";
import {
  deriveScenarioAnnotations,
  annotationsAreEmpty,
  SCENARIO_LENS_ORDER,
  SCENARIO_LENS_LABEL,
  SCENARIO_HEADING,
  SCENARIO_HELPER,
  SCENARIO_SELECTOR_LABEL,
  SCENARIO_EMPTY,
  type ScenarioLens,
  type ScenarioAnnotations,
} from "@/governance/scenarioReading";
import {
  deriveReEntrySignals,
  REENTRY_HEADING,
  REENTRY_PREFIX,
  REENTRY_EMPTY,
} from "@/governance/decisionReentry";
import {
  assertAllReflectiveLanguage,
  assertAllResponsibilityLensLanguage,
  assertAllDecisionReentryLanguage,
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
// Phase 2 disclosure label — neutral, descriptive only.
const DISCLOSURE_LABEL = "Why this exposure exists";

// Phase 3 — Cross-Functional Responsibility Lens.
//
// Section heading is owned by the page (it is purely a UI label, not a
// derivation product). The prefix sentence and the empty-state
// sentence are owned by `responsibilityLens.ts`, which co-locates them
// with the deriver and runs both spec-equality and substring guards on
// them at module load.
const RESPONSIBILITY_LENS_HEADING = "Cross-Functional Responsibility Lens";
assertAllResponsibilityLensLanguage([RESPONSIBILITY_LENS_HEADING]);

// Phase 5 — Decision Re-Entry Lens.
//
// The section heading and empty-state sentence are owned by
// `decisionReentry.ts` (and asserted there). The interpretive prefix
// is also owned and verified by spec-equality there. The page
// re-asserts the heading and empty-state sentence here, against the
// strictest tier, so a future accidental edit to either constant is
// caught even if the deriving module's load-time guard is bypassed.
//
// The prefix is intentionally NOT included in this scan: it contains
// the bare words "change" and "recommend" inside a negating phrase
// and is exempted from substring matching (verified by spec-equality
// in `decisionReentry.ts`). This mirrors the Phase 1 banner pattern.
assertAllDecisionReentryLanguage([REENTRY_HEADING, REENTRY_EMPTY]);

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
  DISCLOSURE_LABEL,
]);

export default function Exposure() {
  const [, params] = useRoute<{ adsId: string }>("/exposure/:adsId");
  const adsId = params?.adsId ?? "";
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  // Phase 4 — selected scenario lens. Always defaults to Baseline so
  // the page's initial render is byte-identical to Phases 1–3.
  const [scenarioLens, setScenarioLens] = useState<ScenarioLens>("BASELINE");
  // Phase 5 — captured "now" Date for re-entry derivation. Captured
  // once on mount so the lens is stable for the lifetime of the
  // page render (a re-mount picks up a fresh "now"). The deriver
  // itself stays pure: same (entry, now) always yields the same
  // signal set.
  const [reEntryNow] = useState<Date>(() => new Date());

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

  const narratives: ExposureNarratives | null = useMemo(
    () =>
      entry && payload ? deriveExposureNarratives(entry, payload) : null,
    [entry, payload],
  );

  const responsibilityLens: ResponsibilityLens | null = useMemo(
    () =>
      entry && payload ? deriveResponsibilityLens(entry, payload) : null,
    [entry, payload],
  );

  // Phase 4 — scenario annotations. Pure derivation; recomputed only
  // when the entry, payload, or selected lens changes. Baseline always
  // returns an empty annotations object, so under the default lens
  // every Phase 1/2/3 render path takes its existing branch and
  // produces byte-identical output.
  const scenarioAnnotations: ScenarioAnnotations = useMemo(
    () =>
      entry && payload
        ? deriveScenarioAnnotations(entry, payload, scenarioLens)
        : { itemQualifiers: {}, narrativeQualifiers: {} },
    [entry, payload, scenarioLens],
  );

  // Phase 5 — Decision Re-Entry signals. Derived from the entry,
  // the live Phase 1 payload, the live Phase 2 narratives, the live
  // Phase 3 responsibility lens, and the captured "now" Date.
  // PH5-HC3: this useMemo intentionally has NO dependency on
  // `scenarioLens` — Phase 5 is not derived from the page's
  // lens-state. (`scenarioAnnotations` is also deliberately absent
  // from the deps array.)
  const reEntrySignals: readonly string[] = useMemo(
    () =>
      entry && payload
        ? deriveReEntrySignals(
            entry,
            payload,
            narratives,
            responsibilityLens ?? [],
            reEntryNow,
          )
        : [],
    [entry, payload, narratives, responsibilityLens, reEntryNow],
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
                narrative={narratives?.governanceDomains ?? null}
                itemQualifiers={scenarioAnnotations.itemQualifiers}
                narrativeQualifier={
                  scenarioAnnotations.narrativeQualifiers.governanceDomains
                }
              />
              <ListSection
                title={SECTION_SCRUTINY}
                testid="section-scrutiny-vectors"
                items={payload.scrutinyVectors.map((d) => d.label)}
                narrative={narratives?.scrutinyVectors ?? null}
                itemQualifiers={scenarioAnnotations.itemQualifiers}
                narrativeQualifier={
                  scenarioAnnotations.narrativeQualifiers.scrutinyVectors
                }
              />
              <ImpactSurfacesSection
                payload={payload.impactSurfaces}
                narrative={narratives?.impactSurfaces ?? null}
                itemQualifiers={scenarioAnnotations.itemQualifiers}
                narrativeQualifier={
                  scenarioAnnotations.narrativeQualifiers.impactSurfaces
                }
              />
              <ListSection
                title={SECTION_FUNCTIONS}
                testid="section-functions-affected"
                items={payload.functionsAffected.map((f) => f)}
                narrative={narratives?.functionsAffected ?? null}
                itemQualifiers={scenarioAnnotations.itemQualifiers}
                narrativeQualifier={
                  scenarioAnnotations.narrativeQualifiers.functionsAffected
                }
              />
            </div>
            <ResponsibilityLensSection
              lens={responsibilityLens ?? []}
              itemQualifiers={scenarioAnnotations.itemQualifiers}
            />
            <ScenarioReadingSection
              lens={scenarioLens}
              onChange={setScenarioLens}
              annotations={scenarioAnnotations}
            />
            <DecisionReentrySection signals={reEntrySignals} />
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

// Phase 4 — `itemQualifiers` and `narrativeQualifier` are optional and
// default to undefined. When undefined (or empty), the rendered output
// is byte-identical to the Phase 1/2/3 baseline. Removing Phase 4
// restores the original signature with no further edits.
function ListSection({
  title,
  items,
  testid,
  narrative,
  itemQualifiers,
  narrativeQualifier,
}: {
  title: string;
  items: string[];
  testid: string;
  narrative: string | null;
  itemQualifiers?: Record<string, string>;
  narrativeQualifier?: string;
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
              <li key={label}>
                {label}
                <ItemQualifier label={label} map={itemQualifiers} />
              </li>
            ))}
          </ul>
        )}
        {narrative !== null && (
          <NarrativeDisclosure
            narrative={narrative}
            testid={`${testid}-narrative`}
            qualifier={narrativeQualifier}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Phase 4 inline qualifier renderer. Renders nothing unless the
// qualifier map exists AND contains the label. The qualifier is shown
// as " → <phrase>" inline after the label, in muted colour, with no
// new focusable element, no badge, no icon. Per PH4-HC4 / PH4-HC5 the
// qualifier never replaces or visually outranks the underlying label.
function ItemQualifier({
  label,
  map,
}: {
  label: string;
  map?: Record<string, string>;
}) {
  if (!map) return null;
  const q = map[label];
  if (!q) return null;
  return (
    <span
      className="text-muted-foreground/80"
      data-testid={`scenario-qualifier-${label}`}
    >
      {" → "}
      {q}
    </span>
  );
}

function ImpactSurfacesSection({
  payload,
  narrative,
  itemQualifiers,
  narrativeQualifier,
}: {
  payload: ExposurePayload["impactSurfaces"];
  narrative: string | null;
  itemQualifiers?: Record<string, string>;
  narrativeQualifier?: string;
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
              itemQualifiers={itemQualifiers}
            />
            <ImpactSubgroup
              title={SECTION_IMPACT_PRODUCT}
              items={payload.product}
              testid="impact-product"
              itemQualifiers={itemQualifiers}
            />
            <ImpactSubgroup
              title={SECTION_IMPACT_INFRASTRUCTURE}
              items={payload.infrastructure}
              testid="impact-infrastructure"
              itemQualifiers={itemQualifiers}
            />
          </>
        )}
        {narrative !== null && (
          <NarrativeDisclosure
            narrative={narrative}
            testid="section-impact-surfaces-narrative"
            qualifier={narrativeQualifier}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Phase 2 — "Why this exposure exists" disclosure.
//
// Visually subordinate to the Phase 1 list above it: smaller font,
// muted colour, single paragraph, no bolded phrases, no bullets, no
// emphasis affordances, no warning / importance icons. The disclosure
// toggle is the only new focusable element this component introduces
// (PH2 visual subordination + non-interactive narrative requirement).
//
// Uses the native <details>/<summary> elements so the disclosure is
// keyboard-operable by default and renders identically with no
// JavaScript. Closed by default per spec.
function NarrativeDisclosure({
  narrative,
  testid,
  qualifier,
}: {
  narrative: string;
  testid: string;
  // Phase 4 — optional inline qualifier appended to the narrative
  // paragraph as " → <phrase>". Defaults to undefined so Phase 1/2/3
  // call sites are byte-identical to before.
  qualifier?: string;
}) {
  return (
    <details className="mt-3 text-[11px]" data-testid={testid}>
      <summary
        className="cursor-pointer text-muted-foreground/80 hover:text-muted-foreground select-none"
        data-testid={`${testid}-toggle`}
      >
        {DISCLOSURE_LABEL}
      </summary>
      <p
        className="mt-2 leading-relaxed text-muted-foreground/80"
        data-testid={`${testid}-paragraph`}
      >
        {narrative}
        {qualifier ? (
          <span data-testid={`${testid}-qualifier`}>
            {" → "}
            {qualifier}
          </span>
        ) : null}
      </p>
    </details>
  );
}

function ImpactSubgroup({
  title,
  items,
  testid,
  itemQualifiers,
}: {
  title: string;
  items: string[];
  testid: string;
  itemQualifiers?: Record<string, string>;
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
            <li key={label}>
              {label}
              <ItemQualifier label={label} map={itemQualifiers} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Phase 3 — Cross-Functional Responsibility Lens section.
//
// PH3-HC7 (strictly additive): rendered as its own card BENEATH the
// Phase 1/2 grid; nothing in the four Phase 1 sections is replaced or
// rearranged, no scoring or ordering is introduced, and no Phase 2
// disclosure pattern is used here — the lens is directly visible and
// has no toggle. The list is alphabetical at both levels (the deriver
// guarantees it).
function ResponsibilityLensSection({
  lens,
  itemQualifiers,
}: {
  lens: ResponsibilityLens;
  // Phase 4 — pressure-type labels are looked up in the same flat
  // qualifier map used by Phase 1/2 sections. Optional and defaults
  // to undefined so the Phase 3 render path is unchanged when the
  // selected lens is Baseline.
  itemQualifiers?: Record<string, string>;
}) {
  return (
    <Card data-testid="section-responsibility-lens">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {RESPONSIBILITY_LENS_HEADING}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-3">
        <p
          className="text-muted-foreground leading-relaxed"
          data-testid="responsibility-lens-prefix"
        >
          {RESPONSIBILITY_LENS_PREFIX}
        </p>
        {lens.length === 0 ? (
          <p
            className="text-muted-foreground"
            data-testid="responsibility-lens-empty"
          >
            {RESPONSIBILITY_LENS_EMPTY}
          </p>
        ) : (
          <ul
            className="space-y-2"
            data-testid="responsibility-lens-list"
          >
            {lens.map((row) => (
              <li
                key={row.functionName}
                data-testid={`responsibility-lens-row-${row.functionName}`}
              >
                <div className="font-semibold">{row.functionName}</div>
                <ul className="list-disc pl-5 mt-0.5 space-y-0.5 text-muted-foreground">
                  {row.pressureTypes.map((p) => (
                    <li key={p}>
                      {p}
                      <ItemQualifier label={p} map={itemQualifiers} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Phase 4 — Scenario-Conditioned Reading section.
//
// PH4-HC1 / PH4-HC4 / PH4-HC7: rendered as its own card BENEATH the
// Phase 3 lens. The selector is a single radio group (no compare,
// no diff, no multi-select). Switching lenses recomputes the
// annotations object passed in from the page; under Baseline the
// object is empty and the rest of the page renders Phase 1/2/3
// untouched. Removing this section + the Phase 4 module restores the
// page to its Phase 3 baseline.
function ScenarioReadingSection({
  lens,
  onChange,
  annotations,
}: {
  lens: ScenarioLens;
  onChange: (next: ScenarioLens) => void;
  annotations: ScenarioAnnotations;
}) {
  const showEmpty =
    lens !== "BASELINE" && annotationsAreEmpty(annotations);
  return (
    <Card data-testid="section-scenario-reading">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {SCENARIO_HEADING}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-3">
        <p
          className="text-muted-foreground leading-relaxed"
          data-testid="scenario-reading-helper"
        >
          {SCENARIO_HELPER}
        </p>
        <fieldset
          className="space-y-1"
          data-testid="scenario-reading-selector"
        >
          <legend className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            {SCENARIO_SELECTOR_LABEL}
          </legend>
          {SCENARIO_LENS_ORDER.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 cursor-pointer"
              data-testid={`scenario-lens-option-${opt}`}
            >
              <input
                type="radio"
                name="scenario-lens"
                value={opt}
                checked={lens === opt}
                onChange={() => onChange(opt)}
              />
              <span>{SCENARIO_LENS_LABEL[opt]}</span>
            </label>
          ))}
        </fieldset>
        {showEmpty && (
          <p
            className="text-muted-foreground"
            data-testid="scenario-reading-empty"
          >
            {SCENARIO_EMPTY}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Phase 5 — Decision Re-Entry Lens section.
//
// PH5-HC6 (strictly removable) / PH5-HC7 (human-initiated): rendered
// as its own card BENEATH the Phase 4 scenario-reading section. The
// card is non-interactive — there are no buttons, links, or
// affordances of any kind. The reader sees the prefix sentence, then
// either the closed-set signal lines or the empty-state sentence.
// Acting on a signal is a procedural decision left entirely to the
// reader; this section never writes anywhere and never navigates
// anywhere.
function DecisionReentrySection({
  signals,
}: {
  signals: readonly string[];
}) {
  return (
    <Card data-testid="section-decision-reentry">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {REENTRY_HEADING}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-3">
        <p
          className="text-muted-foreground leading-relaxed"
          data-testid="decision-reentry-prefix"
        >
          {REENTRY_PREFIX}
        </p>
        {signals.length === 0 ? (
          <p
            className="text-muted-foreground"
            data-testid="decision-reentry-empty"
          >
            {REENTRY_EMPTY}
          </p>
        ) : (
          <ul
            className="list-disc pl-5 space-y-1"
            data-testid="decision-reentry-list"
          >
            {signals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

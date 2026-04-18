import type { PortfolioEntry } from "@/governance/portfolioStore";
import { PreviewHeader, PreviewFooter } from "./AdsPreview";

const RISK_BADGE: Record<string, string> = {
  RED: "bg-destructive/10 text-destructive border-destructive/20",
  AMBER: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  GREEN: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  NONE: "bg-muted text-muted-foreground border-border",
};

interface EntryViewProps {
  entry: PortfolioEntry;
}

function SectionTitle({ order, title }: { order: number; title: string }) {
  return (
    <h3 className="text-sm font-bold tracking-wide">
      <span className="text-muted-foreground mr-2">{order}.</span>
      {title}
    </h3>
  );
}

function Block({
  order,
  title,
  children,
  testid,
}: {
  order: number;
  title: string;
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div className="space-y-2" data-testid={testid}>
      <SectionTitle order={order} title={title} />
      <div className="text-xs leading-relaxed space-y-1">{children}</div>
    </div>
  );
}

// Renders the read-only ADS shape directly from a PortfolioEntry.
//
// This is intentionally entry-based (not ADS-based) because the portfolio
// store persists only the HC4 allow-listed fields and never the full ADS.
// The viewer therefore shows the canonical decision identity, the
// architectural footprint by layer, the recorded indicators, the
// acknowledged risk severity and category set, and the locked baseline
// posture — i.e. exactly what is in the persisted entry.
export function EntryAdsView({ entry }: EntryViewProps) {
  const c = entry.organisationContext;
  const b = entry.baselinePosture;
  return (
    <div className="space-y-5" data-testid="entry-ads-view">
      <PreviewHeader title="Architecture Decision Snapshot" project={entry.projectName} />

      <Block order={1} title="Decision Context" testid="entry-ads-context">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Organisation type: {c.organisationType}</li>
          <li>Sensitivity level: {c.sensitivityLevel}</li>
          <li>System intent: {c.systemIntent}</li>
          <li>Expected lifespan: {c.expectedLifespanYears} years</li>
        </ul>
      </Block>

      <Block order={2} title="Architectural Footprint" testid="entry-ads-footprint">
        {entry.layersPresent.length === 0 ? (
          <p>No architectural layers were recorded.</p>
        ) : (
          <ul className="list-disc pl-5 space-y-0.5">
            {entry.layersPresent.map((l) => (
              <li key={l}>{l} layer</li>
            ))}
          </ul>
        )}
      </Block>

      <Block order={3} title="Indicators" testid="entry-ads-indicators">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Complexity score: {entry.complexityScore}</li>
          <li>Operational overhead score: {entry.operationalOverheadScore}</li>
          <li>Change cost later score: {entry.changeCostLaterScore}</li>
        </ul>
      </Block>

      <Block order={4} title="Risk Acknowledgement" testid="entry-ads-risks">
        <p>
          Highest acknowledged severity:{" "}
          <span
            className={`inline-block px-2 py-0.5 border rounded text-[10px] font-semibold ${RISK_BADGE[entry.highestRiskSeverity]}`}
          >
            {entry.highestRiskSeverity}
          </span>
        </p>
        {entry.riskCategoriesPresent.length === 0 ? (
          <p>No risk categories were recorded.</p>
        ) : (
          <p>Risk categories present: {entry.riskCategoriesPresent.join(", ")}.</p>
        )}
      </Block>

      <Block order={5} title="Trade-Off Exploration Summary" testid="entry-ads-tradeoff">
        <p>
          Approved under baseline posture: architecture style{" "}
          <span className="font-semibold">{b.architectureStyle}</span>,
          deployment model{" "}
          <span className="font-semibold">{b.deploymentModel}</span>, scope
          level <span className="font-semibold">{b.scopeLevel}</span>.
        </p>
      </Block>

      <Block order={6} title="Decision Record" testid="entry-ads-record">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Project Name: {entry.projectName}</li>
          <li>Approving Authority: {entry.approvingAuthority}</li>
          <li>Decision Date: {entry.decisionDate}</li>
          <li>ADS ID: {entry.adsId}</li>
          <li>Version: {entry.adsVersion}</li>
        </ul>
      </Block>

      <PreviewFooter />
    </div>
  );
}

// Renders the read-only ECP shape directly from a PortfolioEntry.
// Same rationale as EntryAdsView: HC4 forbids persisting the inputs
// needed to re-run the ECP builder, so the viewer renders the
// category-level ECP wording from the persisted summary.
export function EntryEcpView({ entry }: EntryViewProps) {
  const b = entry.baselinePosture;
  return (
    <div className="space-y-5" data-testid="entry-ecp-view">
      <PreviewHeader title="Execution Constraint Profile" project={entry.projectName} />

      <Block order={1} title="Decision Reference" testid="entry-ecp-reference">
        <p>
          This profile is issued under Architecture Decision Snapshot{" "}
          {entry.adsId} (version {entry.adsVersion}), dated {entry.decisionDate}.
        </p>
        <p>
          The decision was approved on behalf of {entry.approvingAuthority} for
          the initiative known as &quot;{entry.projectName}&quot;.
        </p>
      </Block>

      <Block order={2} title="Mandatory Architectural Layers" testid="entry-ecp-layers">
        {entry.layersPresent.length === 0 ? (
          <p>No architectural layers were recorded under this profile.</p>
        ) : (
          <>
            <p>
              Implementations conducted under this profile must address every
              architectural layer listed below. Omission of any listed layer is
              not permitted.
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {entry.layersPresent.map((l) => (
                <li key={l}>{l} layer</li>
              ))}
            </ul>
          </>
        )}
      </Block>

      <Block order={3} title="Acknowledged Risk Categories" testid="entry-ecp-risks">
        {entry.riskCategoriesPresent.length === 0 ? (
          <p>
            No architectural risks were acknowledged at the time of decision
            approval.
          </p>
        ) : (
          <>
            <p>
              Architectural risks were acknowledged at the time of decision
              approval in the following constraint categories. The full
              description of each acknowledged risk is recorded in the
              Architecture Decision Snapshot.
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {entry.riskCategoriesPresent.map((c) => (
                <li key={c}>{c} risk acknowledged.</li>
              ))}
            </ul>
          </>
        )}
      </Block>

      <Block order={4} title="Trade-Off Boundary" testid="entry-ecp-tradeoff">
        <p>
          The decision was approved under the following locked trade-off
          posture: architecture style {b.architectureStyle}, deployment model{" "}
          {b.deploymentModel}, scope level {b.scopeLevel}.
        </p>
        <p>
          Implementations operating outside this posture are unsanctioned under
          this profile and require a re-approved Architecture Decision
          Snapshot.
        </p>
      </Block>

      <Block order={5} title="Change Control" testid="entry-ecp-change">
        <p>
          Any change to the architectural decision requires re-entering the
          canvas at Step 2 and producing a new Architecture Decision Snapshot.
          This profile does not authorise in-flight amendment.
        </p>
      </Block>

      <PreviewFooter />
    </div>
  );
}

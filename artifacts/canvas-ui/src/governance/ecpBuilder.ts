import type {
  ADS,
  ECP,
  ECPResolvedSection,
  ECPSectionDefinition,
} from "./types";
import {
  ECP_SECTION_DEFINITIONS,
  STATIC_TEXT,
  validateSectionDefinitions,
} from "./ecpSections";

function resolveSection(def: ECPSectionDefinition, ads: ADS): ECPResolvedSection {
  const base = { ...def };
  switch (def.sectionId) {
    case "ECP_DECISION_REFERENCE": {
      return {
        ...base,
        paragraphs: [
          `This profile is issued under Architecture Decision Snapshot ${ads.adsId} (version ${ads.version}), dated ${ads.date}.`,
          `The decision was approved on behalf of ${ads.approvingAuthority} for the initiative known as "${ads.projectName}".`,
        ],
      };
    }
    case "ECP_APPROVED_SCOPE": {
      const scopeSec = ads.sections.find(
        (s) => s.sectionId === "ADS_CAPABILITY_SCOPE",
      );
      if (!scopeSec || scopeSec.sectionId !== "ADS_CAPABILITY_SCOPE") {
        return { ...base, paragraphs: ["No capability scope was recorded."] };
      }
      const lines: string[] = [];
      lines.push(
        `In-scope capabilities authorised under this profile: ${scopeSec.inScope.length === 0 ? "none" : scopeSec.inScope.map((c) => c.name).join("; ")}.`,
      );
      lines.push(
        `Deferred capabilities (acknowledged but not authorised under this profile): ${scopeSec.deferred.length === 0 ? "none" : scopeSec.deferred.map((c) => c.name).join("; ")}.`,
      );
      lines.push(
        `Out-of-scope capabilities (explicitly excluded): ${scopeSec.outOfScope.length === 0 ? "none" : scopeSec.outOfScope.map((c) => c.name).join("; ")}.`,
      );
      return { ...base, paragraphs: lines };
    }
    case "ECP_MANDATORY_LAYERS": {
      const archSec = ads.sections.find(
        (s) => s.sectionId === "ADS_DERIVED_ARCHITECTURE",
      );
      if (!archSec || archSec.sectionId !== "ADS_DERIVED_ARCHITECTURE") {
        return { ...base, paragraphs: ["No architectural layers were derived."] };
      }
      const layerNames = archSec.layers.map((l) => l.layer);
      return {
        ...base,
        paragraphs: [
          "Implementations conducted under this profile must address every architectural layer listed below. Omission of any listed layer is not permitted.",
        ],
        bullets: layerNames.map((l) => `${l} layer`),
      };
    }
    case "ECP_CONSTRAINT_CATEGORIES": {
      return {
        ...base,
        paragraphs: [STATIC_TEXT.constraintCategoriesIntro],
        bullets: [...STATIC_TEXT.constraintCategories],
      };
    }
    case "ECP_INTEGRATION_LEGACY": {
      const ctxSec = ads.sections.find(
        (s) => s.sectionId === "ADS_DECISION_CONTEXT",
      );
      const archSec = ads.sections.find(
        (s) => s.sectionId === "ADS_DERIVED_ARCHITECTURE",
      );
      const intent =
        ctxSec && ctxSec.sectionId === "ADS_DECISION_CONTEXT"
          ? ctxSec.context.systemIntent
          : "NewCapability";
      const hasIntegration =
        archSec &&
        archSec.sectionId === "ADS_DERIVED_ARCHITECTURE" &&
        archSec.layers.some((l) => l.layer === "Integration");
      const lines: string[] = [];
      if (intent === "LegacyReplacement") {
        lines.push(
          "This profile governs a legacy replacement initiative. The legacy boundary is in scope and must be addressed.",
        );
      } else {
        lines.push(
          "This profile governs the introduction of a new capability. Coexistence with adjacent systems already in operation is in scope and must be addressed.",
        );
      }
      if (hasIntegration) {
        lines.push(
          "An integration layer is mandated by this profile. Cross-system integration is in scope.",
        );
      } else {
        lines.push(
          "No integration layer is mandated by this profile. Cross-system integration falls outside this profile and requires re-approval.",
        );
      }
      return { ...base, paragraphs: lines };
    }
    case "ECP_ACKNOWLEDGED_RISKS": {
      const riskSec = ads.sections.find(
        (s) => s.sectionId === "ADS_RISK_ACKNOWLEDGEMENT",
      );
      if (!riskSec || riskSec.sectionId !== "ADS_RISK_ACKNOWLEDGEMENT") {
        return { ...base, paragraphs: ["No risks were acknowledged."] };
      }
      if (riskSec.risks.length === 0) {
        return {
          ...base,
          paragraphs: [
            "No architectural risks were acknowledged at the time of decision approval. Implementation teams remain responsible for risks arising during delivery.",
          ],
        };
      }
      return {
        ...base,
        paragraphs: [
          "The following risks were acknowledged at the time of decision approval. Implementation teams must operate with awareness of each risk.",
        ],
        bullets: riskSec.risks.map(
          (r) => `${r.category} (${r.level}): ${r.reason}`,
        ),
      };
    }
    case "ECP_TRADEOFF_BOUNDARY": {
      const tSec = ads.sections.find(
        (s) => s.sectionId === "ADS_TRADEOFF_SUMMARY",
      );
      if (!tSec || tSec.sectionId !== "ADS_TRADEOFF_SUMMARY") {
        return {
          ...base,
          paragraphs: ["No trade-off posture was recorded."],
        };
      }
      const b = tSec.baseline;
      return {
        ...base,
        paragraphs: [
          `The decision was approved under the following locked trade-off posture: architecture style ${b.architectureStyle}, deployment model ${b.deploymentModel}, scope level ${b.scopeLevel}.`,
          "Implementations operating outside this posture are unsanctioned under this profile and require a re-approved Architecture Decision Snapshot.",
        ],
      };
    }
    case "ECP_CHANGE_CONTROL": {
      return { ...base, paragraphs: [STATIC_TEXT.changeControlClause] };
    }
    case "ECP_DISCLAIMER": {
      return { ...base, paragraphs: [STATIC_TEXT.disclaimer] };
    }
    default: {
      return { ...base, paragraphs: ["(no content resolver registered)"] };
    }
  }
}

export function buildECP(ads: ADS): ECP {
  validateSectionDefinitions(ECP_SECTION_DEFINITIONS);
  // HC2: enforce ordering programmatically here, not at the JSX level.
  const ordered = [...ECP_SECTION_DEFINITIONS].sort(
    (a, b) => a.sectionOrder - b.sectionOrder,
  );
  const sections = ordered.map((def) => resolveSection(def, ads));
  return {
    adsId: ads.adsId,
    version: ads.version,
    date: ads.date,
    projectName: ads.projectName,
    approvingAuthority: ads.approvingAuthority,
    sections,
  };
}

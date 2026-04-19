// Phase 6 — TOGAF / ArchiMate Constitutional Layer.
//
// This module is constitutional, not functional. It encodes Phase 6's
// hard constraints (PH6-HC1..PH6-HC7) as static tables, a single
// verbatim disclaimer, a single allowed reference-token formatter, and
// a small set of pure validators that REFUSE any payload exceeding
// what its docking class permits.
//
// The module deliberately exports no escalation, blocking, override,
// or workflow primitive. Its only behaviour is: classify, refuse,
// expose-as-text. Everything here is removable in one delete to
// restore Phase 5 behaviour (PH6-HC7).
//
// Layering against the static-text guard: every sentence below is
// either checked at module load against TOGAF_CONTAINMENT_FORBIDDEN
// or, in the case of the meta-disclaimer (which contains the very
// words it negates), exempted by spec-equality with the canonical
// brief wording. This mirrors the Phase 1 banner / Phase 5 prefix
// exemption pattern.
import {
  assertAllTogafContainmentLanguage,
  TOGAF_CONTAINMENT_FORBIDDEN,
} from "./staticTextGuard";

// PH6-HC3 — Mandatory non-authority disclaimer. The wording is the
// verbatim text from the Phase 6 brief. Any export, page, or other
// surface that carries ADC content MUST render this exact string.
//
// The disclaimer is a meta-disclaimer: it negates the very words
// ("mandate", "justify") that TOGAF_CONTAINMENT_FORBIDDEN bans.
// Substring guards cannot distinguish the negated usage from a leak,
// so the sentence is verified by spec-equality at module load (see
// SPEC_DISCLAIMER below) instead of vocabulary scan.
export const MANDATORY_NON_AUTHORITY_DISCLAIMER =
  "This material references Architecture Decision Canvas artefacts for contextual understanding only. It does not mandate action, justify change, or substitute for human judgment.";

const SPEC_DISCLAIMER =
  "This material references Architecture Decision Canvas artefacts for contextual understanding only. It does not mandate action, justify change, or substitute for human judgment.";

if (MANDATORY_NON_AUTHORITY_DISCLAIMER !== SPEC_DISCLAIMER) {
  throw new Error(
    "Phase 6 mandatory non-authority disclaimer has drifted from the brief wording.",
  );
}

// PH6-HC1 — Docking classification. Each TOGAF artefact type is
// statically classified as one of three values. The classification is
// constitutional and cannot be overridden at runtime.
export type DockingClass =
  | "REFERENCE_ONLY"
  | "INTERPRETIVE_ATTACHMENT"
  | "FORBIDDEN";

// The canonical TOGAF artefact list below is the surface Phase 6
// recognises. It is intentionally NOT exhaustive: artefacts not
// listed here are treated as FORBIDDEN by default (see
// `getDockingClass`).
export const TOGAF_ARTEFACT_DOCKING: ReadonlyArray<{
  artefact: string;
  dockingClass: DockingClass;
  rationale: string;
}> = Object.freeze([
  {
    artefact: "Architecture Vision",
    dockingClass: "REFERENCE_ONLY",
    rationale:
      "Vision documents may cite an approved decision by reference. They do not embed ADC narrative.",
  },
  {
    artefact: "Architecture Definition Document",
    dockingClass: "REFERENCE_ONLY",
    rationale:
      "Definition documents may cite an approved decision by reference. ADC narrative is not authoritative input.",
  },
  {
    artefact: "Architecture Contract",
    dockingClass: "REFERENCE_ONLY",
    rationale:
      "Contracts may cite an approved decision by reference. ADC narrative does not bind contractual obligations.",
  },
  {
    artefact: "Business Architecture Catalogs",
    dockingClass: "INTERPRETIVE_ATTACHMENT",
    rationale:
      "Descriptive catalogs may carry ADC narrative as a non-directive appendix.",
  },
  {
    artefact: "Application Architecture Catalogs",
    dockingClass: "INTERPRETIVE_ATTACHMENT",
    rationale:
      "Descriptive catalogs may carry ADC narrative as a non-directive appendix.",
  },
  {
    artefact: "Data Architecture Catalogs",
    dockingClass: "INTERPRETIVE_ATTACHMENT",
    rationale:
      "Descriptive catalogs may carry ADC narrative as a non-directive appendix.",
  },
  {
    artefact: "Technology Architecture Catalogs",
    dockingClass: "INTERPRETIVE_ATTACHMENT",
    rationale:
      "Descriptive catalogs may carry ADC narrative as a non-directive appendix.",
  },
  {
    artefact: "Requirements Specification",
    dockingClass: "FORBIDDEN",
    rationale:
      "Specifications come from human stakeholders; ADC artefacts do not produce them.",
  },
  {
    artefact: "Architecture Roadmap",
    dockingClass: "FORBIDDEN",
    rationale:
      "Roadmaps describe planned work and ordering. ADC artefacts do not authorise or order work.",
  },
  {
    artefact: "Implementation Governance Plan",
    dockingClass: "FORBIDDEN",
    rationale:
      "Implementation governance directs delivery. ADC artefacts do not direct delivery.",
  },
  {
    artefact: "Statement of Architecture Work",
    dockingClass: "FORBIDDEN",
    rationale:
      "A Statement of Architecture Work commissions effort. ADC artefacts do not commission effort.",
  },
  {
    artefact: "Migration Plan",
    dockingClass: "FORBIDDEN",
    rationale:
      "Migration plans describe transition activity. ADC artefacts do not describe transition activity.",
  },
  {
    artefact: "Architecture Change Management Plan",
    dockingClass: "FORBIDDEN",
    rationale:
      "Change management plans direct organisational activity. ADC artefacts do not direct activity.",
  },
]);

// Default-deny: any artefact name not in the table is treated as
// FORBIDDEN. Codifies the brief's "If unsure, default to exclusion".
export function getDockingClass(artefactName: string): DockingClass {
  const row = TOGAF_ARTEFACT_DOCKING.find(
    (r) => r.artefact.toLowerCase() === artefactName.toLowerCase(),
  );
  return row ? row.dockingClass : "FORBIDDEN";
}

// PH6-HC2 — The single allowed reference-token format. ADC data may
// leave the application only as the existing PDF/DOCX text artefacts
// or as this short-form token. No structured serialisation is added.
export function formatADCReference(adsId: string, decisionDate: string): string {
  if (typeof adsId !== "string" || adsId.length === 0) {
    throw new Error("formatADCReference: adsId must be a non-empty string.");
  }
  if (typeof decisionDate !== "string" || decisionDate.length === 0) {
    throw new Error("formatADCReference: decisionDate must be a non-empty string.");
  }
  return `ADC_REF: ${adsId} · ${decisionDate}`;
}

// REFERENCE_ONLY payloads may carry only the adsId and decisionDate.
// Anything else is a constitutional violation and the validator
// throws (PH6-HC1, PH6-HC6).
export interface ReferenceOnlyPayload {
  adsId: string;
  decisionDate: string;
}

const REFERENCE_ONLY_KEYS = new Set(["adsId", "decisionDate"]);

export function assertReferenceOnly(payload: unknown): void {
  if (payload === null || typeof payload !== "object") {
    throw new Error("assertReferenceOnly: payload must be an object.");
  }
  const p = payload as Record<string, unknown>;
  for (const k of Object.keys(p)) {
    if (!REFERENCE_ONLY_KEYS.has(k)) {
      throw new Error(
        `REFERENCE_ONLY docking forbids field "${k}". Only adsId and decisionDate may appear.`,
      );
    }
  }
  if (typeof p.adsId !== "string" || p.adsId.length === 0) {
    throw new Error("REFERENCE_ONLY payload missing or invalid adsId.");
  }
  if (typeof p.decisionDate !== "string" || p.decisionDate.length === 0) {
    throw new Error("REFERENCE_ONLY payload missing or invalid decisionDate.");
  }
}

// INTERPRETIVE_ATTACHMENT payloads may additionally carry one or more
// ADC narrative paragraphs as a non-directive appendix. Narratives
// are plain strings; no structured fields, no metrics, no scoring.
// The disclaimer is mandatory.
export interface InterpretiveAttachmentPayload {
  adsId: string;
  decisionDate: string;
  narrativeParagraphs: string[];
  disclaimer: string;
}

const INTERPRETIVE_KEYS = new Set([
  "adsId",
  "decisionDate",
  "narrativeParagraphs",
  "disclaimer",
]);

export function assertInterpretiveAttachment(payload: unknown): void {
  if (payload === null || typeof payload !== "object") {
    throw new Error("assertInterpretiveAttachment: payload must be an object.");
  }
  const p = payload as Record<string, unknown>;
  for (const k of Object.keys(p)) {
    if (!INTERPRETIVE_KEYS.has(k)) {
      throw new Error(
        `INTERPRETIVE_ATTACHMENT docking forbids field "${k}". Allowed fields: ${Array.from(INTERPRETIVE_KEYS).join(", ")}.`,
      );
    }
  }
  if (typeof p.adsId !== "string" || p.adsId.length === 0) {
    throw new Error("INTERPRETIVE_ATTACHMENT payload missing or invalid adsId.");
  }
  if (typeof p.decisionDate !== "string" || p.decisionDate.length === 0) {
    throw new Error("INTERPRETIVE_ATTACHMENT payload missing or invalid decisionDate.");
  }
  if (
    !Array.isArray(p.narrativeParagraphs) ||
    !p.narrativeParagraphs.every((x) => typeof x === "string")
  ) {
    throw new Error(
      "INTERPRETIVE_ATTACHMENT payload narrativeParagraphs must be an array of strings.",
    );
  }
  if (p.disclaimer !== MANDATORY_NON_AUTHORITY_DISCLAIMER) {
    throw new Error(
      "INTERPRETIVE_ATTACHMENT payload must carry the verbatim mandatory non-authority disclaimer.",
    );
  }
}

// All Phase 6 docking-table rationale strings are descriptive only
// and must satisfy the strictest tier. The disclaimer is verified by
// spec-equality above (it contains the very words it negates) so it
// is excluded from this scan.
assertAllTogafContainmentLanguage(
  TOGAF_ARTEFACT_DOCKING.map((r) => r.rationale),
);

// Re-export the tier so consumers (Containment page, Wizard hint) can
// register their own labels without reaching into staticTextGuard
// directly.
export { TOGAF_CONTAINMENT_FORBIDDEN };

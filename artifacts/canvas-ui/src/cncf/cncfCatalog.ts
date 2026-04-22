// CNCF reference catalog — CTAD-side validator and adapter.
//
// The catalog data and its base type contracts live in the
// workspace package `@workspace/cncf-catalog` (per task #74
// step 1). This file is the canvas-ui-side adapter:
//
//   (1) It re-exports `CNCF_CARDS` and `findCard` so existing
//       imports of `./cncfCatalog` continue to resolve.
//
//   (2) It runs the CTAD-coupled module-load validations that
//       the package itself cannot run (because it is free of
//       any dependency on the application's CTAD registry):
//         - every `BindingHint.paramId` must exist in
//           `ctadRegistry`,
//         - `sets` is permitted only on single-kind parameters
//           and the value must be a permitted option,
//         - `constrains` must list a non-empty subset of the
//           target parameter's permitted options,
//         - `justifies` must carry a non-empty rationale,
//         - every CTAD section must have at least one card
//           that targets a paramId in that section.
//
//   (3) It exposes the section-relevance helpers
//       (`cardSections`, `cardsForSection`) which are
//       inherently CTAD-coupled and therefore stay on the
//       application side.

import {
  findParam,
  findSectionForParam,
  type CtadParameter,
  type CtadSectionId,
} from "@/ctad/ctadRegistry";
import {
  CNCF_CARDS,
  findCard,
  type BindingHint,
  type CncfCard,
} from "@workspace/cncf-catalog";

export { CNCF_CARDS, findCard };

// (1) Binding-hint validation against the live CTAD registry ---------
function validateBindingHint(card: CncfCard, hint: BindingHint): void {
  const param: CtadParameter | undefined = findParam(hint.paramId);
  if (!param) {
    throw new Error(
      `CNCF catalog: card "${card.id}" references unknown CTAD parameter id "${hint.paramId}". Every binding hint paramId must exist in ctadRegistry.`,
    );
  }
  if (hint.kind === "sets") {
    if (param.kind !== "single") {
      throw new Error(
        `CNCF catalog: card "${card.id}" uses a "sets" hint on multi-kind parameter "${hint.paramId}". "sets" is only permitted for single-kind parameters.`,
      );
    }
    if (!param.options.includes(hint.value)) {
      throw new Error(
        `CNCF catalog: card "${card.id}" "sets" "${hint.paramId}" to "${hint.value}", which is not a permitted option. Permitted: ${param.options.join(", ")}.`,
      );
    }
  } else if (hint.kind === "constrains") {
    if (hint.allowedOptions.length === 0) {
      throw new Error(
        `CNCF catalog: card "${card.id}" "constrains" "${hint.paramId}" to an empty option set.`,
      );
    }
    for (const opt of hint.allowedOptions) {
      if (!param.options.includes(opt)) {
        throw new Error(
          `CNCF catalog: card "${card.id}" "constrains" "${hint.paramId}" to "${opt}", which is not a permitted option. Permitted: ${param.options.join(", ")}.`,
        );
      }
    }
  } else if (hint.kind === "justifies") {
    if (typeof hint.rationale !== "string" || hint.rationale.length === 0) {
      throw new Error(
        `CNCF catalog: card "${card.id}" "justifies" "${hint.paramId}" with an empty rationale.`,
      );
    }
  } else {
    const _exhaustive: never = hint;
    void _exhaustive;
  }
}

for (const card of CNCF_CARDS) {
  for (const hint of card.bindingHints) validateBindingHint(card, hint);
}

// (2) Section-relevance helpers --------------------------------------
//
// A card is "relevant" to a CTAD section when one or more of its
// binding hints targets a paramId that belongs to that section.
// Cards with no binding hints are not relevant to any section.

export function cardSections(card: CncfCard): readonly CtadSectionId[] {
  const set = new Set<CtadSectionId>();
  for (const hint of card.bindingHints) {
    const sec = findSectionForParam(hint.paramId);
    if (sec) set.add(sec);
  }
  return Array.from(set);
}

export function cardsForSection(sectionId: CtadSectionId): readonly CncfCard[] {
  return CNCF_CARDS.filter((c) => cardSections(c).includes(sectionId));
}

// (3) Section coverage invariant -------------------------------------
// Every CTAD section must have at least one relevant card so that
// the per-section "Relevant cards" panel is never empty.
{
  const ALL_SECTIONS: readonly CtadSectionId[] = [
    "infrastructure",
    "application",
    "integration",
    "crossCutting",
    "ops",
  ];
  const missing: CtadSectionId[] = [];
  for (const s of ALL_SECTIONS) {
    if (cardsForSection(s).length === 0) missing.push(s);
  }
  if (missing.length > 0) {
    throw new Error(
      `CNCF catalog: no cards are relevant to CTAD section(s) "${missing.join(", ")}". Every CTAD section must have at least one binding-hint reference in the frozen catalog.`,
    );
  }
}

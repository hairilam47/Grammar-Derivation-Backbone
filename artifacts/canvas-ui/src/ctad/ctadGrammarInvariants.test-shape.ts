// CTAD v1 — build-time grammar invariants.
//
// Module-load assertions that fail the bundle if the CTAD parameter
// registry drifts from its constitutional shape. Mirrors the ACW
// grammar invariant pattern.
//
// What this module guards:
//   1. Schema version is locked to "ctad-1.0".
//   2. The registry exposes exactly the four canonical sections.
//   3. Every parameter has a non-empty option list.
//   4. No parameter is required (CTAD selections are reversible
//      and may always be left unspecified). This is asserted
//      structurally: the parameter shape has no `required` flag
//      and the store always permits a `null` value via
//      `clearCtadParam` / `setCtadParam(..., null)`.
//   5. Parameter ids are unique across the whole registry.
//   6. Parameter ids and section ids are stable identifiers (no
//      whitespace, no special characters).

import {
  CTAD_REGISTRY,
  CTAD_SCHEMA_VERSION,
  CTAD_SECTIONS,
  ALL_PARAM_IDS,
  type CtadSectionId,
} from "./ctadRegistry";
import {
  __ctadStoreInternals,
  clearCtadParam,
  exportCtadState,
} from "./ctadStore";

const PREFIX = "CTAD v1 grammar invariant violation";

// (0) Registry shape: frozen and well-formed.
if (!Object.isFrozen(CTAD_REGISTRY)) {
  throw new Error(`${PREFIX}: CTAD_REGISTRY is not frozen.`);
}
if (!Object.isFrozen(CTAD_SECTIONS)) {
  throw new Error(`${PREFIX}: CTAD_SECTIONS is not frozen.`);
}

// (1) Schema version locked.
if (CTAD_REGISTRY.schemaVersion !== CTAD_SCHEMA_VERSION) {
  throw new Error(
    `${PREFIX}: CTAD_REGISTRY.schemaVersion (${CTAD_REGISTRY.schemaVersion}) and CTAD_SCHEMA_VERSION (${CTAD_SCHEMA_VERSION}) disagree.`,
  );
}
if (CTAD_SCHEMA_VERSION !== "ctad-1.0") {
  throw new Error(
    `${PREFIX}: schemaVersion drift detected. v1 must remain "ctad-1.0"; future structural changes require an explicit "ctad-2.0".`,
  );
}

// (2) Exactly the five canonical sections, in canonical order.
// Section #5 ("ops") was added in Task #74 alongside the CNCF
// reference catalog. The ordering is fixed: ops is appended last
// so existing CTAD_STATE consumers iterating registry order remain
// stable for the original four sections.
const EXPECTED_SECTION_IDS: readonly CtadSectionId[] = [
  "infrastructure",
  "application",
  "integration",
  "crossCutting",
  "ops",
];
if (CTAD_SECTIONS.length !== EXPECTED_SECTION_IDS.length) {
  throw new Error(
    `${PREFIX}: expected ${EXPECTED_SECTION_IDS.length} sections, found ${CTAD_SECTIONS.length}.`,
  );
}
for (let i = 0; i < EXPECTED_SECTION_IDS.length; i++) {
  if (CTAD_SECTIONS[i].id !== EXPECTED_SECTION_IDS[i]) {
    throw new Error(
      `${PREFIX}: section[${i}] expected id "${EXPECTED_SECTION_IDS[i]}", found "${CTAD_SECTIONS[i].id}".`,
    );
  }
}

// (3) Every parameter has a non-empty option list.
for (const section of CTAD_SECTIONS) {
  if (section.parameters.length === 0) {
    throw new Error(
      `${PREFIX}: section "${section.id}" has no parameters.`,
    );
  }
  for (const param of section.parameters) {
    if (param.options.length === 0) {
      throw new Error(
        `${PREFIX}: parameter "${param.id}" in section "${section.id}" has an empty option list.`,
      );
    }
    if (param.kind !== "single" && param.kind !== "multi") {
      throw new Error(
        `${PREFIX}: parameter "${param.id}" has unknown kind "${param.kind}". Permitted: "single" | "multi".`,
      );
    }
  }
}

// (4) No parameter is required. The CTAD shape has no `required`
// flag at all; this assertion catches a future regression that
// would add one. We cast to a loose record and check.
for (const section of CTAD_SECTIONS) {
  for (const param of section.parameters) {
    if ((param as unknown as Record<string, unknown>).required !== undefined) {
      throw new Error(
        `${PREFIX}: parameter "${param.id}" introduces a "required" flag. CTAD selections must remain reversible and optional.`,
      );
    }
  }
}

// (5) Parameter ids are unique across the entire registry.
{
  const seen = new Set<string>();
  for (const id of ALL_PARAM_IDS) {
    if (seen.has(id)) {
      throw new Error(`${PREFIX}: duplicate parameter id "${id}".`);
    }
    seen.add(id);
  }
}

// (6) Parameter ids and section ids are stable camelCase identifiers.
const ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
for (const section of CTAD_SECTIONS) {
  if (!ID_PATTERN.test(section.id)) {
    throw new Error(
      `${PREFIX}: section id "${section.id}" is not a valid camelCase identifier.`,
    );
  }
  for (const param of section.parameters) {
    if (!ID_PATTERN.test(param.id)) {
      throw new Error(
        `${PREFIX}: parameter id "${param.id}" is not a valid camelCase identifier.`,
      );
    }
  }
}

// (7) Store contract: exportCtadState returns null for every
// parameter on an empty binding, and clearCtadParam is always
// permitted. We probe an isolated synthetic binding key that
// cannot collide with any real ADC binding.
{
  const probeBinding = {
    adsId: "__ctad_invariant_probe__",
    adsVersion: "0",
  };
  // Defensive cleanup before and after the probe so we never leak
  // synthetic state into the persisted document.
  for (const id of ALL_PARAM_IDS) clearCtadParam(probeBinding, id);

  const exported = exportCtadState(probeBinding);
  if (exported.schemaVersion !== CTAD_SCHEMA_VERSION) {
    throw new Error(
      `${PREFIX}: exportCtadState returned schemaVersion "${exported.schemaVersion}".`,
    );
  }
  for (const section of CTAD_SECTIONS) {
    const groupKey = section.id as CtadSectionId;
    const group = exported[groupKey];
    for (const param of section.parameters) {
      if (group[param.id] !== null) {
        throw new Error(
          `${PREFIX}: empty binding exported "${param.id}" as ${JSON.stringify(group[param.id])}, expected null.`,
        );
      }
    }
  }

  // Verify that the synthetic probe did not perturb the persisted
  // document by clearing it again and re-reading.
  for (const id of ALL_PARAM_IDS) clearCtadParam(probeBinding, id);
  const finalDoc = __ctadStoreInternals.readDoc();
  if (
    finalDoc.bindings[`${probeBinding.adsId}@${probeBinding.adsVersion}`] !==
    undefined
  ) {
    throw new Error(
      `${PREFIX}: invariant probe binding leaked into persisted store.`,
    );
  }
}

export function assertCtadV1GrammarInvariants(): void {
  if (CTAD_REGISTRY.schemaVersion !== "ctad-1.0") {
    throw new Error(`${PREFIX}: schemaVersion drift detected at runtime.`);
  }
}

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
  ENVIRONMENT_KIND_OPTIONS,
  ENVIRONMENT_HOSTING_MODEL_OPTIONS,
  type CtadSectionId,
} from "./ctadRegistry";
import {
  __ctadStoreInternals,
  clearCtadParam,
  createArchitecture,
  exportArchitectureState,
  exportCtadState,
  getArchitectureDoc,
  removeArchitecture,
  setArchitectureParam,
} from "./ctadStore";
import {
  ARCHITECTURE_ID_REGEX,
  generateArchitectureId,
  isValidArchitectureId,
  slugifyArchitectureName,
} from "./architectureIdentity";

const PREFIX = "CTAD v1 grammar invariant violation";

// Helper: pick the first single-valued parameter and a permitted
// option for it. Used by the architecture leak-rule probe so we
// don't depend on a specific parameter id existing in any one
// section.
function findFirstSettableParam(): { id: string; value: string } {
  for (const section of CTAD_SECTIONS) {
    for (const p of section.parameters) {
      if (p.kind === "single" && p.options.length > 0) {
        return { id: p.id, value: p.options[0] };
      }
    }
  }
  throw new Error(
    `${PREFIX}: no single-valued parameter exists; the leak-rule probe needs at least one.`,
  );
}

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
// Schema lineage:
//   Task #77 — bumped to "ctad-1.1" (first-class environments).
//   Task #78 — bumped to "ctad-1.2" (first-class architectures, the
//              standalone-mode peer of bindings; introduces a
//              top-level `architectures` map keyed by architectureId
//              with no `adsId`/`adsVersion` leakage).
// The store's read path remains backwards-compatible with persisted
// "ctad-1.0" and "ctad-1.1" docs via deterministic read-time
// migrations (empty-environments and empty-architectures
// respectively). v1.x must remain on the "ctad-1.x" channel;
// structural breaks require "ctad-2.0".
if (CTAD_SCHEMA_VERSION !== "ctad-1.2") {
  throw new Error(
    `${PREFIX}: schemaVersion drift detected. v1 must remain on the "ctad-1.x" channel ("ctad-1.2" current); structural breaks require an explicit "ctad-2.0".`,
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

// (8) Environments first-class shape (Task #77). Environment kind
// and hosting-model option vocabularies are non-empty, frozen, and
// internally unique. The compiler reads `environments` verbatim
// from CTAD_STATE; these checks pin the option sets that the store
// is allowed to admit so a regression in the registry would fail
// the bundle rather than silently widen the vocabulary.
if (!Object.isFrozen(ENVIRONMENT_KIND_OPTIONS)) {
  throw new Error(`${PREFIX}: ENVIRONMENT_KIND_OPTIONS is not frozen.`);
}
if (!Object.isFrozen(ENVIRONMENT_HOSTING_MODEL_OPTIONS)) {
  throw new Error(`${PREFIX}: ENVIRONMENT_HOSTING_MODEL_OPTIONS is not frozen.`);
}
if (ENVIRONMENT_KIND_OPTIONS.length === 0) {
  throw new Error(`${PREFIX}: ENVIRONMENT_KIND_OPTIONS is empty.`);
}
if (ENVIRONMENT_HOSTING_MODEL_OPTIONS.length === 0) {
  throw new Error(`${PREFIX}: ENVIRONMENT_HOSTING_MODEL_OPTIONS is empty.`);
}
{
  const seen = new Set<string>();
  for (const k of ENVIRONMENT_KIND_OPTIONS) {
    if (seen.has(k)) {
      throw new Error(`${PREFIX}: duplicate environment kind "${k}".`);
    }
    seen.add(k);
  }
}
{
  const seen = new Set<string>();
  for (const h of ENVIRONMENT_HOSTING_MODEL_OPTIONS) {
    if (seen.has(h)) {
      throw new Error(`${PREFIX}: duplicate environment hosting model "${h}".`);
    }
    seen.add(h);
  }
}

// (9) Empty binding exports an empty environments array (never
// undefined). The compiler relies on this to take the flat-host
// branch when no environments are declared.
{
  const probeBinding = {
    adsId: "__ctad_env_invariant_probe__",
    adsVersion: "0",
  };
  const exported = exportCtadState(probeBinding);
  if (!Array.isArray(exported.environments) || exported.environments.length !== 0) {
    throw new Error(
      `${PREFIX}: empty binding exported environments=${JSON.stringify(exported.environments)}, expected [].`,
    );
  }
}

// (10) Architecture identity (Phase 1). The id format is
// `<slug>-<8-hex>`; the regex is the single source of truth and
// must accept ids produced by the generator and reject everything
// else relevant. The probe also verifies that an empty architecture
// round-trips through createArchitecture / exportArchitectureState
// with all parameters null and an empty environments list, and
// that removeArchitecture leaves no trace in the persisted doc.
{
  const slug = slugifyArchitectureName("Probe Architecture #1");
  if (slug !== "probe-architecture-1") {
    throw new Error(
      `${PREFIX}: slugifyArchitectureName produced unexpected slug "${slug}".`,
    );
  }
  const id = generateArchitectureId("Probe Architecture #1");
  if (!ARCHITECTURE_ID_REGEX.test(id)) {
    throw new Error(
      `${PREFIX}: generateArchitectureId produced id "${id}" which does not match ARCHITECTURE_ID_REGEX.`,
    );
  }
  if (!isValidArchitectureId(id)) {
    throw new Error(
      `${PREFIX}: isValidArchitectureId rejected its own generator output "${id}".`,
    );
  }
  // A few negative cases — these must be rejected.
  for (const bad of ["", "ABC-12345678", "noSuffix", "slug-1234567z"]) {
    if (isValidArchitectureId(bad)) {
      throw new Error(
        `${PREFIX}: isValidArchitectureId accepted invalid id "${bad}".`,
      );
    }
  }

  const created = createArchitecture("Invariant Probe");
  try {
    if (!isValidArchitectureId(created.architectureId)) {
      throw new Error(
        `${PREFIX}: createArchitecture produced invalid id "${created.architectureId}".`,
      );
    }
    // Defensive: architecture entries must NOT carry adsId/adsVersion.
    const leaked = created as unknown as Record<string, unknown>;
    if ("adsId" in leaked || "adsVersion" in leaked) {
      throw new Error(
        `${PREFIX}: architecture document leaks adsId/adsVersion fields.`,
      );
    }
    const exported = exportArchitectureState(created.architectureId);
    if (exported === null) {
      throw new Error(
        `${PREFIX}: exportArchitectureState returned null for a freshly created architecture.`,
      );
    }
    if (exported.schemaVersion !== CTAD_SCHEMA_VERSION) {
      throw new Error(
        `${PREFIX}: exportArchitectureState returned schemaVersion "${exported.schemaVersion}".`,
      );
    }
    if (
      (exported as unknown as Record<string, unknown>).binding !== undefined
    ) {
      throw new Error(
        `${PREFIX}: exportArchitectureState leaked a "binding" field.`,
      );
    }
    for (const section of CTAD_SECTIONS) {
      const groupKey = section.id as CtadSectionId;
      const group = exported[groupKey];
      for (const param of section.parameters) {
        if (group[param.id] !== null) {
          throw new Error(
            `${PREFIX}: empty architecture exported "${param.id}" as ${JSON.stringify(group[param.id])}, expected null.`,
          );
        }
      }
    }
    if (
      !Array.isArray(exported.environments) ||
      exported.environments.length !== 0
    ) {
      throw new Error(
        `${PREFIX}: empty architecture exported environments=${JSON.stringify(exported.environments)}, expected [].`,
      );
    }
    // (a) No-op short-circuit: clearing an already-unset param on a
    // freshly-created empty architecture must NOT trip the empty-leak
    // rule. Without this guard the entry would self-destruct on
    // create + first navigation.
    setArchitectureParam(created.architectureId, ALL_PARAM_IDS[0], null);
    if (getArchitectureDoc(created.architectureId) === null) {
      throw new Error(
        `${PREFIX}: a no-op clear on an empty architecture deleted the entry; the no-op short-circuit is missing.`,
      );
    }
    // (b) Empty-architecture-leak rule (parity with bindings):
    // setting then clearing the last param, with no environments
    // declared, must remove the entry.
    const firstParam = findFirstSettableParam();
    setArchitectureParam(
      created.architectureId,
      firstParam.id,
      firstParam.value,
    );
    if (getArchitectureDoc(created.architectureId) === null) {
      throw new Error(
        `${PREFIX}: setArchitectureParam to a real value deleted the entry; this should only happen on a real empty-leak transition.`,
      );
    }
    setArchitectureParam(created.architectureId, firstParam.id, null);
    if (getArchitectureDoc(created.architectureId) !== null) {
      throw new Error(
        `${PREFIX}: empty-architecture-leak rule did not fire: clearing the last param on an architecture with no envs must remove the entry.`,
      );
    }
  } finally {
    removeArchitecture(created.architectureId);
  }
  if (getArchitectureDoc(created.architectureId) !== null) {
    throw new Error(
      `${PREFIX}: removeArchitecture did not delete the architecture entry.`,
    );
  }
  const finalDoc = __ctadStoreInternals.readDoc();
  if (finalDoc.architectures[created.architectureId] !== undefined) {
    throw new Error(
      `${PREFIX}: invariant probe architecture leaked into persisted store.`,
    );
  }
}

export function assertCtadV1GrammarInvariants(): void {
  if (CTAD_REGISTRY.schemaVersion !== "ctad-1.2") {
    throw new Error(`${PREFIX}: schemaVersion drift detected at runtime.`);
  }
}

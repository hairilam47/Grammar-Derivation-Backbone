// Requirements Contract store — build-time invariants.
//
// File suffix `.test-shape.ts` mirrors the architecture-attachment /
// CTAD / ACW negative-shape pattern: this module's exports are
// build-time predicates, not feature surface.
//
// Asserts at module load:
//   1. The schema-version constant is exactly `"rc-1.0"`.
//   2. The persisted document conforms to the allow-list.
//   3. `freezeContract` rejects empty / non-approved input.
//   4. `freezeContract` is idempotent on the same stable set.
//   5. After freeze, the requirements store reflects status="frozen"
//      for every captured requirement (atomic with contract creation).

import {
  REQUIREMENTS_CONTRACT_SCHEMA_VERSION,
  freezeContract,
  listContracts,
} from "./requirementsContractStore";
import {
  saveRequirement,
  approveRequirement,
  deleteRequirement,
  getRequirement,
  listRequirements,
} from "./requirementsStore";

const EXPECTED_SCHEMA_VERSION = "rc-1.0";
const CONTRACT_STORAGE_KEY = "adc.requirements-contracts.v1";
const REQUIREMENTS_STORAGE_KEY = "adc.requirements.v1";

if (REQUIREMENTS_CONTRACT_SCHEMA_VERSION !== EXPECTED_SCHEMA_VERSION) {
  throw new Error(
    `Requirements-contract invariant: schema-version constant drifted. ` +
      `Expected "${EXPECTED_SCHEMA_VERSION}", got "${REQUIREMENTS_CONTRACT_SCHEMA_VERSION}".`,
  );
}

function withIsolatedStorage(probe: () => void): void {
  const hasWindow = typeof window !== "undefined" && !!window.localStorage;
  const priorContracts = hasWindow
    ? window.localStorage.getItem(CONTRACT_STORAGE_KEY)
    : null;
  const priorRequirements = hasWindow
    ? window.localStorage.getItem(REQUIREMENTS_STORAGE_KEY)
    : null;
  if (hasWindow) {
    window.localStorage.removeItem(CONTRACT_STORAGE_KEY);
    window.localStorage.removeItem(REQUIREMENTS_STORAGE_KEY);
  }
  try {
    probe();
  } finally {
    if (hasWindow) {
      if (priorContracts === null)
        window.localStorage.removeItem(CONTRACT_STORAGE_KEY);
      else window.localStorage.setItem(CONTRACT_STORAGE_KEY, priorContracts);
      if (priorRequirements === null)
        window.localStorage.removeItem(REQUIREMENTS_STORAGE_KEY);
      else window.localStorage.setItem(REQUIREMENTS_STORAGE_KEY, priorRequirements);
    }
  }
}

function assertDocAllowListShape(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const raw = window.localStorage.getItem(CONTRACT_STORAGE_KEY);
  if (raw === null) return;
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const allowedTop = new Set(["schemaVersion", "contracts"]);
  for (const k of Object.keys(doc)) {
    if (!allowedTop.has(k)) {
      throw new Error(
        `Requirements-contract invariant: persisted doc carries forbidden top-level key "${k}".`,
      );
    }
  }
  const contracts = (doc.contracts ?? {}) as Record<string, Record<string, unknown>>;
  const allowedContract = new Set([
    "contractId",
    "workItemId",
    "frozenAt",
    "frozenBy",
    "requirements",
    "summary",
  ]);
  for (const [cid, c] of Object.entries(contracts)) {
    for (const k of Object.keys(c)) {
      if (!allowedContract.has(k)) {
        throw new Error(
          `Requirements-contract invariant: contract "${cid}" carries forbidden field "${k}".`,
        );
      }
    }
  }
}

function expectThrow(label: string, fn: () => unknown): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(
      `Requirements-contract invariant: did not reject "${label}".`,
    );
  }
}

function run(): void {
  withIsolatedStorage(() => {
    if (listContracts().length !== 0) {
      throw new Error(
        "Requirements-contract invariant: isolated storage was not empty at probe start.",
      );
    }

    expectThrow("empty contract input", () =>
      freezeContract("probe-wi", [], "probe-user"),
    );

    // Make a draft requirement, then attempt to freeze a contract with
    // it — must throw.
    const draft = saveRequirement({
      workItemId: "probe-wi",
      title: "Probe draft",
      type: "functional",
      urgency: "low",
      moduleId: "module:probec",
    });
    expectThrow("contract over non-approved requirement", () =>
      freezeContract("probe-wi", [draft], "probe-user"),
    );

    // Approve, then freeze — must succeed.
    approveRequirement(draft.id);
    const approved = getRequirement(draft.id);
    if (!approved) {
      throw new Error(
        "Requirements-contract invariant: approveRequirement did not return a live row.",
      );
    }
    const c1 = freezeContract("probe-wi", [approved], "probe-user");
    if (c1.summary.total !== 1) {
      throw new Error(
        "Requirements-contract invariant: contract summary.total disagrees with input length.",
      );
    }
    const reFetched = getRequirement(draft.id);
    if (!reFetched || reFetched.status !== "frozen") {
      throw new Error(
        "Requirements-contract invariant: freezeContract did not flip the requirement to frozen.",
      );
    }

    // Idempotency: re-freeze the same set should return the same contract id.
    const c2 = freezeContract("probe-wi", [reFetched], "probe-user");
    if (c1.contractId !== c2.contractId) {
      throw new Error(
        `Requirements-contract invariant: freezeContract is not idempotent ` +
          `(got ${c1.contractId} vs ${c2.contractId} for the same set).`,
      );
    }

    assertDocAllowListShape();

    // Cleanup
    for (const r of listRequirements()) {
      if (r.status !== "frozen") deleteRequirement(r.id);
    }
  });
}

run();

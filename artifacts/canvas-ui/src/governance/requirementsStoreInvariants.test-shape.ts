// Requirements store — build-time invariants.
//
// File suffix `.test-shape.ts` mirrors the architecture-attachment /
// CTAD / ACW negative-shape pattern: this module's exports are
// build-time predicates, not feature surface.
//
// Asserts at module load:
//   1. The schema-version constant is exactly `"req-1.0"`.
//   2. The persisted document conforms to the allow-list.
//   3. The draft-rule fires: a saveRequirement call WITHOUT a
//      moduleId yields status='draft' regardless of the caller's
//      requested status.
//   4. `approveRequirement` rejects requirements without a moduleId
//      (the draft-rule applies forward — moduleless requirements
//      cannot leave draft).
//   5. `freezeRequirements` rejects requirements whose status is not
//      `'approved'`.
//   6. Hardware-typed requirements require a hardwareDetails block
//      with `quantity > 0`; non-hardware types must NOT carry a
//      hardwareDetails block.

import {
  REQUIREMENTS_SCHEMA_VERSION,
  saveRequirement,
  approveRequirement,
  freezeRequirements,
  deleteRequirement,
  listRequirements,
} from "./requirementsStore";
import {
  __snapshotScope,
  __restoreScopeSnapshot,
  getScopedKey,
} from "./storageKeyUtils";

const EXPECTED_SCHEMA_VERSION = "req-1.0";
const BASE_STORAGE_KEY = "adc.requirements.v1";
// Phase 2 (SaaS Onboarding) — requirements are Org+Work-Item-scoped.
const PROBE_ORG_ID = "probe-org-requirements";
const PROBE_WORK_ITEM_ID = "probe-wi-requirements";
const PROBE_KEY = getScopedKey(BASE_STORAGE_KEY, PROBE_ORG_ID, PROBE_WORK_ITEM_ID);

if (REQUIREMENTS_SCHEMA_VERSION !== EXPECTED_SCHEMA_VERSION) {
  throw new Error(
    `Requirements invariant: schema-version constant drifted. ` +
      `Expected "${EXPECTED_SCHEMA_VERSION}", got "${REQUIREMENTS_SCHEMA_VERSION}".`,
  );
}

function withIsolatedStorage(probe: () => void): void {
  const hasWindow = typeof window !== "undefined" && !!window.localStorage;
  const prior = hasWindow ? window.localStorage.getItem(PROBE_KEY) : null;
  if (hasWindow) window.localStorage.removeItem(PROBE_KEY);
  const scopeSnap = __snapshotScope();
  __restoreScopeSnapshot({
    orgId: PROBE_ORG_ID,
    workItemId: PROBE_WORK_ITEM_ID,
  });
  try {
    probe();
  } finally {
    __restoreScopeSnapshot(scopeSnap);
    if (hasWindow) {
      if (prior === null) window.localStorage.removeItem(PROBE_KEY);
      else window.localStorage.setItem(PROBE_KEY, prior);
    }
  }
}

function assertDocAllowListShape(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const raw = window.localStorage.getItem(PROBE_KEY);
  if (raw === null) return;
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const allowedTop = new Set(["schemaVersion", "requirements"]);
  for (const k of Object.keys(doc)) {
    if (!allowedTop.has(k)) {
      throw new Error(
        `Requirements invariant: persisted doc carries forbidden top-level key "${k}". ` +
          `Allow-list = { schemaVersion, requirements }.`,
      );
    }
  }
  const reqs = (doc.requirements ?? {}) as Record<string, Record<string, unknown>>;
  const allowedReq = new Set([
    "id",
    "workItemId",
    "title",
    "description",
    "type",
    "urgency",
    "moduleId",
    "hardwareDetails",
    "status",
  ]);
  const allowedHw = new Set([
    "itemName",
    "model",
    "quantity",
    "unitCostEstimate",
    "notes",
  ]);
  for (const [rid, r] of Object.entries(reqs)) {
    for (const k of Object.keys(r)) {
      if (!allowedReq.has(k)) {
        throw new Error(
          `Requirements invariant: requirement "${rid}" carries forbidden field "${k}".`,
        );
      }
    }
    const hw = r.hardwareDetails;
    if (hw !== null && hw !== undefined) {
      for (const k of Object.keys(hw as Record<string, unknown>)) {
        if (!allowedHw.has(k)) {
          throw new Error(
            `Requirements invariant: requirement "${rid}" hardwareDetails carries forbidden field "${k}".`,
          );
        }
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
      `Requirements invariant: validator failed to reject "${label}".`,
    );
  }
}

function probeDraftRule(): void {
  // Save with no moduleId, asking for 'approved' — store must force draft.
  const r = saveRequirement({
    workItemId: "probe-wi",
    title: "Moduleless requirement",
    type: "functional",
    urgency: "medium",
    moduleId: null,
    status: "approved",
  });
  if (r.status !== "draft") {
    throw new Error(
      `Requirements invariant: moduleless requirement must be draft, got status="${r.status}".`,
    );
  }
  // approveRequirement on a moduleless one MUST throw.
  expectThrow("approve moduleless requirement", () => approveRequirement(r.id));
  deleteRequirement(r.id);
}

function probeFreezeRule(): void {
  const r = saveRequirement({
    workItemId: "probe-wi",
    title: "Pending requirement",
    type: "functional",
    urgency: "low",
    moduleId: "module:probefreeze",
  });
  // freezeRequirements on a draft requirement MUST throw.
  expectThrow("freeze non-approved requirement", () => freezeRequirements([r.id]));
  // Approve, then freeze, must succeed.
  approveRequirement(r.id);
  const frozen = freezeRequirements([r.id]);
  if (frozen.length !== 1 || frozen[0].status !== "frozen") {
    throw new Error(
      `Requirements invariant: freezeRequirements did not transition status to "frozen".`,
    );
  }
  // Frozen requirement is immutable.
  expectThrow("delete frozen requirement", () => deleteRequirement(r.id));
}

function probeHardwareValidation(): void {
  // Hardware without details — reject.
  expectThrow("hardware without details", () =>
    saveRequirement({
      workItemId: "probe-wi",
      title: "Bare hardware",
      type: "hardware",
      urgency: "medium",
      moduleId: "module:probehw",
    }),
  );
  // Hardware with quantity 0 — reject.
  expectThrow("hardware with quantity 0", () =>
    saveRequirement({
      workItemId: "probe-wi",
      title: "Zero qty",
      type: "hardware",
      urgency: "medium",
      moduleId: "module:probehw",
      hardwareDetails: {
        itemName: "Server",
        model: "X",
        quantity: 0,
        unitCostEstimate: 1,
        notes: "",
      },
    }),
  );
  // Non-hardware type with hardware details — reject.
  expectThrow("functional carrying hardware details", () =>
    saveRequirement({
      workItemId: "probe-wi",
      title: "Misplaced hw block",
      type: "functional",
      urgency: "medium",
      moduleId: "module:probehw",
      hardwareDetails: {
        itemName: "Server",
        model: "X",
        quantity: 1,
        unitCostEstimate: 1,
        notes: "",
      },
    }),
  );
  // Valid hardware passes.
  const r = saveRequirement({
    workItemId: "probe-wi",
    title: "Valid hardware",
    type: "hardware",
    urgency: "low",
    moduleId: "module:probehw",
    hardwareDetails: {
      itemName: "Server",
      model: "Acme R10",
      quantity: 2,
      unitCostEstimate: 100,
      notes: "spare",
    },
  });
  if (!r.hardwareDetails || r.hardwareDetails.quantity !== 2) {
    throw new Error(
      "Requirements invariant: valid hardware requirement did not retain hardwareDetails.",
    );
  }
  deleteRequirement(r.id);
}

function probeUrgencyValidation(): void {
  expectThrow("invalid urgency value", () =>
    saveRequirement({
      workItemId: "probe-wi",
      title: "Bad urgency",
      type: "functional",
      urgency: "extreme" as unknown as "low",
      moduleId: "module:probeu",
    }),
  );
}

function run(): void {
  withIsolatedStorage(() => {
    probeDraftRule();
    probeFreezeRule();
    probeHardwareValidation();
    probeUrgencyValidation();
    assertDocAllowListShape();
    // Cleanup any remaining probe entries so the snapshot restore is
    // a perfect no-op view of user data on restoration.
    for (const r of listRequirements()) {
      if (r.status !== "frozen") deleteRequirement(r.id);
    }
  });
}

run();

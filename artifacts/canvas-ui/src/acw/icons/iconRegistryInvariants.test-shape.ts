// ACW Phase 5 — icon registry build-time invariants.
//
// Negative-shape module: fails the bundle if the icon registry
// drifts toward branded / vendor naming, or if its entries lose
// the categorical-display-name discipline asserted at module load.
//
// What this module guards:
//   1. The vendor denylist is non-empty and names at least the
//      master prompt's well-known leakage candidates (Kubernetes,
//      Docker, AWS, React, Postgres). A future commit that empties
//      or trivialises the denylist fails here.
//   2. `assertNoVendorNamesInIconRegistry` actually rejects a
//      crafted entry that contains a denylisted vendor name. This
//      proves the guard is effective, not merely declared.
//   3. `assertNoVendorNamesInIconRegistry` accepts the live
//      registry (already verified at module load by the registry
//      itself; re-checked here so a regression is reported by this
//      module rather than by the registry's bare `throw`).
import {
  ACW_ICON_REGISTRY,
  ICON_REGISTRY_VENDOR_DENYLIST,
  assertNoVendorNamesInIconRegistry,
  type AcwIconEntry,
} from "./iconRegistry";
import { Box } from "lucide-react";

const PREFIX = "ACW Phase 5 icon-registry invariant violation";

if (ICON_REGISTRY_VENDOR_DENYLIST.length === 0) {
  throw new Error(`${PREFIX}: vendor denylist is empty.`);
}

// Spot-check a few well-known leakage candidates. Each must be
// present (case-insensitive) somewhere in the denylist; missing one
// proves the denylist regressed below the master prompt's baseline.
const REQUIRED_DENY_TERMS: readonly string[] = [
  "kubernetes",
  "docker",
  "aws",
  "react",
  "postgres",
];
{
  const lower = ICON_REGISTRY_VENDOR_DENYLIST.map((s) => s.toLowerCase());
  for (const term of REQUIRED_DENY_TERMS) {
    if (!lower.some((d) => d.indexOf(term) !== -1)) {
      throw new Error(
        `${PREFIX}: vendor denylist no longer contains the well-known term "${term}".`,
      );
    }
  }
}

// (2) The guard rejects a crafted branded entry. We try one
// representative term from each major denylist family.
for (const branded of ["Kubernetes orchestrator", "React frontend", "Postgres database"]) {
  const tampered: AcwIconEntry = { category: branded, displayName: branded, Icon: Box };
  let refused = false;
  try {
    assertNoVendorNamesInIconRegistry([tampered]);
  } catch {
    refused = true;
  }
  if (!refused) {
    throw new Error(
      `${PREFIX}: assertNoVendorNamesInIconRegistry accepted a branded category "${branded}".`,
    );
  }
}

// (3) The guard accepts the live registry. (The registry asserts
// the same thing at its own module load; re-running here keeps the
// failure attributable to *this* invariant module.)
assertNoVendorNamesInIconRegistry(ACW_ICON_REGISTRY);

// (4) Every live entry has a non-empty category, displayName, and
// Icon component. Catches the failure mode where a future refactor
// ships an entry with a missing field.
for (const entry of ACW_ICON_REGISTRY) {
  if (typeof entry.category !== "string" || entry.category.length === 0) {
    throw new Error(`${PREFIX}: entry has an empty category.`);
  }
  if (typeof entry.displayName !== "string" || entry.displayName.length === 0) {
    throw new Error(`${PREFIX}: entry "${entry.category}" has an empty displayName.`);
  }
  if (typeof entry.Icon !== "function" && typeof entry.Icon !== "object") {
    throw new Error(`${PREFIX}: entry "${entry.category}" has no Icon component.`);
  }
}

export function assertAcwIconRegistryInvariants(): void {
  if (ACW_ICON_REGISTRY.length === 0) {
    throw new Error(`${PREFIX}: icon registry is empty at runtime.`);
  }
}

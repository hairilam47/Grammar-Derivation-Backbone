// Architecture-attachment store — build-time invariants.
//
// File suffix `.test-shape.ts` mirrors the CTAD/ACW negative-shape
// pattern: this module's exports are predicates, not feature
// surface. Removing this file plus its side-effect import in
// `App.tsx` reverts Phase 2 to its pre-attachment shape.
//
// Asserts at module load:
//   1. The schema-version constant is exactly `"att-1.0"`.
//   2. A probe attach / detach round-trip closes the empty-binding
//      leak path: detaching the only link for a (architectureId,
//      adsId, adsVersion) triple removes the link entirely from the
//      document (no zero-link orphan).
//   3. `attachADC` is idempotent: re-attaching the same triple
//      returns the existing linkId.
//   4. Malformed identifiers are rejected.
//   5. Unknown architecture-id and unknown ADC-id are rejected
//      (existence checks fire when the skip flag is OFF).
//   6. Persisted document shape conforms to the allow-list:
//      top-level keys = { schemaVersion, links }; each link =
//      { linkId, architectureId, adsId, adsVersion, attachedAt }.
//
// The probe runs against the real localStorage key but snapshots
// and restores any pre-existing document so user data is never
// touched. Existence checks are bypassed during the round-trip
// probe via a documented test hook so the probe never depends on
// the presence of real CTAD architectures or portfolio entries.

import {
  ATTACHMENT_SCHEMA_VERSION,
  attachADC,
  detachADC,
  getAttachedADCs,
  getArchitecturesForADC,
  listAllLinks,
  __setSkipExistenceChecksForInvariantProbe,
} from "./architectureAttachmentStore";
import {
  createArchitecture,
  removeArchitecture,
} from "@/ctad/ctadStore";

const EXPECTED_SCHEMA_VERSION = "att-1.0";
const STORAGE_KEY = "adc.architecture-attachments.v1";
const CTAD_STORAGE_KEY = "ctad.state.v1";

if (ATTACHMENT_SCHEMA_VERSION !== EXPECTED_SCHEMA_VERSION) {
  throw new Error(
    `Architecture-attachment invariant: schema-version constant drifted. ` +
      `Expected "${EXPECTED_SCHEMA_VERSION}", got "${ATTACHMENT_SCHEMA_VERSION}". ` +
      `Bumping the schema requires a deterministic read-time migration.`,
  );
}

function withIsolatedStorage(probe: () => void): void {
  const hasWindow = typeof window !== "undefined" && !!window.localStorage;
  // Snapshot the attachment doc AND the CTAD doc so neither is disturbed.
  // The CTAD snapshot is needed because probeUnknownAdcRejection briefly
  // creates a temporary architecture to satisfy the architecture-existence
  // branch; restoring CTAD wholesale guarantees no leaked probe arch ever
  // ends up in user data, even if removeArchitecture were to fail.
  const priorAttach = hasWindow ? window.localStorage.getItem(STORAGE_KEY) : null;
  const priorCtad = hasWindow ? window.localStorage.getItem(CTAD_STORAGE_KEY) : null;
  if (hasWindow) window.localStorage.removeItem(STORAGE_KEY);
  try {
    probe();
  } finally {
    if (hasWindow) {
      if (priorAttach === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, priorAttach);
      if (priorCtad === null) window.localStorage.removeItem(CTAD_STORAGE_KEY);
      else window.localStorage.setItem(CTAD_STORAGE_KEY, priorCtad);
    }
  }
}

function assertDocAllowListShape(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return;
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const allowedTopLevel = new Set(["schemaVersion", "links"]);
  for (const k of Object.keys(doc)) {
    if (!allowedTopLevel.has(k)) {
      throw new Error(
        `Architecture-attachment invariant: persisted doc carries forbidden top-level key "${k}". ` +
          `Allow-list = { schemaVersion, links }.`,
      );
    }
  }
  const links = (doc.links ?? {}) as Record<string, Record<string, unknown>>;
  const allowedLinkKeys = new Set([
    "linkId",
    "architectureId",
    "adsId",
    "adsVersion",
    "attachedAt",
  ]);
  for (const [lid, link] of Object.entries(links)) {
    for (const k of Object.keys(link)) {
      if (!allowedLinkKeys.has(k)) {
        throw new Error(
          `Architecture-attachment invariant: link "${lid}" carries forbidden field "${k}". ` +
            `Allow-list = { linkId, architectureId, adsId, adsVersion, attachedAt }.`,
        );
      }
    }
  }
}

function probeRoundTrip(): void {
  const archA = "probe-arch-aaaa1111";
  const archB = "probe-arch-bbbb2222";
  const adsId = "probe-decision";
  const adsVersion = "0123abcd";

  // Empty start
  if (listAllLinks().length !== 0) {
    throw new Error(
      "Architecture-attachment invariant: isolated storage was not empty at probe start.",
    );
  }

  // Attach + idempotency
  const id1 = attachADC(archA, adsId, adsVersion);
  const id1Again = attachADC(archA, adsId, adsVersion);
  if (id1 !== id1Again) {
    throw new Error(
      "Architecture-attachment invariant: attachADC is not idempotent — " +
        `re-attaching produced a new linkId ("${id1}" vs "${id1Again}").`,
    );
  }

  // Many-to-many: a second architecture attaches independently.
  const id2 = attachADC(archB, adsId, adsVersion);
  if (id1 === id2) {
    throw new Error(
      "Architecture-attachment invariant: two architectures attaching to the same ADC must produce distinct linkIds.",
    );
  }

  const forADC = getArchitecturesForADC(adsId, adsVersion);
  if (forADC.length !== 2) {
    throw new Error(
      `Architecture-attachment invariant: getArchitecturesForADC returned ${forADC.length} links; expected 2.`,
    );
  }

  // Allow-list shape check on the persisted document.
  assertDocAllowListShape();

  // Detach archA: archB must still be present, and the link record
  // must be removed from the document (no zero-link leak per architecture).
  detachADC(id1);
  const remaining = getAttachedADCs(archA);
  if (remaining.length !== 0) {
    throw new Error(
      "Architecture-attachment invariant: detachADC left orphan links for architecture.",
    );
  }
  const remainingForADC = getArchitecturesForADC(adsId, adsVersion);
  if (remainingForADC.length !== 1 || remainingForADC[0].linkId !== id2) {
    throw new Error(
      "Architecture-attachment invariant: detaching one link affected unrelated links.",
    );
  }

  // Detach archB: document must collapse to zero links.
  detachADC(id2);
  if (listAllLinks().length !== 0) {
    throw new Error(
      "Architecture-attachment invariant: empty-leak rule failed — store retained links after every detach.",
    );
  }

  // Malformed-id rejection (format checks fire even with skip flag on).
  const malformed: ReadonlyArray<{ label: string; fn: () => unknown }> = [
    { label: "non-string architectureId", fn: () => attachADC(123 as unknown as string, adsId, adsVersion) },
    { label: "malformed architectureId", fn: () => attachADC("not-a-valid-arch-id", adsId, adsVersion) },
    { label: "empty adsId", fn: () => attachADC(archA, "", adsVersion) },
    { label: "non-hex adsVersion", fn: () => attachADC(archA, adsId, "ZZZZ") },
  ];
  for (const m of malformed) {
    let threw = false;
    try {
      m.fn();
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        `Architecture-attachment invariant: validator failed to reject "${m.label}".`,
      );
    }
  }
}

function expectThrowMatching(
  fn: () => unknown,
  needle: string,
  label: string,
): void {
  let caught: unknown = null;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  if (caught === null) {
    throw new Error(
      `Architecture-attachment invariant: ${label} did not throw.`,
    );
  }
  const msg = caught instanceof Error ? caught.message : String(caught);
  if (!msg.includes(needle)) {
    throw new Error(
      `Architecture-attachment invariant: ${label} threw, but message did not include "${needle}". ` +
        `Got: "${msg}".`,
    );
  }
}

function probeUnknownArchitectureRejection(): void {
  // Case (a): unknown architecture id, ADC tuple irrelevant — must throw on
  // the architecture branch with a message that proves the architecture
  // existence check executed.
  const synthArch = "probe-unknown-deadbeef";
  expectThrowMatching(
    () => attachADC(synthArch, "any-decision", "deadbeef"),
    "unknown architectureId",
    "attachADC with unknown architectureId",
  );
}

function probeUnknownAdcRejection(): void {
  // Case (b): valid architecture id (we briefly create one so the
  // architecture branch passes), but an unknown ADC tuple. The error
  // message must prove the ADC existence check executed.
  const tempArch = createArchitecture("__attachment-invariant-probe__");
  try {
    expectThrowMatching(
      () => attachADC(tempArch.architectureId, "probe-no-such-decision", "deadbeef"),
      "unknown ADC entry",
      "attachADC with unknown ADC tuple",
    );
  } finally {
    removeArchitecture(tempArch.architectureId);
  }
}

function run(): void {
  withIsolatedStorage(() => {
    __setSkipExistenceChecksForInvariantProbe(true);
    try {
      probeRoundTrip();
    } finally {
      __setSkipExistenceChecksForInvariantProbe(false);
    }
    probeUnknownArchitectureRejection();
    probeUnknownAdcRejection();
  });
}

run();

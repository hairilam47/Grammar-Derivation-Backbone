// CTAD architecture identity helpers (Phase 1).
//
// CTAD architecture workspaces are first-class explorations that
// exist independently of any frozen ADC decision. Each workspace
// carries:
//   - a stable, opaque, content-derived identifier
//     `<slug>-<8-hex>` where the slug is a lower-cased,
//     hyphen-collapsed projection of the user-supplied name and
//     the 8-hex suffix disambiguates name collisions.
//   - a display name (free text) carried separately for rendering.
//
// The id format is intentionally URL-safe (no encoding required by
// the wouter route `/ctad/arch/:architectureId`), opaque to ADC
// (no `adsId` / `adsVersion` leakage), and deterministic enough to
// be stable across reloads (ids are persisted; only generation is
// random).

const ID_SUFFIX_BYTES = 4;

export const ARCHITECTURE_ID_REGEX =
  /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{8}$/;

export function isValidArchitectureId(id: unknown): id is string {
  return typeof id === "string" && ARCHITECTURE_ID_REGEX.test(id);
}

export function slugifyArchitectureName(name: string): string {
  const lower = name.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9]+/g, "-");
  const trimmed = replaced.replace(/^-+|-+$/g, "");
  return trimmed.length === 0 ? "architecture" : trimmed;
}

function randomHexSuffix(): string {
  const bytes = new Uint8Array(ID_SUFFIX_BYTES);
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < ID_SUFFIX_BYTES; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function generateArchitectureId(name: string): string {
  const slug = slugifyArchitectureName(name);
  const id = `${slug}-${randomHexSuffix()}`;
  // Defence in depth: the regex guarantees the format; assert at
  // generation time so a future change to slugify can never produce
  // an id that fails our isValidArchitectureId scan downstream.
  if (!isValidArchitectureId(id)) {
    throw new Error(
      `Architecture id generator produced an invalid id "${id}". ` +
        `This is a programming error in slugifyArchitectureName.`,
    );
  }
  return id;
}

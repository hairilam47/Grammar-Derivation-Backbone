import { fnv1aHex } from "./hash";

// Logical decision identity, derived deterministically from the project name.
//
// Format: `ads-<slug>` where the slug is the project name lowercased,
// diacritics stripped, non-alphanumerics collapsed to hyphens, trimmed,
// and capped at 60 characters. When the project name normalises to an
// empty slug (e.g. only punctuation), an FNV-1a hex of the original name
// is used as the slug so the identity is still derivable and unique to
// that exact name.
//
// Two project names that share the same slug after normalisation will
// share the same adsId — by design. The portfolio treats that as the
// same logical decision lineage.
export function slugifyAdsId(projectName: string): string {
  const slug = projectName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (slug.length === 0) {
    return `ads-${fnv1aHex(projectName).toLowerCase()}`;
  }
  return `ads-${slug}`;
}

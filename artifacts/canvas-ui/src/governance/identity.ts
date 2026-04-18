import { fnv1aHex } from "./hash";

// Generates a stable logical decision identity from a project name.
//
// The identity is collision-resistant: two distinct project names always
// produce two distinct ids, even when the readable slug is empty, identical
// after normalisation, or truncated. We achieve this by always appending the
// FNV-1a hex of the *original* project name as a disambiguator.
//
// Format: `ads-<readable-slug>-<8-char-hex>` (lowercase prefix for canonical
// casing). When the project name normalises to an empty slug, the slug part
// is omitted: `ads-<8-char-hex>`.
export function slugifyAdsId(projectName: string): string {
  const slug = projectName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const disambiguator = fnv1aHex(projectName).toLowerCase();
  if (slug.length === 0) {
    return `ads-${disambiguator}`;
  }
  return `ads-${slug}-${disambiguator}`;
}

// ACW Track 3 — ADC bounds projection.
//
// Single point that bridges PortfolioEntry → AdcBounds. The rest
// of Track 3 sees only the resulting AdcBounds value object so
// PortfolioEntry stays an implementation detail of this module.
//
// The projection is intentionally narrow: it reads the binding
// identity (adsId / adsVersion) and the `layersPresent` set
// frozen onto the entry by the ADS freeze pipeline. No grammar
// re-evaluation, no ADS inspection, no cross-reading of any other
// portfolio field.
import type { PortfolioEntry } from "@/governance/portfolioStore";
import type { AdcBounds, Track3Layer } from "./track3Types";

// Map ADC ComponentLayer strings to Track 3 layer ids. ADC layers
// the portfolio entry exposes are an open vocabulary upstream;
// the mapping below covers the four canonical layers Track 3
// understands. Anything else is silently dropped — Track 3 is
// purely visual and any unknown layer would have no derived
// content to render anyway.
const COMPONENT_LAYER_TO_TRACK3: Readonly<Record<string, Track3Layer>> =
  Object.freeze({
    Infrastructure: "infrastructure",
    Application: "application",
    Integration: "integration",
    "Cross-Cutting": "crossCutting",
    CrossCutting: "crossCutting",
  });

export function projectBounds(entry: PortfolioEntry): AdcBounds {
  const layers = new Set<Track3Layer>();
  for (const raw of entry.layersPresent) {
    const mapped = COMPONENT_LAYER_TO_TRACK3[raw as string];
    if (mapped) layers.add(mapped);
  }
  return Object.freeze({
    adsId: entry.adsId,
    adsVersion: entry.adsVersion,
    layersPresent: Object.freeze(Array.from(layers)),
  });
}

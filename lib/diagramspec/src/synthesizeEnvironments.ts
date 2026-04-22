// DiagramSpec — deployment-view environment synthesis.
//
// Environments are not yet a first-class CTAD concept. For the
// `deployment` viewType we SYNTHESIZE them from the existing
// `infrastructure.deploymentTopology` and `infrastructure.hostingModel`
// parameters using a small deterministic decision table.
//
// TODO: replace once environments are first-class in CTAD
// (Task #77 promotes environments to a first-class CTAD section
// with explicit per-environment parameters; this module is the
// grep-anchor for that migration).

export interface SynthesizedEnvironment {
  readonly id: string;
  readonly label: string;
}

// Decision table:
//   topology + hostingModel  →  ordered environment list.
//
// Single-tier               → ["primary"]
// Multi-tier  / On-prem     → ["on-prem"]
// Multi-tier  / Private     → ["private-cloud"]
// Multi-tier  / Public      → ["public-cloud"]
// Multi-tier  / Hybrid      → ["on-prem", "public-cloud"]
// Distributed / On-prem     → ["on-prem-a", "on-prem-b"]
// Distributed / Private     → ["private-cloud-a", "private-cloud-b"]
// Distributed / Public      → ["public-cloud-a", "public-cloud-b"]
// Distributed / Hybrid      → ["on-prem", "private-cloud", "public-cloud"]
//
// Anything outside this table (null inputs, unknown options)
// degrades to a single "default" environment so the synthesis is
// total. The renderer is allowed to draw zero-environment views;
// the compiler does not assume otherwise.
export function synthesizeEnvironments(
  deploymentTopology: string | null,
  hostingModel: string | null,
): readonly SynthesizedEnvironment[] {
  if (deploymentTopology === null && hostingModel === null) {
    return Object.freeze([]);
  }
  const env = (id: string, label: string): SynthesizedEnvironment =>
    Object.freeze({ id, label });
  const tag = `${deploymentTopology ?? "?"}|${hostingModel ?? "?"}`;
  switch (tag) {
    case "Single-tier|On-prem":
    case "Single-tier|Private":
    case "Single-tier|Public":
    case "Single-tier|Hybrid":
    case "Single-tier|?":
      return Object.freeze([env("env:primary", "Primary")]);
    case "Multi-tier|On-prem":
      return Object.freeze([env("env:on-prem", "On-Premise")]);
    case "Multi-tier|Private":
      return Object.freeze([env("env:private-cloud", "Private Cloud")]);
    case "Multi-tier|Public":
      return Object.freeze([env("env:public-cloud", "Public Cloud")]);
    case "Multi-tier|Hybrid":
      return Object.freeze([
        env("env:on-prem", "On-Premise"),
        env("env:public-cloud", "Public Cloud"),
      ]);
    case "Distributed|On-prem":
      return Object.freeze([
        env("env:on-prem-a", "On-Premise A"),
        env("env:on-prem-b", "On-Premise B"),
      ]);
    case "Distributed|Private":
      return Object.freeze([
        env("env:private-cloud-a", "Private Cloud A"),
        env("env:private-cloud-b", "Private Cloud B"),
      ]);
    case "Distributed|Public":
      return Object.freeze([
        env("env:public-cloud-a", "Public Cloud A"),
        env("env:public-cloud-b", "Public Cloud B"),
      ]);
    case "Distributed|Hybrid":
      return Object.freeze([
        env("env:on-prem", "On-Premise"),
        env("env:private-cloud", "Private Cloud"),
        env("env:public-cloud", "Public Cloud"),
      ]);
    default:
      return Object.freeze([env("env:default", "Default")]);
  }
}

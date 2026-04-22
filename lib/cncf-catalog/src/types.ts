// CNCF reference catalog — type contracts.
//
// The catalog is a frozen, build-time constant array of curated
// CNCF projects. Each card carries a maturity label, a category
// classification, a short attributable description, and an
// optional list of binding hints that map the project onto CTAD
// parameter ids.
//
// BindingHint is a discriminated union with three shapes:
//   - "sets":       proposes a value for a single-kind parameter.
//   - "constrains": narrows the permitted option set for a param
//                   to the listed subset.
//   - "justifies":  attaches a short rationale to a param without
//                   changing its value or its allowed options.
//
// The catalog is bundled, never fetched. paramId / option strings
// are validated against the consumer's CTAD registry at module
// load by the consuming application; this package itself has no
// dependency on CTAD and emits only the data + types.

export type CncfMaturity = "graduated" | "incubating" | "sandbox";

export type CncfCategory =
  | "Orchestration"
  | "Observability"
  | "Networking"
  | "Security"
  | "Storage"
  | "Database"
  | "Messaging"
  | "Serverless"
  | "Developer Tools";

export type BindingHint =
  | {
      readonly kind: "sets";
      readonly paramId: string;
      readonly value: string;
    }
  | {
      readonly kind: "constrains";
      readonly paramId: string;
      readonly allowedOptions: readonly string[];
    }
  | {
      readonly kind: "justifies";
      readonly paramId: string;
      readonly rationale: string;
    };

export interface CncfCard {
  readonly id: string;
  readonly name: string;
  readonly category: CncfCategory;
  readonly subcategory: string;
  readonly maturity: CncfMaturity;
  readonly description: string;
  readonly bindingHints: readonly BindingHint[];
}

// CNCF binding-hint engine — READ-ONLY surface.
//
// This module is the boundary between the frozen CNCF catalog and
// the CTAD store. It deliberately does not import any write-side
// CTAD APIs (no setCtadParam, no addContribution, no
// recordAppliedCard). All it does is:
//
//   - compute a deterministic, side-effect-free preview of what
//     applying a card would do, given the current binding state;
//   - report which paramIds in a card's hints belong to which
//     CTAD section, for the per-section "Relevant cards" panel.
//
// The side-effecting `applyCard` / `removeAppliedCard` /
// `getActiveJustifications` / `contributingCardIds` operations live
// in @/ctad/cncfApplyService — outside the @/cncf isolation
// boundary — so the CTAD store retains exclusive ownership of all
// state mutation.

import type { CncfCard } from "./cncfTypes";
import {
  findParam,
  findSectionForParam,
  type CtadSectionId,
} from "@/ctad/ctadRegistry";
import {
  getCtadParam,
  type CtadBinding,
  type CtadParamValue,
} from "@/ctad/ctadStore";
import { getActiveAllowedOptions } from "@/ctad/ctadConstraintsStore";

export interface PreviewSetEffect {
  readonly paramId: string;
  readonly before: CtadParamValue;
  readonly after: CtadParamValue;
}
export interface PreviewConstrainEffect {
  readonly paramId: string;
  readonly addsAllowedOptions: readonly string[];
  readonly newActiveAllowedOptions: readonly string[];
}
export interface PreviewJustifyEffect {
  readonly paramId: string;
  readonly rationale: string;
}
export interface PreviewConflict {
  readonly paramId: string;
  readonly reason: string;
}

export interface CardApplicationPreview {
  readonly cardId: string;
  readonly setEffects: readonly PreviewSetEffect[];
  readonly constraintEffects: readonly PreviewConstrainEffect[];
  readonly justifyEffects: readonly PreviewJustifyEffect[];
  readonly conflicts: readonly PreviewConflict[];
}

// Pure: never writes. Computes the diff that applying `card` to
// the current binding would produce, plus any conflicts.
export function previewCardApplication(
  binding: CtadBinding,
  card: CncfCard,
): CardApplicationPreview {
  const setEffects: PreviewSetEffect[] = [];
  const constraintEffects: PreviewConstrainEffect[] = [];
  const justifyEffects: PreviewJustifyEffect[] = [];
  const conflicts: PreviewConflict[] = [];

  // Pre-compute the post-apply active allowed-option set per
  // paramId by simulating the constraint additions in memory.
  // This lets us validate `sets` hints against the post-apply
  // constraint state rather than the pre-apply state.
  const simulatedConstraints = new Map<string, string[]>();
  for (const hint of card.bindingHints) {
    if (hint.kind !== "constrains") continue;
    const param = findParam(hint.paramId);
    if (!param) {
      conflicts.push({
        paramId: hint.paramId,
        reason: `Unknown parameter id "${hint.paramId}".`,
      });
      continue;
    }
    const currentActive =
      getActiveAllowedOptions(binding, hint.paramId) ?? [...param.options];
    const allow = new Set(hint.allowedOptions);
    const post = currentActive.filter((opt) => allow.has(opt));
    simulatedConstraints.set(hint.paramId, post);
    constraintEffects.push({
      paramId: hint.paramId,
      addsAllowedOptions: hint.allowedOptions,
      newActiveAllowedOptions: post,
    });
    if (post.length === 0) {
      conflicts.push({
        paramId: hint.paramId,
        reason: `Adding this constraint would empty the permitted option set for "${hint.paramId}".`,
      });
    }
  }

  for (const hint of card.bindingHints) {
    if (hint.kind === "sets") {
      const param = findParam(hint.paramId);
      if (!param) {
        conflicts.push({
          paramId: hint.paramId,
          reason: `Unknown parameter id "${hint.paramId}".`,
        });
        continue;
      }
      const postActive =
        simulatedConstraints.get(hint.paramId) ??
        getActiveAllowedOptions(binding, hint.paramId) ??
        [...param.options];
      if (!postActive.includes(hint.value)) {
        conflicts.push({
          paramId: hint.paramId,
          reason: `Setting "${hint.paramId}" to "${hint.value}" is incompatible with the active constraint set (${postActive.length === 0 ? "empty" : postActive.join(", ")}).`,
        });
        continue;
      }
      const before = getCtadParam(binding, hint.paramId);
      setEffects.push({
        paramId: hint.paramId,
        before,
        after: hint.value,
      });
    } else if (hint.kind === "justifies") {
      justifyEffects.push({
        paramId: hint.paramId,
        rationale: hint.rationale,
      });
    }
    // "constrains" handled above in the simulation pass.
  }

  return {
    cardId: card.id,
    setEffects,
    constraintEffects,
    justifyEffects,
    conflicts,
  };
}

// Section relevance pass-through, re-exported for the UI panel.
export function paramIdsBySection(
  card: CncfCard,
): Readonly<Record<CtadSectionId, readonly string[]>> {
  const out: Record<CtadSectionId, string[]> = {
    infrastructure: [],
    application: [],
    integration: [],
    crossCutting: [],
    ops: [],
  };
  for (const hint of card.bindingHints) {
    const sec = findSectionForParam(hint.paramId);
    if (!sec) continue;
    out[sec].push(hint.paramId);
  }
  return out;
}

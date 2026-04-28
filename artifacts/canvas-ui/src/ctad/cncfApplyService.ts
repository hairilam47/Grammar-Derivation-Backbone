// CNCF apply service.
//
// This module owns the side-effecting half of the CNCF binding
// flow. It lives in @/ctad (not @/cncf) so that the CNCF module
// surface stays read-only with respect to the CTAD store, and
// the CTAD store retains exclusive ownership of all writes.
//
// Write order on apply:
//   1. constraints store
//   2. value store (set effects, validated against post-apply constraints)
//   3. applied-cards audit log
//
// Write order on remove (inverse):
//   1. applied-cards audit log
//   2. value store (restore `before` only when current still equals
//      `after`; do not stomp on a user-edited value)
//   3. constraints store

import type { CncfCard } from "@/cncf/cncfTypes";
import { previewCardApplication } from "@/cncf/cncfBindingEngine";
import {
  getBindingDoc,
  getCtadParam,
  setCtadParam,
  type CtadBinding,
  type CtadParamValue,
} from "./ctadStore";
import {
  addContribution,
  getContributions,
  removeCardContributions,
} from "./ctadConstraintsStore";
import {
  getAppliedCardsForBinding,
  getAppliedEntry,
  isCardApplied,
  recordAppliedCard,
  removeAppliedCardEntry,
  type AppliedCardEntry,
} from "./ctadAppliedCardsStore";

// Optional `now` is an additive seed-affordance: when absent the
// routine behaves exactly as before. The dev-only `/seed-all` route
// supplies it so re-running the seed produces a byte-identical
// localStorage snapshot for `ctad.applied-cards.v1` and the
// constraints store. When supplied it must be a valid ISO-8601 string.
export function applyCard(
  binding: CtadBinding,
  card: CncfCard,
  opts?: { readonly now?: string },
): AppliedCardEntry {
  if (isCardApplied(binding, card.id)) {
    throw new Error(
      `cncfApplyService: card "${card.id}" is already applied to this binding. Remove it first.`,
    );
  }
  const preview = previewCardApplication(binding, card);
  if (preview.conflicts.length > 0) {
    throw new Error(
      `cncfApplyService: cannot apply card "${card.id}" — ${preview.conflicts.length} conflict(s): ${preview.conflicts.map((c) => c.reason).join("; ")}`,
    );
  }
  let appliedAt: string;
  if (opts?.now !== undefined) {
    if (typeof opts.now !== "string" || Number.isNaN(Date.parse(opts.now))) {
      throw new Error(
        `cncfApplyService: caller-supplied "now" must be a valid ISO timestamp.`,
      );
    }
    appliedAt = opts.now;
  } else {
    appliedAt = new Date().toISOString();
  }

  for (const eff of preview.constraintEffects) {
    addContribution(binding, eff.paramId, {
      cardId: card.id,
      allowedOptions: eff.addsAllowedOptions,
      appliedAt,
    });
  }
  for (const eff of preview.setEffects) {
    setCtadParam(binding, eff.paramId, eff.after);
  }
  const entry: AppliedCardEntry = {
    cardId: card.id,
    appliedAt,
    sets: preview.setEffects.map((e) => ({
      paramId: e.paramId,
      before: e.before,
      after: e.after,
    })),
    constrains: preview.constraintEffects.map((e) => ({
      paramId: e.paramId,
      allowedOptions: e.addsAllowedOptions,
    })),
    justifies: preview.justifyEffects.map((e) => ({
      paramId: e.paramId,
      rationale: e.rationale,
    })),
  };
  recordAppliedCard(binding, entry);
  return entry;
}

export function removeAppliedCard(
  binding: CtadBinding,
  cardId: string,
): boolean {
  const entry = getAppliedEntry(binding, cardId);
  if (!entry) return false;

  removeAppliedCardEntry(binding, cardId);

  for (const eff of entry.sets) {
    const current = getCtadParam(binding, eff.paramId);
    if (paramValueEquals(current, eff.after)) {
      setCtadParam(binding, eff.paramId, eff.before);
    }
  }

  removeCardContributions(binding, cardId);
  return true;
}

function paramValueEquals(a: CtadParamValue, b: CtadParamValue): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

export function getActiveJustifications(
  binding: CtadBinding,
  paramId: string,
): readonly { readonly cardId: string; readonly rationale: string }[] {
  const out: { cardId: string; rationale: string }[] = [];
  for (const e of getAppliedCardsForBinding(binding)) {
    for (const j of e.justifies) {
      if (j.paramId === paramId) {
        out.push({ cardId: e.cardId, rationale: j.rationale });
      }
    }
  }
  return out;
}

export function contributingCardIds(
  binding: CtadBinding,
  paramId: string,
): readonly string[] {
  return getContributions(binding, paramId).map((c) => c.cardId);
}

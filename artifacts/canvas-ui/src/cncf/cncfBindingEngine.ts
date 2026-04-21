// CNCF binding-hint engine.
//
// Pure helpers that translate a CNCF card's binding hints into:
//   (a) a deterministic preview of what applying the card would
//       do to a CTAD binding, including any conflicts with
//       previously-applied constraints; and
//   (b) the side-effecting `applyCard` / `removeAppliedCard`
//       routines that mutate the value store, the constraints
//       store, and the applied-cards audit log.
//
// `previewCardApplication` writes nothing. It is safe to invoke
// from a render path (e.g. inside the preview-before-commit
// modal) without any cleanup.
//
// `applyCard` writes in this order:
//   1. constraints store (so set effects are validated against
//      the post-apply constraint state, not the pre-apply state)
//   2. value store (set effects)
//   3. applied-cards audit log
//
// `removeAppliedCard` writes in inverse order:
//   1. applied-cards audit log
//   2. value store (restore `before` only if the current value
//      still equals `after`; if the user has already changed it,
//      do not clobber the user's choice)
//   3. constraints store

import type { CncfCard } from "./cncfTypes";
import {
  findParam,
  findSectionForParam,
  type CtadSectionId,
} from "@/ctad/ctadRegistry";
import {
  getBindingDoc,
  getCtadParam,
  setCtadParam,
  type CtadBinding,
  type CtadParamValue,
} from "@/ctad/ctadStore";
import {
  addContribution,
  getActiveAllowedOptions,
  getContributions,
  removeCardContributions,
} from "@/ctad/ctadConstraintsStore";
import {
  getAppliedEntry,
  isCardApplied,
  recordAppliedCard,
  removeAppliedCardEntry,
  type AppliedCardEntry,
} from "@/ctad/ctadAppliedCardsStore";

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
    // Existing active allowed (or the full registry option list
    // if no contributions exist yet).
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
      // Validate against the simulated post-apply constraint set
      // if this card also constrains this param; otherwise the
      // current active set; otherwise the full option list.
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

// Side-effecting. Returns the AppliedCardEntry that was
// recorded. Throws if the card is already applied (caller should
// remove it first) or if the preview reports any conflict.
export function applyCard(
  binding: CtadBinding,
  card: CncfCard,
): AppliedCardEntry {
  if (isCardApplied(binding, card.id)) {
    throw new Error(
      `CNCF engine: card "${card.id}" is already applied to this binding. Remove it first.`,
    );
  }
  const preview = previewCardApplication(binding, card);
  if (preview.conflicts.length > 0) {
    throw new Error(
      `CNCF engine: cannot apply card "${card.id}" — ${preview.conflicts.length} conflict(s): ${preview.conflicts.map((c) => c.reason).join("; ")}`,
    );
  }
  const appliedAt = new Date().toISOString();

  // (1) Constraints first.
  for (const eff of preview.constraintEffects) {
    addContribution(binding, eff.paramId, {
      cardId: card.id,
      allowedOptions: eff.addsAllowedOptions,
      appliedAt,
    });
  }
  // (2) Value sets next (now validated against post-apply constraints).
  for (const eff of preview.setEffects) {
    setCtadParam(binding, eff.paramId, eff.after);
  }
  // (3) Audit log.
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

// Side-effecting. Removes a previously-applied card. Restores
// `before` values for each set effect ONLY IF the current value
// still equals `after`; otherwise leaves the user's manual choice
// alone. Always removes the constraint contributions and the
// audit entry.
export function removeAppliedCard(
  binding: CtadBinding,
  cardId: string,
): boolean {
  const entry = getAppliedEntry(binding, cardId);
  if (!entry) return false;

  // (1) Audit entry first so re-entrant subscribers see the
  // applied-cards list shrink before the value/constraint changes
  // ripple through.
  removeAppliedCardEntry(binding, cardId);

  // (2) Restore set effects, but only when the current value
  // still equals what we set.
  for (const eff of entry.sets) {
    const current = getCtadParam(binding, eff.paramId);
    if (paramValueEquals(current, eff.after)) {
      setCtadParam(binding, eff.paramId, eff.before);
    }
  }

  // (3) Remove constraint contributions for this card.
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

// Helper: inspect the active justifications for a param across
// all currently-applied cards. Used by the parameter-row UI to
// show "Why this option set is constrained" tooltips.
export function getActiveJustifications(
  binding: CtadBinding,
  paramId: string,
): readonly { readonly cardId: string; readonly rationale: string }[] {
  const doc = getBindingDoc(binding);
  void doc; // touch to participate in the value-store version surface
  const out: { cardId: string; rationale: string }[] = [];
  // Iterate the audit log directly so we capture every justify
  // effect from every applied card, in insertion order.
  // (Imported lazily to avoid a circular surface from this helper
  // back into the audit module's typings.)
  const entries = getAppliedCardsForBindingLocal(binding);
  for (const e of entries) {
    for (const j of e.justifies) {
      if (j.paramId === paramId) {
        out.push({ cardId: e.cardId, rationale: j.rationale });
      }
    }
  }
  return out;
}

function getAppliedCardsForBindingLocal(b: CtadBinding) {
  // Re-import via the module surface (TS treats the local require
  // as side-effect-free re-export). We use a normal import at the
  // top of the file and call it here for clarity.
  return _getAppliedCardsForBinding(b);
}

import { getAppliedCardsForBinding as _getAppliedCardsForBinding } from "@/ctad/ctadAppliedCardsStore";

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

// Contribution preview for the parameter-row "constraint badge"
// UI: returns the set of contributing card ids for a paramId,
// derived from the live constraint store.
export function contributingCardIds(
  binding: CtadBinding,
  paramId: string,
): readonly string[] {
  return getContributions(binding, paramId).map((c) => c.cardId);
}

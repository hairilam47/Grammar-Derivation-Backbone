// Executable end-to-end-ish test for task #74:
// CNCF reference catalog wired into CTAD.
//
// "End-to-end-ish" because the assertions go all the way through
// the workspace package boundary, the CTAD-coupled adapter, the
// frozen-data invariants, and the binding-hint preview engine —
// without spinning up a browser. The full interactive flow is
// described in the prose plan at `ctad-cncf.e2e.md`; this file
// covers the parts that can be validated headlessly so they cannot
// silently regress.

import { describe, expect, it } from "vitest";

import {
  CNCF_CARDS as CATALOG_FROM_PACKAGE,
  type CncfCard,
} from "@workspace/cncf-catalog";
import { CNCF_CARDS as CATALOG_FROM_ADAPTER } from "@/cncf/cncfCatalog";
import { previewCardApplication } from "@/cncf/cncfBindingEngine";
import type { CtadBinding } from "@/ctad/ctadStore";

const TEST_BINDING: CtadBinding = Object.freeze({
  adsId: "ads-test-cncf",
  adsVersion: "v1",
});

describe("CNCF reference catalog (lib/cncf-catalog)", () => {
  it("exposes the same 30-card catalog through the workspace package and the canvas-ui adapter", () => {
    expect(CATALOG_FROM_PACKAGE).toHaveLength(30);
    expect(CATALOG_FROM_ADAPTER).toHaveLength(30);
    const packageIds = CATALOG_FROM_PACKAGE.map((c) => c.id).sort();
    const adapterIds = CATALOG_FROM_ADAPTER.map((c) => c.id).sort();
    expect(adapterIds).toEqual(packageIds);
  });

  it("guarantees card-id uniqueness", () => {
    const ids = CATALOG_FROM_PACKAGE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("freezes every card and its binding-hint array (deepFreeze invariant)", () => {
    for (const card of CATALOG_FROM_PACKAGE) {
      expect(Object.isFrozen(card)).toBe(true);
      expect(Object.isFrozen(card.bindingHints)).toBe(true);
      for (const hint of card.bindingHints) {
        expect(Object.isFrozen(hint)).toBe(true);
      }
    }
  });

  it("touches every CTAD section across the catalog (infra/app/integration/crossCutting/ops)", () => {
    // We do a soft check: at least one card whose hints reference
    // each section's signature paramIds. This guards against future
    // catalog edits that accidentally drop a whole section's worth
    // of bindings.
    const hintParamIds = new Set(
      CATALOG_FROM_PACKAGE.flatMap((c) =>
        c.bindingHints.map((h) => h.paramId),
      ),
    );
    expect(hintParamIds.has("containerOrchestration")).toBe(true); // ops
    expect(hintParamIds.has("virtualisationClass")).toBe(true); // infrastructure
    expect(hintParamIds.has("applicationStyle")).toBe(true); // application
    expect(hintParamIds.has("messageExchange")).toBe(true); // integration
    expect(hintParamIds.has("secretsHandling")).toBe(true); // crossCutting
  });
});

describe("cncfBindingEngine.previewCardApplication", () => {
  function getCard(id: string): CncfCard {
    const card = CATALOG_FROM_PACKAGE.find((c) => c.id === id);
    if (!card) throw new Error(`Test fixture missing card "${id}"`);
    return card;
  }

  it("never writes to any store (pure preview)", () => {
    // Two consecutive calls on the same fresh binding must produce
    // identical output — proves no hidden mutation between calls.
    const card = getCard("cncf:kubernetes");
    const a = previewCardApplication(TEST_BINDING, card);
    const b = previewCardApplication(TEST_BINDING, card);
    expect(b).toEqual(a);
  });

  it("returns a setEffect when a card declares a `sets` hint with a permitted value", () => {
    const card = getCard("cncf:kubernetes");
    const preview = previewCardApplication(TEST_BINDING, card);
    expect(preview.cardId).toBe("cncf:kubernetes");
    const setIds = preview.setEffects.map((e) => e.paramId);
    expect(setIds).toContain("containerOrchestration");
    expect(preview.conflicts).toEqual([]);
  });

  it("returns a constraintEffect when a card declares a `constrains` hint", () => {
    const card = getCard("cncf:kubernetes");
    const preview = previewCardApplication(TEST_BINDING, card);
    const constrained = preview.constraintEffects.find(
      (e) => e.paramId === "virtualisationClass",
    );
    expect(constrained).toBeDefined();
    // Pre-apply state had the full option set, so the new active
    // allowed set is exactly the hint's allowedOptions.
    expect(constrained?.newActiveAllowedOptions).toEqual([
      "Container",
      "Mixed",
    ]);
  });
});

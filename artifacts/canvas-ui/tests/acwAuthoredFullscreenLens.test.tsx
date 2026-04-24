// Task #86 — render-level coverage for authored ACW lenses
// (System Landscape, Deployment & Infrastructure) running under
// the new fullscreen + floating-overlay pattern.
//
// These tests render each lens component into a jsdom DOM and
// verify three things per lens:
//
//   1. Branch swap. With the persisted `isFullscreen` flag set to
//      `true`, the lens mounts the floating overlay quadrants
//      (identified via the lens-specific `testIdPrefix`) and the
//      "Exit full-screen" control. Toggling the same flag to
//      `false` causes the lens to switch to the inline branch,
//      which exposes the "Enter full-page canvas" header button
//      and removes the overlay.
//
//   2. Escape toggles fullscreen. Dispatching a non-suppressed
//      Escape KeyboardEvent on `document` flips `isFullscreen` in
//      the persisted store and re-renders the opposite branch.
//
//   3. Escape suppression inside editable targets. Dispatching an
//      Escape event whose `target` is a `<textarea>` (or any
//      contentEditable element) must NOT toggle `isFullscreen` —
//      this protects future text-editing affordances inside the
//      lens from accidentally collapsing the canvas while the user
//      is mid-keystroke.
//
// Heavy dependencies (`LensCanvas`, the bound `AuthoringPanel`
// dropdowns, the `LiveStructurePanel` tree) are left un-mocked:
// the lens views are the system-under-test and stubbing them out
// would defeat the purpose of a render-level branch-swap probe.
// The full ACW workspace store is reset between tests via
// `clearWorkspace()`, and the workspace-viewprefs store is reset
// by clearing its localStorage key.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import SystemLandscape from "../src/pages/acw/views/SystemLandscape";
import Deployment from "../src/pages/acw/views/Deployment";
import { clearWorkspace } from "../src/acw/acwStore";
import {
  clearAllPrefs,
  setLensFullscreen,
  getLensPrefs,
} from "../src/acw/acwWorkspaceViewPrefs";

// --- helpers ----------------------------------------------------

interface LensFixture {
  readonly name: string;
  readonly path: string;
  readonly Component: () => JSX.Element;
  readonly overlayTestId: string;
  readonly exitButtonTestId: string;
  readonly enterButtonLabel: string;
}

const LENSES: ReadonlyArray<LensFixture> = [
  {
    name: "System Landscape",
    path: "/workspace/landscape",
    Component: SystemLandscape,
    overlayTestId: "acw-landscape-overlay-topleft",
    exitButtonTestId: "acw-landscape-overlay-exit-fullscreen",
    enterButtonLabel: "Enter full-page canvas",
  },
  {
    name: "Deployment & Infrastructure",
    path: "/workspace/deployment",
    Component: Deployment,
    overlayTestId: "acw-deployment-overlay-topleft",
    exitButtonTestId: "acw-deployment-overlay-exit-fullscreen",
    enterButtonLabel: "Enter full-page canvas",
  },
];

interface Mounted {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
}

function mountLens(fixture: LensFixture): Mounted {
  const { hook } = memoryLocation({ path: fixture.path });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Router hook={hook}>
        <fixture.Component />
      </Router>,
    );
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function findEnterButton(
  container: HTMLElement,
  label: string,
): HTMLButtonElement | null {
  const buttons = Array.from(container.querySelectorAll("button"));
  return (
    (buttons.find((b) => (b.textContent ?? "").trim().includes(label)) as
      | HTMLButtonElement
      | undefined) ?? null
  );
}

// --- lifecycle --------------------------------------------------

beforeEach(() => {
  clearWorkspace();
  clearAllPrefs();
});

afterEach(() => {
  clearWorkspace();
  clearAllPrefs();
});

// --- tests ------------------------------------------------------

describe.each(LENSES)("authored ACW lens — $name", (fixture) => {
  it("renders the floating overlay branch when fullscreen is on, and the inline branch when off", () => {
    // Seed the prefs store explicitly to TRUE so this test does
    // not rely on the (currently `true`) default — it documents
    // the contract instead.
    setLensFullscreen(fixture.path, true);
    const m = mountLens(fixture);
    try {
      // Fullscreen branch: overlay quadrant + exit button must
      // both be in the DOM.
      expect(
        m.container.querySelector(`[data-testid="${fixture.overlayTestId}"]`),
      ).not.toBeNull();
      expect(
        m.container.querySelector(
          `[data-testid="${fixture.exitButtonTestId}"]`,
        ),
      ).not.toBeNull();
      // The inline-only "Enter full-page canvas" header button
      // must NOT be present in the fullscreen branch.
      expect(findEnterButton(m.container, fixture.enterButtonLabel)).toBeNull();

      // Flip the persisted flag to off and re-assert the swap.
      act(() => {
        setLensFullscreen(fixture.path, false);
      });
      expect(
        m.container.querySelector(`[data-testid="${fixture.overlayTestId}"]`),
      ).toBeNull();
      expect(
        m.container.querySelector(
          `[data-testid="${fixture.exitButtonTestId}"]`,
        ),
      ).toBeNull();
      // Inline branch exposes the "Enter full-page canvas" header
      // button.
      expect(
        findEnterButton(m.container, fixture.enterButtonLabel),
      ).not.toBeNull();
    } finally {
      m.unmount();
    }
  });

  it("toggles fullscreen when Escape is pressed on a non-editable target", () => {
    setLensFullscreen(fixture.path, true);
    const m = mountLens(fixture);
    try {
      expect(getLensPrefs(fixture.path).isFullscreen).toBe(true);
      // Escape on `document.body` (a non-editable target) must
      // toggle the prefs flag.
      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      expect(getLensPrefs(fixture.path).isFullscreen).toBe(false);
      // And the inline branch must now be rendered.
      expect(
        findEnterButton(m.container, fixture.enterButtonLabel),
      ).not.toBeNull();
    } finally {
      m.unmount();
    }
  });

  it("does NOT toggle fullscreen when Escape is pressed inside a textarea", () => {
    setLensFullscreen(fixture.path, true);
    const m = mountLens(fixture);
    try {
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      try {
        textarea.focus();
        expect(getLensPrefs(fixture.path).isFullscreen).toBe(true);
        // Dispatch Escape with `target = textarea`. The lens'
        // editable-target suppression must ignore this event.
        act(() => {
          textarea.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
        });
        expect(getLensPrefs(fixture.path).isFullscreen).toBe(true);
        // Overlay still mounted.
        expect(
          m.container.querySelector(
            `[data-testid="${fixture.overlayTestId}"]`,
          ),
        ).not.toBeNull();
      } finally {
        textarea.remove();
      }
    } finally {
      m.unmount();
    }
  });
});

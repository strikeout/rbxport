/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { __setBackend } from "@/ipc/client";
import type { Backend } from "@/ipc/types";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { PreferencesProvider } from "@/store/usePreferences";
import { MixerStrip } from "./MixerStrip";

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean; }

let host: HTMLDivElement;
let root: Root;
const setChannelKill = vi.fn(async () => {});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  setChannelKill.mockClear();
  __setBackend({ setChannelKill, setCrossfade: async () => {}, setChannelTrim: async () => {} } as unknown as Backend);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(
    <PreferencesProvider value={{ preferences: DEFAULT_PREFERENCES, update: vi.fn(), reset: vi.fn() }}>
      <MixerStrip />
    </PreferencesProvider>,
  ));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  __setBackend(null);
});

/** The kill buttons in the order the strip draws them: deck A's, then deck B's. */
function kills(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
}

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })); });
}

it("toggles each deck's kills from its own keys", async () => {
  const [aHigh, aMid, aLow, bHigh, bMid, bLow] = kills();
  press("y");
  expect(aLow?.getAttribute("aria-pressed")).toBe("true");
  press("w");
  expect(bHigh?.getAttribute("aria-pressed")).toBe("true");
  press("y");
  expect(aLow?.getAttribute("aria-pressed")).toBe("false");
  for (const button of [aHigh, aMid, bMid, bLow]) expect(button?.getAttribute("aria-pressed")).toBe("false");
  await act(async () => {});
  expect(setChannelKill).toHaveBeenCalledWith("a", "low", true);
  expect(setChannelKill).toHaveBeenCalledWith("b", "high", true);
  expect(setChannelKill).toHaveBeenCalledWith("a", "low", false);
});

it("toggles once for a held key", () => {
  press("a");
  press("a", { repeat: true });
  expect(kills()[1]?.getAttribute("aria-pressed")).toBe("true");
});

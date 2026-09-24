// @vitest-environment jsdom
/**
 * Language switching in a DOM: text re-renders immediately, the document direction follows
 * the language, and the chosen language is persisted and restored after a restart.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useTranslation } from "react-i18next";

// In-memory stand-in for the workspace settings.json and the app-level pointer file.
const disk = vi.hoisted(() => ({ settings: {} as Record<string, unknown>, ui: {} as Record<string, unknown> }));
vi.mock("@/platform/tauri", () => ({
  settingsApi: {
    read: vi.fn(async () => JSON.parse(JSON.stringify(disk.settings)) as Record<string, unknown>),
    write: vi.fn(async (s: Record<string, unknown>) => {
      disk.settings = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    }),
  },
  pointerApi: {
    read: vi.fn(async () => ({ current: null, recent: [], ui: disk.ui })),
    setUi: vi.fn(async (ui: Record<string, unknown>) => {
      disk.ui = { ...disk.ui, ...ui };
    }),
  },
  logApi: { write: vi.fn(async () => undefined) },
}));

import i18n, { applyLanguage } from "@/i18n";
import { useSettings } from "@/app/settings";

function Probe({ k }: { k: string }) {
  const { t } = useTranslation();
  return React.createElement("span", { "data-testid": "probe" }, t(k));
}

afterEach(() => cleanup());

describe("language switching in the UI", () => {
  it("re-renders text and flips the document direction immediately", async () => {
    await act(async () => applyLanguage("ar"));
    render(React.createElement(Probe, { k: "nav.dashboard" }));
    expect(screen.getByTestId("probe").textContent).toBe("لوحة التحكم");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");

    await act(async () => applyLanguage("en"));
    expect(screen.getByTestId("probe").textContent).toBe("Dashboard");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");

    await act(async () => applyLanguage("ar"));
    expect(screen.getByTestId("probe").textContent).toBe("لوحة التحكم");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("renders readable text instead of a raw key when a translation is missing", async () => {
    await act(async () => applyLanguage("en"));
    render(React.createElement(Probe, { k: "settings.someUnknownOption" }));
    const text = screen.getByTestId("probe").textContent ?? "";
    expect(text).toBe("Some unknown option");
    expect(text).not.toMatch(/^[a-z]+\.[A-Za-z.]+$/);
  });
});

describe("language persistence", () => {
  it("saves the language to the workspace settings and the pointer, and restores it after a restart", async () => {
    disk.settings = { language: "ar", onboardingDone: true };
    disk.ui = {};
    await useSettings.getState().load();
    expect(useSettings.getState().settings.language).toBe("ar");

    useSettings.getState().update({ language: "en" });
    await useSettings.getState().flush();
    expect(disk.settings.language).toBe("en");
    expect(disk.ui.language).toBe("en");

    // "Restart": drop in-memory state, then load from disk again.
    useSettings.getState().reset();
    await act(async () => applyLanguage("ar"));
    await useSettings.getState().load();
    const restored = useSettings.getState().settings.language;
    expect(restored).toBe("en");
    await act(async () => applyLanguage(restored));
    expect(i18n.language).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});

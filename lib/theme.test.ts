// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveTheme,
  systemPrefersDark,
  getThemeSnapshot,
  getThemeServerSnapshot,
  setTheme,
  applyTheme,
  subscribeTheme,
  watchSystemTheme,
  THEME_STORAGE_KEY,
  DARK_QUERY,
} from "./theme";

describe("theme utilities", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
    setTheme("system");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  describe("systemPrefersDark", () => {
    it("returns true when matchMedia matches dark query", () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === DARK_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;

      expect(systemPrefersDark()).toBe(true);
    });

    it("returns false when matchMedia does not match dark query", () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;

      expect(systemPrefersDark()).toBe(false);
    });

    it("returns false when matchMedia throws an exception", () => {
      window.matchMedia = vi.fn().mockImplementation(() => {
        throw new Error("matchMedia not supported");
      }) as unknown as typeof window.matchMedia;

      expect(systemPrefersDark()).toBe(false);
    });
  });

  describe("resolveTheme", () => {
    it("resolves explicit 'light' to 'light'", () => {
      expect(resolveTheme("light")).toBe("light");
    });

    it("resolves explicit 'dark' to 'dark'", () => {
      expect(resolveTheme("dark")).toBe("dark");
    });

    it("resolves 'system' to 'dark' when system prefers dark", () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === DARK_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;

      expect(resolveTheme("system")).toBe("dark");
    });

    it("resolves 'system' to 'light' when system does not prefer dark", () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;

      expect(resolveTheme("system")).toBe("light");
    });
  });

  describe("getThemeServerSnapshot", () => {
    it("always returns 'system'", () => {
      expect(getThemeServerSnapshot()).toBe("system");
    });
  });

  describe("getThemeSnapshot and setTheme", () => {
    it("defaults to 'system' when localStorage is empty", () => {
      expect(getThemeSnapshot()).toBe("system");
    });

    it("reads valid preference from localStorage on initial call", async () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      vi.resetModules();
      const { getThemeSnapshot: freshGetThemeSnapshot } =
        await import("./theme");
      expect(freshGetThemeSnapshot()).toBe("dark");
    });

    it("falls back to 'system' for invalid preference in localStorage", async () => {
      localStorage.setItem(THEME_STORAGE_KEY, "invalid-theme");
      vi.resetModules();
      const { getThemeSnapshot: freshGetThemeSnapshot } =
        await import("./theme");
      expect(freshGetThemeSnapshot()).toBe("system");
    });

    it("updates localStorage and cached state when setting theme", () => {
      setTheme("dark");
      expect(getThemeSnapshot()).toBe("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

      setTheme("light");
      expect(getThemeSnapshot()).toBe("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

      setTheme("system");
      expect(getThemeSnapshot()).toBe("system");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it("handles localStorage errors gracefully", async () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("Access denied");
      });
      vi.resetModules();
      const {
        getThemeSnapshot: freshGetThemeSnapshot,
        setTheme: freshSetTheme,
      } = await import("./theme");
      expect(freshGetThemeSnapshot()).toBe("system");

      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Access denied");
      });
      expect(() => freshSetTheme("dark")).not.toThrow();
      expect(freshGetThemeSnapshot()).toBe("dark");
    });
  });

  describe("applyTheme", () => {
    it("sets data-theme attribute on documentElement", () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;

      applyTheme("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");

      applyTheme("light");
      expect(document.documentElement.dataset.theme).toBe("light");

      applyTheme("system");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  describe("subscribeTheme", () => {
    it("notifies listeners when theme changes via setTheme", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsubscribe1 = subscribeTheme(listener1);
      const unsubscribe2 = subscribeTheme(listener2);

      setTheme("dark");
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      unsubscribe1();
      setTheme("light");
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(2);

      unsubscribe2();
    });
  });

  describe("watchSystemTheme", () => {
    it("listens to system theme media query changes and updates theme when preference is system", () => {
      let changeHandler: (() => void) | undefined;

      const addEventListener = vi.fn((event, handler) => {
        if (event === "change") {
          changeHandler = handler;
        }
      });
      const removeEventListener = vi.fn();

      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === DARK_QUERY,
        media: query,
        addEventListener,
        removeEventListener,
      })) as unknown as typeof window.matchMedia;

      setTheme("system");
      const unwatch = watchSystemTheme();

      expect(addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );

      if (changeHandler) changeHandler();
      expect(document.documentElement.dataset.theme).toBe("dark");

      unwatch();
      expect(removeEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );
    });

    it("does not re-apply system theme when an explicit theme preference is set", () => {
      let changeHandler: (() => void) | undefined;

      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: true,
        media: query,
        addEventListener: (event: string, handler: () => void) => {
          if (event === "change") changeHandler = handler;
        },
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;

      setTheme("light");
      watchSystemTheme();

      if (changeHandler) changeHandler();
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });
});

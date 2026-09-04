import { describe, expect, it } from "vitest";
import { NO_FLASH_SCRIPT, THEME_STORAGE_KEY, DARK_QUERY } from "./theme";

describe("NO_FLASH_SCRIPT", () => {
  it("is defined as a string", () => {
    expect(typeof NO_FLASH_SCRIPT).toBe("string");
    expect(NO_FLASH_SCRIPT.length).toBeGreaterThan(0);
  });

  it("contains the theme storage key and dark query references", () => {
    expect(NO_FLASH_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(NO_FLASH_SCRIPT).toContain(DARK_QUERY);
  });

  it("contains dataset theme assignment logic", () => {
    expect(NO_FLASH_SCRIPT).toContain("document.documentElement.dataset.theme");
  });
});

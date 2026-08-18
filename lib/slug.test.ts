import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and dashes a normal title", () => {
    expect(slugify("Build & Notify")).toBe("build-notify");
  });

  it("collapses runs of punctuation into a single dash", () => {
    expect(slugify("Hello!!!   World??")).toBe("hello-world");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugify("  --Already Dashed--  ")).toBe("already-dashed");
  });

  it("strips diacritics rather than dropping the letters", () => {
    expect(slugify("Café Résumé")).toBe("cafe-resume");
  });

  it("falls back to 'untitled' when nothing alphanumeric survives", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("!!! ??? ---")).toBe("untitled");
  });

  it("truncates to 60 characters", () => {
    const long = "a".repeat(100);
    const result = slugify(long);
    expect(result.length).toBe(60);
    expect(result).toBe("a".repeat(60));
  });
});

describe("uniqueSlug", () => {
  it("returns the bare slug when nothing collides", () => {
    expect(uniqueSlug("Build & Notify", [])).toBe("build-notify");
  });

  it("appends -2 on a single collision", () => {
    expect(uniqueSlug("Build & Notify", ["build-notify"])).toBe(
      "build-notify-2",
    );
  });

  it("keeps incrementing past several taken suffixes", () => {
    const taken = ["build-notify", "build-notify-2", "build-notify-3"];
    expect(uniqueSlug("Build & Notify", taken)).toBe("build-notify-4");
  });

  it("skips over a taken -2 even if the bare slug is free again", () => {
    // Taken set only has -2, not the bare slug — bare slug still wins.
    expect(uniqueSlug("Build & Notify", ["build-notify-2"])).toBe(
      "build-notify",
    );
  });

  it("only checks the scope it was given, never anything global", () => {
    // Same base, disjoint taken sets — each caller's scope is independent.
    expect(uniqueSlug("Test", ["test"])).toBe("test-2");
    expect(uniqueSlug("Test", [])).toBe("test");
  });
});

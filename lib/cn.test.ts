import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional class names and falsy values", () => {
    expect(cn("foo", false && "bar", null, undefined, 0, "")).toBe("foo");
  });

  it("handles arrays and nested arrays of class names", () => {
    expect(cn(["foo", "bar"], [["baz"]])).toBe("foo bar baz");
  });

  it("handles object inputs with boolean flags", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("resolves conflicting Tailwind CSS classes", () => {
    expect(cn("px-2 px-4")).toBe("px-4");
    expect(cn("text-red-500 text-blue-500")).toBe("text-blue-500");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("handles complex combinations of strings, objects, arrays, and conflicts", () => {
    expect(
      cn(
        "p-4 font-bold",
        { "text-sm": true, "text-lg": false },
        ["p-2", { "bg-red-500": true, "bg-blue-500": true }],
        undefined,
      ),
    ).toBe("font-bold text-sm p-2 bg-blue-500");
  });

  it("returns an empty string when given no arguments or empty inputs", () => {
    expect(cn()).toBe("");
    expect(cn("", null, undefined, false)).toBe("");
  });
});

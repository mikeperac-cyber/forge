import { describe, expect, it } from "vitest";
import {
  getExecutor,
  requireExecutor,
  executorKinds,
  defaultConfigFor,
  EXECUTORS,
} from "./registry";

describe("registry", () => {
  describe("getExecutor", () => {
    it("returns executor for known kinds", () => {
      expect(getExecutor("shell")).toBeDefined();
      expect(getExecutor("shell")?.kind).toBe("shell");
      expect(getExecutor("ai")).toBeDefined();
      expect(getExecutor("ai")?.kind).toBe("ai");
      expect(getExecutor("start")?.kind).toBe("start");
    });

    it("returns undefined for unknown kind", () => {
      expect(getExecutor("nonexistent_kind")).toBeUndefined();
      expect(getExecutor("")).toBeUndefined();
    });
  });

  describe("requireExecutor", () => {
    it("returns executor for known kinds", () => {
      const executor = requireExecutor("shell");
      expect(executor).toBeDefined();
      expect(executor.kind).toBe("shell");
    });

    it("throws error for unknown kind", () => {
      expect(() => requireExecutor("nonexistent_kind")).toThrowError(
        "Unknown node kind: nonexistent_kind",
      );
    });
  });

  describe("executorKinds", () => {
    it("returns array of all registered executor kinds", () => {
      const kinds = executorKinds();
      const expectedKinds = EXECUTORS.map((e) => e.kind);
      expect(kinds).toEqual(expectedKinds);
      expect(kinds).toContain("shell");
      expect(kinds).toContain("ai");
    });
  });

  describe("defaultConfigFor", () => {
    it("returns default config object for valid kind", () => {
      const config = defaultConfigFor("shell");
      expect(config).toBeDefined();
      expect(typeof config).toBe("object");
    });

    it("throws for unknown kind via requireExecutor", () => {
      expect(() => defaultConfigFor("unknown_kind")).toThrowError(
        "Unknown node kind: unknown_kind",
      );
    });
  });
});

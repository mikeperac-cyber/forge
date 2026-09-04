import { describe, expect, it } from "vitest";
import {
  defaultConfigFor,
  executorKinds,
  EXECUTORS,
  getExecutor,
  requireExecutor,
} from "./registry";

describe("registry", () => {
  describe("getExecutor", () => {
    it("returns executor for known node kind", () => {
      const executor = getExecutor("start");
      expect(executor).toBeDefined();
      expect(executor?.kind).toBe("start");
    });

    it("returns undefined for unknown node kind", () => {
      expect(getExecutor("unknown_kind")).toBeUndefined();
    });
  });

  describe("requireExecutor", () => {
    it("returns executor for known node kind", () => {
      const executor = requireExecutor("start");
      expect(executor).toBeDefined();
      expect(executor.kind).toBe("start");
    });

    it("throws error with unknown node kind when kind is not registered", () => {
      expect(() => requireExecutor("invalid-kind")).toThrowError(
        "Unknown node kind: invalid-kind",
      );
    });
  });

  describe("executorKinds", () => {
    it("returns array of registered executor kinds", () => {
      const kinds = executorKinds();
      expect(kinds).toEqual(EXECUTORS.map((e) => e.kind));
      expect(kinds).toContain("start");
      expect(kinds).toContain("shell");
    });
  });

  describe("defaultConfigFor", () => {
    it("returns default config for valid kind", () => {
      const config = defaultConfigFor("start");
      expect(config).toBeDefined();
    });

    it("throws error for unknown node kind when generating default config", () => {
      expect(() => defaultConfigFor("nonexistent_kind")).toThrowError(
        "Unknown node kind: nonexistent_kind",
      );
    });
  });
});

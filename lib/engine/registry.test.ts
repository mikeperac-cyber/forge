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
    it("returns executor for a known node kind", () => {
      const executor = getExecutor("start");
      expect(executor).toBeDefined();
      expect(executor?.kind).toBe("start");
    });

    it("returns undefined for an unknown node kind", () => {
      expect(getExecutor("unknown-kind")).toBeUndefined();
    });
  });

  describe("requireExecutor", () => {
    it("returns the executor for a known node kind", () => {
      const executor = requireExecutor("start");
      expect(executor).toBeDefined();
      expect(executor.kind).toBe("start");
    });

    it("throws an error when given an unknown node kind", () => {
      expect(() => requireExecutor("unknown-kind")).toThrow(
        "Unknown node kind: unknown-kind",
      );
    });
  });

  describe("executorKinds", () => {
    it("returns an array of all registered executor kinds", () => {
      const kinds = executorKinds();
      const expectedKinds = EXECUTORS.map((e) => e.kind);
      expect(kinds).toEqual(expectedKinds);
      expect(kinds).toContain("start");
      expect(kinds).toContain("end");
    });
  });

  describe("defaultConfigFor", () => {
    it("returns default config object for a known node kind", () => {
      const config = defaultConfigFor("start");
      expect(config).toBeTypeOf("object");
    });

    it("throws an error for an unknown node kind", () => {
      expect(() => defaultConfigFor("nonexistent")).toThrow(
        "Unknown node kind: nonexistent",
      );
    });
  });
});

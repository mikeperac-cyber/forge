import { describe, expect, it } from "vitest";
import { findHarvester, HARVESTER_FACTORIES, HARVESTERS } from "./registry";

describe("harvest registry", () => {
  describe("HARVESTERS", () => {
    it("contains all expected harvesters", () => {
      const ids = HARVESTERS.map((h) => h.id);
      expect(ids).toEqual(["claude-code", "codex", "gemini"]);
    });

    it("has unique IDs for every harvester", () => {
      const ids = HARVESTERS.map((h) => h.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("ensures every harvester implements the ToolHarvester interface", () => {
      for (const harvester of HARVESTERS) {
        expect(typeof harvester.id).toBe("string");
        expect(harvester.id.length).toBeGreaterThan(0);

        expect(typeof harvester.label).toBe("string");
        expect(harvester.label.length).toBeGreaterThan(0);

        expect(typeof harvester.describeSource).toBe("function");
        expect(typeof harvester.describeSource()).toBe("string");

        expect(typeof harvester.detect).toBe("function");
        expect(typeof harvester.harvest).toBe("function");
      }
    });
  });

  describe("findHarvester", () => {
    it("returns harvester for known tool id", () => {
      const harvester = findHarvester("claude-code");
      expect(harvester).toBeDefined();
      expect(harvester?.id).toBe("claude-code");

      const codex = findHarvester("codex");
      expect(codex).toBeDefined();
      expect(codex?.id).toBe("codex");

      const gemini = findHarvester("gemini");
      expect(gemini).toBeDefined();
      expect(gemini?.id).toBe("gemini");
    });

    it("returns undefined for unknown tool id", () => {
      expect(findHarvester("unknown_tool")).toBeUndefined();
      expect(findHarvester("")).toBeUndefined();
    });
  });

  describe("HARVESTER_FACTORIES", () => {
    it("contains factory functions matching HARVESTERS ids", () => {
      const harvesterIds = HARVESTERS.map((h) => h.id);
      const factoryKeys = Object.keys(HARVESTER_FACTORIES);

      expect(factoryKeys.sort()).toEqual(harvesterIds.sort());
    });

    it("constructs a valid ToolHarvester when invoked with an idle gap", () => {
      for (const [id, factory] of Object.entries(HARVESTER_FACTORIES)) {
        expect(typeof factory).toBe("function");

        const harvester = factory(30);
        expect(harvester).toBeDefined();
        expect(harvester.id).toBe(id);
        expect(typeof harvester.label).toBe("string");
        expect(typeof harvester.describeSource).toBe("function");
        expect(typeof harvester.detect).toBe("function");
        expect(typeof harvester.harvest).toBe("function");
      }
    });
  });
});

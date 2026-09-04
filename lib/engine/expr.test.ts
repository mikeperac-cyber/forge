import { describe, expect, it } from "vitest";
import { evaluateExpression, ExpressionError, isTruthy } from "./expr";

describe("isTruthy", () => {
  describe("arrays", () => {
    it("returns false for empty arrays", () => {
      expect(isTruthy([])).toBe(false);
    });

    it("returns true for non-empty arrays even if elements are falsy", () => {
      expect(isTruthy([0])).toBe(true);
      expect(isTruthy([false])).toBe(true);
      expect(isTruthy([null])).toBe(true);
      expect(isTruthy([undefined])).toBe(true);
      expect(isTruthy([""])).toBe(true);
      expect(isTruthy([1, 2, 3])).toBe(true);
    });
  });

  describe("objects", () => {
    it("returns false for empty plain objects", () => {
      expect(isTruthy({})).toBe(false);
    });

    it("returns false for empty prototype-less objects", () => {
      const obj = Object.create(null);
      expect(isTruthy(obj)).toBe(false);
    });

    it("returns true for objects with own enumerable properties", () => {
      expect(isTruthy({ a: 1 })).toBe(true);
      expect(isTruthy({ a: undefined })).toBe(true);
      expect(isTruthy({ a: null })).toBe(true);
      expect(isTruthy({ a: false })).toBe(true);

      const objWithProto = Object.create(null);
      objWithProto.a = 1;
      expect(isTruthy(objWithProto)).toBe(true);
    });

    it("evaluates object-like instances based on own enumerable key count", () => {
      // Objects with 0 own enumerable keys evaluate to false according to isTruthy logic
      expect(isTruthy(new Date())).toBe(false);
      expect(isTruthy(/abc/)).toBe(false);
    });
  });

  describe("falsy primitives", () => {
    it("returns false for standard JS falsy primitive values", () => {
      expect(isTruthy(null)).toBe(false);
      expect(isTruthy(undefined)).toBe(false);
      expect(isTruthy(false)).toBe(false);
      expect(isTruthy(0)).toBe(false);
      expect(isTruthy(-0)).toBe(false);
      expect(isTruthy(BigInt(0))).toBe(false);
      expect(isTruthy("")).toBe(false);
      expect(isTruthy(NaN)).toBe(false);
    });
  });

  describe("truthy primitives and functions", () => {
    it("returns true for truthy primitives", () => {
      expect(isTruthy(true)).toBe(true);
      expect(isTruthy(1)).toBe(true);
      expect(isTruthy(-1)).toBe(true);
      expect(isTruthy(3.14)).toBe(true);
      expect(isTruthy(BigInt(1))).toBe(true);
      expect(isTruthy("hello")).toBe(true);
      expect(isTruthy("0")).toBe(true);
      expect(isTruthy("false")).toBe(true);
      expect(isTruthy(" ")).toBe(true);
      expect(isTruthy(Symbol("test"))).toBe(true);
    });

    it("returns true for functions", () => {
      expect(isTruthy(() => {})).toBe(true);
      expect(
        isTruthy(function foo() {
          return false;
        }),
      ).toBe(true);
    });
  });
});

describe("evaluateExpression", () => {
  it("evaluates valid expressions against input", () => {
    expect(evaluateExpression("input + 1", 5)).toBe(6);
    expect(evaluateExpression("input.foo.bar", { foo: { bar: "baz" } })).toBe(
      "baz",
    );
    expect(
      evaluateExpression("input.items.filter(x => x > 2)", {
        items: [1, 2, 3, 4],
      }),
    ).toEqual([3, 4]);
  });

  it("throws ExpressionError on empty or whitespace-only expressions", () => {
    expect(() => evaluateExpression("", null)).toThrow(ExpressionError);
    expect(() => evaluateExpression("", null)).toThrow("Expression is empty");
    expect(() => evaluateExpression("   \n\t  ", null)).toThrow(
      "Expression is empty",
    );
  });

  it("throws ExpressionError on syntax errors", () => {
    expect(() => evaluateExpression("input +", 5)).toThrow(ExpressionError);
    expect(() => evaluateExpression("input +", 5)).toThrow(/Syntax error/i);
  });

  it("throws ExpressionError on evaluation runtime errors", () => {
    expect(() => evaluateExpression("input.foo.bar", null)).toThrow(
      ExpressionError,
    );
    expect(() => evaluateExpression("input.foo.bar", null)).toThrow(
      /Cannot read property|Cannot read properties|null/i,
    );
  });
});

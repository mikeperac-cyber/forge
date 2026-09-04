import { describe, expect, it } from "vitest";
import { evaluateExpression, ExpressionError, isTruthy } from "./expr";

describe("evaluateExpression", () => {
  it("evaluates simple literal expressions", () => {
    expect(evaluateExpression("42", null)).toBe(42);
    expect(evaluateExpression("'hello'", null)).toBe("hello");
    expect(evaluateExpression("true", null)).toBe(true);
    expect(evaluateExpression("{ a: 1, b: 'test' }", null)).toEqual({
      a: 1,
      b: "test",
    });
    expect(evaluateExpression("[1, 2, 3]", null)).toEqual([1, 2, 3]);
  });

  it("evaluates expressions accessing input object", () => {
    const input = { user: { name: "Alice", age: 30 }, items: [10, 20] };
    expect(evaluateExpression("input.user.name", input)).toBe("Alice");
    expect(evaluateExpression("input.items[1] * 2", input)).toBe(40);
    expect(evaluateExpression("input.user.age > 18", input)).toBe(true);
  });

  it("evaluates expressions accessing non-object input", () => {
    expect(evaluateExpression("input + 10", 5)).toBe(15);
    expect(evaluateExpression("input.toUpperCase()", "hello")).toBe("HELLO");
    expect(evaluateExpression("input[0]", [100, 200])).toBe(100);
  });

  it("throws ExpressionError when expression is empty or whitespace", () => {
    expect(() => evaluateExpression("", null)).toThrow(ExpressionError);
    expect(() => evaluateExpression("   ", null)).toThrow(
      "Expression is empty",
    );
    try {
      evaluateExpression("  ", null);
    } catch (err) {
      expect(err).toBeInstanceOf(ExpressionError);
      expect((err as ExpressionError).expression).toBe("  ");
    }
  });

  it("throws ExpressionError on syntax errors during compilation", () => {
    expect(() => evaluateExpression("input.", null)).toThrow(ExpressionError);
    expect(() => evaluateExpression("function(", null)).toThrow(
      /Syntax error:/,
    );
    try {
      evaluateExpression("const x =", null);
    } catch (err) {
      expect(err).toBeInstanceOf(ExpressionError);
      expect((err as ExpressionError).expression).toBe("const x =");
    }
  });

  it("throws ExpressionError on runtime errors during evaluation", () => {
    expect(() => evaluateExpression("input.foo.bar", null)).toThrow(
      ExpressionError,
    );
    expect(() =>
      evaluateExpression(
        "(() => { throw new Error('custom runtime error'); })()",
        null,
      ),
    ).toThrow("custom runtime error");
    try {
      evaluateExpression("input.invalidMethod()", {});
    } catch (err) {
      expect(err).toBeInstanceOf(ExpressionError);
      expect((err as ExpressionError).expression).toBe("input.invalidMethod()");
    }
  });
});

describe("ExpressionError", () => {
  it("constructs with correct message, expression, and name", () => {
    const err = new ExpressionError("Test message", "input.x");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ExpressionError");
    expect(err.message).toBe("Test message");
    expect(err.expression).toBe("input.x");
  });
});

describe("isTruthy", () => {
  it("treats primitive truthy/falsy values correctly", () => {
    expect(isTruthy(true)).toBe(true);
    expect(isTruthy("hello")).toBe(true);
    expect(isTruthy(123)).toBe(true);

    expect(isTruthy(false)).toBe(false);
    expect(isTruthy("")).toBe(false);
    expect(isTruthy(0)).toBe(false);
    expect(isTruthy(null)).toBe(false);
    expect(isTruthy(undefined)).toBe(false);
  });

  it("treats arrays based on length", () => {
    expect(isTruthy([])).toBe(false);
    expect(isTruthy([0])).toBe(true);
    expect(isTruthy(["a"])).toBe(true);
  });

  it("treats objects based on keys count", () => {
    expect(isTruthy({})).toBe(false);
    expect(isTruthy({ key: "value" })).toBe(true);
    expect(isTruthy({ key: undefined })).toBe(true);
  });
});

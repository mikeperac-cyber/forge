/**
 * Expression evaluation for the `transform` and `branch` nodes.
 *
 * These two run for real even in simulation mode, because they're pure
 * functions over data — which is what makes the data flow through the graph
 * genuine end to end rather than staged.
 *
 * Caveat, stated plainly: this is `new Function`, so an expression is arbitrary
 * JavaScript with access to globals. That is acceptable here only because the
 * app is local and single-user, and the author of the expression is the person
 * running it — the same trust level as a shell node. Do not expose this to
 * untrusted input without a real sandbox (isolated-vm, QuickJS, a Worker with a
 * frozen realm). Sandboxing is deferred, not overlooked.
 */

export class ExpressionError extends Error {
  constructor(
    message: string,
    readonly expression: string,
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

export function evaluateExpression(
  expression: string,
  input: unknown,
): unknown {
  const source = expression.trim();
  if (!source) throw new ExpressionError("Expression is empty", expression);

  let compiled: (input: unknown) => unknown;
  try {
    compiled = new Function("input", `"use strict"; return (${source});`) as (
      input: unknown,
    ) => unknown;
  } catch (err) {
    throw new ExpressionError(
      `Syntax error: ${(err as Error).message}`,
      expression,
    );
  }

  try {
    return compiled(input);
  } catch (err) {
    throw new ExpressionError((err as Error).message, expression);
  }
}

/** JS truthiness, but empty arrays and empty objects count as false. */
export function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(value as object).length > 0;
  }
  return Boolean(value);
}

import { createRequire } from "node:module";
import type ivmType from "isolated-vm";

/**
 * Expression evaluation for the `transform` and `branch` nodes.
 *
 * These two run for real even in simulation mode, because they're pure
 * functions over data — which is what makes the data flow through the graph
 * genuine end to end rather than staged.
 *
 * User-provided expressions are executed inside an isolated-vm sandbox,
 * protecting against arbitrary code execution, global scope leakage,
 * and runaway execution.
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

const ISOLATE_MEMORY_LIMIT_MB = 16;
const EVAL_TIMEOUT_MS = 1000;

let ivmModule: typeof ivmType | null = null;

function getIvm(): typeof ivmType {
  if (!ivmModule) {
    const req =
      typeof require !== "undefined" ? require : createRequire(import.meta.url);
    ivmModule = req("isolated-vm") as typeof ivmType;
  }
  return ivmModule;
}

export function evaluateExpression(
  expression: string,
  input: unknown,
): unknown {
  const source = expression.trim();
  if (!source) throw new ExpressionError("Expression is empty", expression);

  const ivm = getIvm();
  const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT_MB });
  let script: ivmType.Script;

  try {
    script = isolate.compileScriptSync(`"use strict"; (${source});`);
  } catch (err) {
    const rawMsg = (err as Error).message || "";
    const cleanMsg = rawMsg.replace(/\s*\[<isolated-vm>:[^\]]+\]/, "");
    throw new ExpressionError(`Syntax error: ${cleanMsg}`, expression);
  }

  try {
    const context = isolate.createContextSync();
    const jail = context.global;

    let inputCopy: ivmType.Copy<unknown>;
    try {
      inputCopy = new ivm.ExternalCopy(input).copyInto();
    } catch {
      inputCopy = new ivm.ExternalCopy(
        JSON.parse(JSON.stringify(input)),
      ).copyInto();
    }
    jail.setSync("input", inputCopy);

    const result = script.runSync(context, {
      copy: true,
      timeout: EVAL_TIMEOUT_MS,
    });

    return result;
  } catch (err) {
    const rawMsg = (err as Error).message || "";
    const cleanMsg = rawMsg.replace(/\s*\[<isolated-vm>:[^\]]+\]/, "");
    throw new ExpressionError(cleanMsg, expression);
  } finally {
    isolate.dispose();
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

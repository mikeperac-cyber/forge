import { parseExpression } from "@babel/parser";
import type { Node as AstNode } from "@babel/types";

/**
 * Expression evaluation for the `transform` and `branch` nodes.
 *
 * Evaluates JavaScript expressions safely using an AST evaluator, without
 * `eval` or `new Function`.
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

const FORBIDDEN_PROPERTIES = new Set(["__proto__", "prototype", "constructor"]);

const FORBIDDEN_GLOBALS = new Set([
  "process",
  "globalThis",
  "global",
  "window",
  "Function",
  "eval",
  "require",
  "import",
  "module",
  "exports",
  "Deno",
  "Bun",
  "fetch",
  "console",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "queueMicrotask",
  "Proxy",
  "Reflect",
  "Symbol",
]);

const SAFE_GLOBALS: Record<string, unknown> = {
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Error,
  TypeError,
  RangeError,
  SyntaxError,
  ReferenceError,
  URIError,
  EvalError,
  RegExp,
  Date,
  Set,
  Map,
  URL,
  URLSearchParams,
  undefined,
  NaN,
  Infinity,
};

interface StepCounter {
  count: number;
}

const MAX_STEPS = 10000;

function evaluateAst(
  node: AstNode | null | undefined,
  scope: Record<string, unknown>,
  stepCounter: StepCounter,
): unknown {
  stepCounter.count++;
  if (stepCounter.count > MAX_STEPS) {
    throw new Error("Execution step limit exceeded");
  }

  if (!node) return undefined;

  switch (node.type) {
    case "NumericLiteral":
    case "StringLiteral":
    case "BooleanLiteral":
      return node.value;

    case "NullLiteral":
      return null;

    case "Identifier": {
      const name = node.name;
      if (FORBIDDEN_GLOBALS.has(name)) {
        throw new Error(`Access to global '${name}' is prohibited`);
      }
      if (Object.prototype.hasOwnProperty.call(scope, name)) {
        return scope[name];
      }
      if (Object.prototype.hasOwnProperty.call(SAFE_GLOBALS, name)) {
        return SAFE_GLOBALS[name];
      }
      throw new Error(`${name} is not defined`);
    }

    case "Import":
      throw new Error("Access to global 'import' is prohibited");

    case "ParenthesizedExpression":
      return evaluateAst(node.expression, scope, stepCounter);

    case "MemberExpression":
    case "OptionalMemberExpression": {
      const obj = evaluateAst(node.object, scope, stepCounter);
      const optional = Boolean(node.optional);

      if (optional && (obj === null || obj === undefined)) {
        return undefined;
      }

      let prop: unknown;
      if (node.computed) {
        prop = evaluateAst(node.property, scope, stepCounter);
      } else if (node.property.type === "Identifier") {
        prop = node.property.name;
      } else {
        prop = evaluateAst(node.property, scope, stepCounter);
      }

      const propStr = String(prop);
      if (FORBIDDEN_PROPERTIES.has(propStr)) {
        throw new Error(`Access to property '${propStr}' is prohibited`);
      }

      if (obj === null || obj === undefined) {
        throw new TypeError(
          `Cannot read properties of ${obj === null ? "null" : "undefined"} (reading '${propStr}')`,
        );
      }

      return (obj as Record<string, unknown>)[propStr];
    }

    case "CallExpression":
    case "OptionalCallExpression": {
      const isCalleeMember =
        node.callee.type === "MemberExpression" ||
        node.callee.type === "OptionalMemberExpression";

      let fn: unknown;
      let thisCtx: unknown = undefined;

      if (isCalleeMember) {
        const calleeMember = node.callee as
          | import("@babel/types").MemberExpression
          | import("@babel/types").OptionalMemberExpression;
        const obj = evaluateAst(calleeMember.object, scope, stepCounter);
        const optionalObj = Boolean(calleeMember.optional);

        if (optionalObj && (obj === null || obj === undefined)) {
          return undefined;
        }

        let prop: unknown;
        if (calleeMember.computed) {
          prop = evaluateAst(calleeMember.property, scope, stepCounter);
        } else if (calleeMember.property.type === "Identifier") {
          prop = calleeMember.property.name;
        } else {
          prop = evaluateAst(calleeMember.property, scope, stepCounter);
        }

        const propStr = String(prop);
        if (FORBIDDEN_PROPERTIES.has(propStr)) {
          throw new Error(`Access to property '${propStr}' is prohibited`);
        }

        if (obj === null || obj === undefined) {
          throw new TypeError(
            `Cannot read properties of ${obj === null ? "null" : "undefined"} (reading '${propStr}')`,
          );
        }

        thisCtx = obj;
        fn = (obj as Record<string, unknown>)[propStr];

        if (typeof fn !== "function") {
          throw new TypeError(`${propStr} is not a function`);
        }
      } else {
        fn = evaluateAst(node.callee, scope, stepCounter);
        if (node.optional && (fn === null || fn === undefined)) {
          return undefined;
        }
        if (typeof fn !== "function") {
          const calleeName =
            node.callee.type === "Identifier" ? node.callee.name : "value";
          throw new TypeError(`${calleeName} is not a function`);
        }
      }

      if (fn === Function || fn === eval) {
        throw new Error("Calling function constructor or eval is prohibited");
      }

      const args: unknown[] = [];
      for (const argNode of node.arguments) {
        if (argNode.type === "SpreadElement") {
          const spreadVal = evaluateAst(argNode.argument, scope, stepCounter);
          if (Array.isArray(spreadVal)) {
            args.push(...spreadVal);
          } else if (spreadVal && typeof spreadVal === "object") {
            args.push(...Object.values(spreadVal));
          }
        } else {
          args.push(evaluateAst(argNode, scope, stepCounter));
        }
      }

      return (fn as (...a: unknown[]) => unknown).apply(thisCtx, args);
    }

    case "NewExpression": {
      const callee = evaluateAst(node.callee, scope, stepCounter);
      if (typeof callee !== "function") {
        const calleeName =
          node.callee.type === "Identifier" ? node.callee.name : "value";
        throw new TypeError(`${calleeName} is not a constructor`);
      }
      if (callee === Function) {
        throw new Error("Instantiation of Function constructor is prohibited");
      }
      const args = node.arguments.map((arg) =>
        evaluateAst(arg, scope, stepCounter),
      );
      return new (callee as new (...a: unknown[]) => unknown)(...args);
    }

    case "BinaryExpression": {
      const left = evaluateAst(node.left, scope, stepCounter);
      const right = evaluateAst(node.right, scope, stepCounter);

      switch (node.operator) {
        case "+":
          return (left as number) + (right as number);
        case "-":
          return (left as number) - (right as number);
        case "*":
          return (left as number) * (right as number);
        case "/":
          return (left as number) / (right as number);
        case "%":
          return (left as number) % (right as number);
        case "**":
          return (left as number) ** (right as number);
        case "===":
          return left === right;
        case "!==":
          return left !== right;
        case "==":
          return left == right;
        case "!=":
          return left != right;
        case "<":
          return (left as number) < (right as number);
        case "<=":
          return (left as number) <= (right as number);
        case ">":
          return (left as number) > (right as number);
        case ">=":
          return (left as number) >= (right as number);
        case "in":
          if (FORBIDDEN_PROPERTIES.has(String(left))) {
            throw new Error(`Access to property '${left}' is prohibited`);
          }
          return (
            typeof right === "object" && right !== null && String(left) in right
          );
        case "instanceof":
          return (
            typeof right === "function" &&
            left instanceof (right as new (...a: unknown[]) => unknown)
          );
        case "&":
          return (left as number) & (right as number);
        case "|":
          return (left as number) | (right as number);
        case "^":
          return (left as number) ^ (right as number);
        case "<<":
          return (left as number) << (right as number);
        case ">>":
          return (left as number) >> (right as number);
        case ">>>":
          return (left as number) >>> (right as number);
        default:
          throw new Error(`Unsupported binary operator: ${node.operator}`);
      }
    }

    case "LogicalExpression": {
      const left = evaluateAst(node.left, scope, stepCounter);
      if (node.operator === "&&") {
        return left ? evaluateAst(node.right, scope, stepCounter) : left;
      }
      if (node.operator === "||") {
        return left ? left : evaluateAst(node.right, scope, stepCounter);
      }
      if (node.operator === "??") {
        return left !== null && left !== undefined
          ? left
          : evaluateAst(node.right, scope, stepCounter);
      }
      throw new Error(`Unsupported logical operator: ${node.operator}`);
    }

    case "UnaryExpression": {
      const arg = evaluateAst(node.argument, scope, stepCounter);
      switch (node.operator) {
        case "!":
          return !arg;
        case "-":
          return -(arg as number);
        case "+":
          return +(arg as number);
        case "~":
          return ~(arg as number);
        case "typeof":
          return typeof arg;
        case "void":
          return void arg;
        default:
          throw new Error(`Unsupported unary operator: ${node.operator}`);
      }
    }

    case "ConditionalExpression": {
      const test = evaluateAst(node.test, scope, stepCounter);
      return test
        ? evaluateAst(node.consequent, scope, stepCounter)
        : evaluateAst(node.alternate, scope, stepCounter);
    }

    case "ObjectExpression": {
      const res: Record<string, unknown> = {};
      for (const propNode of node.properties) {
        if (propNode.type === "SpreadElement") {
          const spreadObj = evaluateAst(propNode.argument, scope, stepCounter);
          if (spreadObj && typeof spreadObj === "object") {
            for (const key of Object.keys(spreadObj)) {
              if (FORBIDDEN_PROPERTIES.has(key)) {
                throw new Error(`Access to property '${key}' is prohibited`);
              }
            }
            Object.assign(res, spreadObj);
          }
        } else if (propNode.type === "ObjectProperty") {
          let keyStr: string;
          if (propNode.computed) {
            keyStr = String(evaluateAst(propNode.key, scope, stepCounter));
          } else if (propNode.key.type === "Identifier") {
            keyStr = propNode.key.name;
          } else if (
            propNode.key.type === "StringLiteral" ||
            propNode.key.type === "NumericLiteral"
          ) {
            keyStr = String(propNode.key.value);
          } else {
            keyStr = String(evaluateAst(propNode.key, scope, stepCounter));
          }

          if (FORBIDDEN_PROPERTIES.has(keyStr)) {
            throw new Error(`Access to property '${keyStr}' is prohibited`);
          }

          const val = evaluateAst(propNode.value, scope, stepCounter);
          res[keyStr] = val;
        }
      }
      return res;
    }

    case "ArrayExpression": {
      const res: unknown[] = [];
      for (const elemNode of node.elements) {
        if (!elemNode) {
          res.push(undefined);
        } else if (elemNode.type === "SpreadElement") {
          const spreadVal = evaluateAst(elemNode.argument, scope, stepCounter);
          if (Array.isArray(spreadVal)) {
            res.push(...spreadVal);
          } else if (spreadVal && typeof spreadVal === "object") {
            res.push(...Object.values(spreadVal));
          }
        } else {
          res.push(evaluateAst(elemNode, scope, stepCounter));
        }
      }
      return res;
    }

    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      return (...fnArgs: unknown[]) => {
        const fnScope = { ...scope };
        node.params.forEach((param, idx) => {
          if (param.type === "Identifier") {
            fnScope[param.name] = fnArgs[idx];
          }
        });
        if (node.body.type === "BlockStatement") {
          const res = evaluateAst(node.body, fnScope, stepCounter);
          if (
            res &&
            typeof res === "object" &&
            (res as Record<string, unknown>).__isReturn
          ) {
            return (res as Record<string, unknown>).value;
          }
          return undefined;
        }
        return evaluateAst(node.body, fnScope, stepCounter);
      };
    }

    case "BlockStatement": {
      for (const stmt of node.body) {
        const result = evaluateAst(stmt, scope, stepCounter);
        if (
          result &&
          typeof result === "object" &&
          (result as Record<string, unknown>).__isReturn
        ) {
          return result;
        }
      }
      return undefined;
    }

    case "ExpressionStatement":
      return evaluateAst(node.expression, scope, stepCounter);

    case "ReturnStatement": {
      const val = node.argument
        ? evaluateAst(node.argument, scope, stepCounter)
        : undefined;
      return { __isReturn: true, value: val };
    }

    case "ThrowStatement": {
      const errVal = evaluateAst(node.argument, scope, stepCounter);
      if (errVal instanceof Error) {
        throw errVal;
      }
      throw new Error(String(errVal));
    }

    case "SequenceExpression": {
      let lastVal: unknown;
      for (const exprNode of node.expressions) {
        lastVal = evaluateAst(exprNode, scope, stepCounter);
      }
      return lastVal;
    }

    default:
      throw new Error(`Unsupported expression node type: ${node.type}`);
  }
}

export function evaluateExpression(
  expression: string,
  input: unknown,
): unknown {
  const source = expression.trim();
  if (!source) throw new ExpressionError("Expression is empty", expression);

  let astNode: AstNode;
  try {
    astNode = parseExpression(source, {
      plugins: ["typescript", "jsx"],
    });
  } catch (err) {
    throw new ExpressionError(
      `Syntax error: ${(err as Error).message}`,
      expression,
    );
  }

  const scope: Record<string, unknown> = {
    input,
  };

  const stepCounter: StepCounter = { count: 0 };

  try {
    return evaluateAst(astNode, scope, stepCounter);
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

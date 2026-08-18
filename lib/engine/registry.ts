import type { NodeExecutor } from "./types";
import { startExecutor } from "../executors/start";
import { shellExecutor } from "../executors/shell";
import { aiExecutor } from "../executors/ai";
import { httpExecutor } from "../executors/http";
import { transformExecutor } from "../executors/transform";
import { branchExecutor } from "../executors/branch";
import { endExecutor } from "../executors/end";

/**
 * A registry holds executors with *different* config types, so the element type
 * has to erase that parameter. `any` here is deliberate and contained: each
 * executor still narrows its own config internally via `configSchema`, and the
 * scheduler re-parses config before calling `run`, so nothing downstream trusts
 * this type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExecutor = NodeExecutor<any>;

/**
 * The only place that knows the full set of node kinds. Adding one means adding
 * a file and a line here — its config form, canvas node, palette entry and
 * validation all follow from the executor's own declaration.
 */
export const EXECUTORS: readonly AnyExecutor[] = [
  startExecutor,
  shellExecutor,
  aiExecutor,
  httpExecutor,
  transformExecutor,
  branchExecutor,
  endExecutor,
];

const BY_KIND = new Map(EXECUTORS.map((e) => [e.kind, e]));

export function getExecutor(kind: string): AnyExecutor | undefined {
  return BY_KIND.get(kind);
}

export function requireExecutor(kind: string): AnyExecutor {
  const executor = BY_KIND.get(kind);
  if (!executor) throw new Error(`Unknown node kind: ${kind}`);
  return executor;
}

export function executorKinds(): string[] {
  return EXECUTORS.map((e) => e.kind);
}

/** Config with every schema default applied — used when dropping a new node. */
export function defaultConfigFor(kind: string): Record<string, unknown> {
  const executor = requireExecutor(kind);
  const parsed = executor.configSchema.safeParse({});
  return parsed.success ? (parsed.data as Record<string, unknown>) : {};
}

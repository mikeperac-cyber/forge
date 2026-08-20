import type { Emit } from "./events";
import {
  DEFAULT_RUN_OPTIONS,
  isTerminal,
  type GraphEdge,
  type GraphNode,
  type RunOptions,
  type RunStatus,
  type WorkflowGraph,
} from "./types";
import { getExecutor } from "./registry";
import { hashSeed, isAbortError, mulberry32, sleep } from "./rng";

export interface ExecuteArgs {
  runId: string;
  graph: WorkflowGraph;
  emit: Emit;
  options?: Partial<RunOptions>;
  signal?: AbortSignal;
}

export interface ExecuteResult {
  status: RunStatus;
  nodeStatuses: Record<string, RunStatus>;
  outputs: Record<string, Record<string, unknown>>;
  error?: string;
}

/** Whether an edge can carry data: resolved-and-live, resolved-and-dead, or not yet known. */
type EdgeState = "live" | "dead" | "unresolved";

export async function executeWorkflow({
  runId,
  graph,
  emit,
  options,
  signal,
}: ExecuteArgs): Promise<ExecuteResult> {
  const opts: RunOptions = { ...DEFAULT_RUN_OPTIONS, ...options };
  const nodes = graph.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  for (const node of nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of graph.edges) {
    // Ignore edges pointing at nodes that no longer exist.
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    incoming.get(edge.target)!.push(edge);
    outgoing.get(edge.source)!.push(edge);
  }

  const status = new Map<string, RunStatus>(
    nodes.map((n) => [n.id, "pending"]),
  );
  const outputs = new Map<string, Record<string, unknown>>();
  /** null means "every output port is live"; only branches narrow it. */
  const takenHandles = new Map<string, string[] | null>();
  /** Attempts consumed so far per node; absent means "on its first attempt." */
  const attempts = new Map<string, number>();

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  let seq = 0;
  const nextSeq = () => ++seq;
  let runError: string | undefined;
  let cancelled = false;

  emit({ type: "run:started", runId, at: Date.now() });

  /* ------------------------------------------------------------- helpers */

  function defaultSourceHandle(node: GraphNode): string | undefined {
    return getExecutor(node.kind)?.ports.outputs[0]?.id;
  }

  function defaultTargetHandle(node: GraphNode): string | undefined {
    return getExecutor(node.kind)?.ports.inputs[0]?.id;
  }

  function edgeState(edge: GraphEdge): EdgeState {
    const sourceStatus = status.get(edge.source);
    if (!sourceStatus || !isTerminal(sourceStatus)) return "unresolved";
    if (sourceStatus !== "succeeded") return "dead";

    const taken = takenHandles.get(edge.source);
    if (taken == null) return "live";

    const sourceNode = byId.get(edge.source)!;
    const handle = edge.sourceHandle ?? defaultSourceHandle(sourceNode);
    return handle && taken.includes(handle) ? "live" : "dead";
  }

  /**
   * A node runs once every incoming edge has resolved and at least one is live.
   * If they all resolved dead, it can never receive input, so it is skipped.
   *
   * Plain "wait for all parents to succeed" would deadlock the moment a branch
   * exists, since one side is guaranteed never to succeed.
   */
  function readiness(nodeId: string): "run" | "skip" | "wait" {
    const deps = incoming.get(nodeId) ?? [];
    if (deps.length === 0) return "run";

    let anyLive = false;
    for (const edge of deps) {
      const state = edgeState(edge);
      if (state === "unresolved") return "wait";
      if (state === "live") anyLive = true;
    }
    return anyLive ? "run" : "skip";
  }

  function resolveInputs(nodeId: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    const node = byId.get(nodeId)!;

    for (const edge of incoming.get(nodeId) ?? []) {
      if (edgeState(edge) !== "live") continue;
      const sourceNode = byId.get(edge.source)!;
      const sourceHandle = edge.sourceHandle ?? defaultSourceHandle(sourceNode);
      const targetHandle = edge.targetHandle ?? defaultTargetHandle(node);
      if (!sourceHandle || !targetHandle) continue;
      inputs[targetHandle] = outputs.get(edge.source)?.[sourceHandle];
    }

    return inputs;
  }

  function finish(
    nodeId: string,
    next: RunStatus,
    payload?: { outputs?: Record<string, unknown>; error?: string },
  ) {
    status.set(nodeId, next);
    if (payload?.outputs) outputs.set(nodeId, payload.outputs);
    emit({
      type: "node:finished",
      runId,
      nodeId,
      status: next,
      outputs: payload?.outputs,
      error: payload?.error,
      attempt: attempts.get(nodeId) ?? 1,
      at: Date.now(),
    });
  }

  /**
   * A failed attempt either gets retried or becomes the node's real, terminal
   * failure — never both. Applies uniformly to every failure cause (a bad
   * config or an unknown kind included) rather than special-casing which ones
   * are "worth" retrying: the cost of one wasted attempt on a deterministic
   * failure is a few seconds, once, and that's cheaper than two failure paths
   * to maintain.
   */
  async function handleFailure(nodeId: string, error: string) {
    const attempt = attempts.get(nodeId) ?? 1;
    const override = byId.get(nodeId)?.data.retry;
    const maxAttempts = override?.maxAttempts ?? opts.maxAttempts;
    const retryDelayMs = override?.retryDelayMs ?? opts.retryDelayMs;

    if (attempt >= maxAttempts || controller.signal.aborted) {
      finish(nodeId, "failed", { error });
      if (opts.onFailure === "stop-run") {
        runError ??= outputsErrorFor(nodeId);
        controller.abort();
      }
      return;
    }

    const nextAttempt = attempt + 1;
    emit({
      type: "node:retrying",
      runId,
      nodeId,
      attempt,
      nextAttempt,
      maxAttempts,
      error,
      delayMs: retryDelayMs,
      at: Date.now(),
    });

    try {
      await sleep(retryDelayMs, controller.signal);
    } catch {
      // Aborted while waiting to retry — same outcome as any other in-flight
      // node caught by cancellation, not a failure of this attempt.
      finish(nodeId, "cancelled");
      return;
    }

    attempts.set(nodeId, nextAttempt);
    // Back in the pool: the main loop's existing readiness()/dispatch already
    // re-considers anything "pending", so no loop changes are needed for the
    // retry to actually happen.
    status.set(nodeId, "pending");
  }

  /* -------------------------------------------------------------- running */

  const running = new Map<string, Promise<void>>();

  async function dispatch(node: GraphNode) {
    status.set(node.id, "running");
    const attempt = attempts.get(node.id) ?? 1;

    // Resolved before announcing the start so the event can carry it, and
    // reused for the executor — resolving twice could disagree if an upstream
    // node settled in between.
    const inputs = resolveInputs(node.id);

    emit({
      type: "node:started",
      runId,
      nodeId: node.id,
      kind: node.kind,
      inputs,
      attempt,
      at: Date.now(),
    });

    const promise = (async () => {
      const executor = getExecutor(node.kind);
      if (!executor) {
        await handleFailure(node.id, `Unknown node kind: ${node.kind}`);
        return;
      }

      const parsed = executor.configSchema.safeParse(node.data.config ?? {});
      if (!parsed.success) {
        await handleFailure(
          node.id,
          `Invalid config: ${parsed.error.issues
            .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
            .join("; ")}`,
        );
        return;
      }

      // Seeded per (run, node, attempt) — not just per node — so a retried
      // node's simulated outcome (e.g. a shell node's failureRate roll) is
      // independent on each attempt. Reusing the first attempt's seed would
      // make every retry fail exactly the same way it failed the first time,
      // which defeats the point of retrying at all.
      const random = mulberry32(hashSeed(`${runId}:${node.id}:${attempt}`));

      try {
        const iterator = executor.run({
          config: parsed.data as never,
          inputs,
          signal: controller.signal,
          nodeId: node.id,
          nodeRunId: `${runId}:${node.id}:${attempt}`,
          random,
        });

        let settled = false;

        for await (const event of iterator) {
          switch (event.type) {
            case "log":
              emit({
                type: "node:log",
                runId,
                nodeId: node.id,
                stream: event.stream,
                text: event.text,
                seq: nextSeq(),
                at: Date.now(),
              });
              break;
            case "progress":
              emit({
                type: "node:progress",
                runId,
                nodeId: node.id,
                pct: event.pct,
              });
              break;
            case "succeeded":
              takenHandles.set(node.id, event.taken ?? null);
              finish(node.id, "succeeded", { outputs: event.outputs ?? {} });
              settled = true;
              break;
            case "failed":
              await handleFailure(node.id, event.error);
              settled = true;
              break;
          }
          if (settled) break;
        }

        // An executor that returns without settling is a bug in that executor,
        // not a reason to hang the whole run.
        if (!settled) {
          await handleFailure(
            node.id,
            `Executor "${node.kind}" finished without reporting success or failure`,
          );
        }
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) {
          finish(node.id, "cancelled");
        } else {
          await handleFailure(node.id, (err as Error).message);
        }
      }
    })().finally(() => {
      running.delete(node.id);
    });

    running.set(node.id, promise);
  }

  function outputsErrorFor(nodeId: string): string {
    const node = byId.get(nodeId);
    return `Node "${node?.data.label ?? nodeId}" failed`;
  }

  /* ----------------------------------------------------------- main loop */

  for (;;) {
    if (controller.signal.aborted) cancelled = true;

    let progressed = false;

    // Retire anything that can never receive input.
    for (const node of nodes) {
      if (status.get(node.id) !== "pending") continue;
      if (readiness(node.id) === "skip") {
        finish(node.id, "skipped");
        progressed = true;
      }
    }

    if (!controller.signal.aborted) {
      for (const node of nodes) {
        if (running.size >= opts.concurrency) break;
        if (status.get(node.id) !== "pending") continue;
        if (readiness(node.id) !== "run") continue;
        await dispatch(node);
        progressed = true;
      }
    }

    if (running.size > 0) {
      await Promise.race(running.values());
      continue;
    }

    if (!progressed) break;
  }

  // Anything still pending is unreachable — a cycle, or cancelled before it
  // ever started. Validation catches cycles earlier; this is the backstop.
  for (const node of nodes) {
    if (status.get(node.id) === "pending") {
      finish(node.id, cancelled ? "cancelled" : "skipped");
    }
  }

  if (signal) signal.removeEventListener("abort", onExternalAbort);

  const nodeStatuses = Object.fromEntries(status) as Record<string, RunStatus>;
  const values = Object.values(nodeStatuses);

  let finalStatus: RunStatus;
  if (cancelled || values.includes("cancelled")) finalStatus = "cancelled";
  else if (values.includes("failed")) finalStatus = "failed";
  else finalStatus = "succeeded";

  if (finalStatus === "failed" && !runError) {
    const firstFailed = nodes.find((n) => nodeStatuses[n.id] === "failed");
    if (firstFailed) runError = outputsErrorFor(firstFailed.id);
  }

  emit({
    type: "run:finished",
    runId,
    status: finalStatus,
    error: runError,
    at: Date.now(),
  });

  return {
    status: finalStatus,
    nodeStatuses,
    outputs: Object.fromEntries(outputs),
    error: runError,
  };
}

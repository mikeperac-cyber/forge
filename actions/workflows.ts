"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import {
  archiveWorkflow,
  createWorkflow,
  getWorkflowById,
  renameWorkflow,
  saveGraph,
} from "@/data/workflows";
import { startRun } from "@/lib/engine/run-manager";
import { cancelRun } from "@/lib/engine/bus";
import { getRun, ownsRun } from "@/data/runs";
import { getVersionGraph } from "@/data/versions";
import type { WorkflowGraph } from "@/lib/engine/types";

/**
 * Every action follows the same shape: authenticate, parse with Zod, delegate
 * to `data/` with the user id, revalidate. No action touches Prisma directly,
 * so no action can reach across accounts.
 */

const graphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.object({
        label: z.string().optional(),
        config: z.record(z.string(), z.unknown()).default({}),
        retry: z
          .object({
            maxAttempts: z.number().int().min(1).max(5).optional(),
            retryDelayMs: z.number().int().min(0).max(60_000).optional(),
          })
          .optional(),
      }),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      sourceHandle: z.string().nullish(),
      targetHandle: z.string().nullish(),
    }),
  ),
});

export async function createWorkflowAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  // The field is `required` client-side; falling back keeps the action total
  // rather than returning an error shape a plain form action can't carry.
  const name = String(formData.get("name") ?? "").trim() || "Untitled workflow";

  const workflow = await createWorkflow(userId, {
    name,
    description: String(formData.get("description") ?? "") || undefined,
  });

  revalidatePath("/workflows");
  redirect(`/w/${workflow.slug}`);
}

export async function saveGraphAction(workflowId: string, graph: unknown) {
  const userId = await requireUserId();

  const parsed = graphSchema.safeParse(graph);
  if (!parsed.success) {
    return { ok: false as const, error: "Graph failed validation" };
  }

  const saved = await saveGraph(
    userId,
    workflowId,
    parsed.data as WorkflowGraph,
  );
  if (!saved) return { ok: false as const, error: "Workflow not found" };

  revalidatePath(`/w/${saved.slug}`);
  return { ok: true as const, version: saved.version };
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the workflow a name")
  .max(120);

export async function renameWorkflowAction(workflowId: string, name: string) {
  const userId = await requireUserId();

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  const ok = await renameWorkflow(userId, workflowId, parsed.data);
  revalidatePath("/workflows");
  return { ok };
}

export async function archiveWorkflowAction(workflowId: string) {
  const userId = await requireUserId();
  await archiveWorkflow(userId, workflowId);
  revalidatePath("/workflows");
  redirect("/workflows");
}

export async function runWorkflowAction(workflowId: string) {
  const userId = await requireUserId();

  const workflow = await getWorkflowById(userId, workflowId);
  if (!workflow) return { ok: false as const, error: "Workflow not found" };
  if (workflow.graph.nodes.length === 0) {
    return {
      ok: false as const,
      error: "Nothing to run — the canvas is empty",
    };
  }

  const runId = await startRun({
    workflowId: workflow.id,
    version: workflow.version,
    graph: workflow.graph,
  });

  revalidatePath(`/w/${workflow.slug}`);
  return { ok: true as const, runId };
}

/**
 * Re-run a past run using the graph it actually executed, not whatever the
 * workflow looks like now — otherwise "re-run" quietly means something else
 * every time the canvas is edited.
 *
 * If that snapshot is gone, fall back to the current graph but record the
 * *current* version number, so the run row never claims to be a version it
 * isn't.
 */
export async function rerunAction(runId: string) {
  const userId = await requireUserId();

  const run = await getRun(userId, runId);
  if (!run) return { ok: false as const, error: "Run not found" };

  const snapshot = await getVersionGraph(userId, run.workflowId, run.version);

  let graph = snapshot;
  let version = run.version;

  if (!graph) {
    const workflow = await getWorkflowById(userId, run.workflowId);
    if (!workflow) return { ok: false as const, error: "Workflow not found" };
    graph = workflow.graph;
    version = workflow.version;
  }

  if (graph.nodes.length === 0) {
    return { ok: false as const, error: "That version has no nodes" };
  }

  const newRunId = await startRun({
    workflowId: run.workflowId,
    version,
    graph,
  });

  revalidatePath("/runs");
  return { ok: true as const, runId: newRunId, version };
}

export async function restoreVersionAction(
  workflowId: string,
  version: number,
) {
  const userId = await requireUserId();

  const graph = await getVersionGraph(userId, workflowId, version);
  if (!graph) return { ok: false as const, error: "Version not found" };

  // Restoring is itself a save: the graph being replaced gets archived first,
  // so restoring is undoable rather than destructive.
  const saved = await saveGraph(
    userId,
    workflowId,
    graph,
    `Restored from v${version}`,
  );
  if (!saved) return { ok: false as const, error: "Workflow not found" };

  revalidatePath(`/w/${saved.slug}`);
  revalidatePath(`/w/${saved.slug}/versions`);
  return { ok: true as const, version: saved.version };
}

export async function cancelRunAction(runId: string) {
  const userId = await requireUserId();
  // Ownership first — otherwise a guessed id could abort someone else's run.
  if (!(await ownsRun(userId, runId))) {
    return { ok: false as const, error: "Run not found" };
  }
  return { ok: cancelRun(runId) };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { renameProject, setProjectGoal, setProjectStatus } from "@/data/projects";
import { runAllHarvests, summariseReports } from "@/lib/harvest/run";

/** Authenticate → parse → delegate to `data/` → revalidate. No exceptions. */

/**
 * Linking a project to a goal is what makes observed time count for anything,
 * so these three paths get revalidated together — a goal's number changes the
 * moment its project does.
 */
function revalidateLedger() {
  revalidatePath("/projects");
  revalidatePath("/goals");
  revalidatePath("/today");
}

export async function setProjectGoalAction(
  projectId: string,
  goalId: string | null,
) {
  const userId = await requireUserId();

  // `setProjectGoal` re-checks the goal's owner itself; passing an empty string
  // through as a real id would otherwise fail that check confusingly.
  const ok = await setProjectGoal(userId, projectId, goalId || null);

  revalidateLedger();
  return ok
    ? { ok: true as const }
    : { ok: false as const, error: "That goal doesn't exist" };
}

export async function setProjectStatusAction(projectId: string, status: string) {
  const userId = await requireUserId();
  if (status !== "active" && status !== "archived") {
    return { ok: false as const, error: "Unknown status" };
  }

  const ok = await setProjectStatus(userId, projectId, status);
  revalidateLedger();
  return { ok };
}

const nameSchema = z.string().trim().min(1, "Give the project a name").max(120);

export async function renameProjectAction(projectId: string, name: string) {
  const userId = await requireUserId();

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  const ok = await renameProject(userId, projectId, parsed.data);
  revalidateLedger();
  return { ok };
}

/**
 * Read every registered tool's history and write what's new into the ledger.
 *
 * Safe to run repeatedly: `(tool, sessionRef)` is the idempotency key, so this
 * updates the session you are currently in rather than adding a second copy of
 * it. Nothing outside this app's database is written.
 */
export async function harvestAction() {
  const userId = await requireUserId();

  const reports = await runAllHarvests(userId);
  revalidateLedger();

  const totals = summariseReports(reports);

  // Not an error — it just means none of the tools Forge can read are
  // installed here. Naming them beats a bare "nothing found".
  if (totals.detected === 0) {
    return {
      ok: false as const,
      error: `No history found for ${reports.map((r) => r.tool).join(" or ")}`,
    };
  }

  return {
    ok: true as const,
    created: totals.created,
    updated: totals.updated,
    projects: totals.projects,
    unattributed: totals.unattributed,
    tools: reports.filter((r) => r.detected).map((r) => r.tool),
  };
}

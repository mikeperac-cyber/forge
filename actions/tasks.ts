"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { createTask, deleteTask, setTaskStatus } from "@/data/tasks";
import { browseDirectory, type BrowseListing } from "@/lib/fs-browse";
import { canonicalPath, displayPath } from "@/lib/harvest/paths";

/** Authenticate → parse → delegate to `data/` → revalidate. No exceptions. */

const createInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the task a title")
    .max(200, "Keep the title under 200 characters"),
  note: z.string().trim().max(500).optional(),
  /** Absolute path, original casing — canonicalised below before storage. */
  path: z.string().trim().max(1024).optional(),
  pathKind: z.enum(["file", "folder"]).optional(),
  goalId: z.string().optional(),
});

export async function createTaskAction(formData: FormData) {
  const userId = await requireUserId();

  const parsed = createInput.safeParse({
    title: formData.get("title") ?? "",
    note: formData.get("note") || undefined,
    path: formData.get("path") || undefined,
    pathKind: formData.get("pathKind") || undefined,
    goalId: formData.get("goalId") || undefined,
  });

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  // Two spellings of the same target must collapse to one key, exactly as
  // projects do — `path` matches, `displayPath` is what the row shows.
  const target = parsed.data.path;
  const task = await createTask(userId, {
    title: parsed.data.title,
    note: parsed.data.note,
    path: target ? canonicalPath(target) : null,
    displayPath: target ? displayPath(target) : null,
    pathKind: target ? (parsed.data.pathKind ?? null) : null,
    goalId: parsed.data.goalId,
  });

  if (!task) {
    return { ok: false as const, error: "That goal doesn't exist" };
  }

  revalidatePath("/tasks");
  revalidatePath("/today");
  return { ok: true as const };
}

export async function setTaskStatusAction(
  taskId: string,
  status: "open" | "done",
) {
  const userId = await requireUserId();
  if (status !== "open" && status !== "done") {
    return { ok: false as const, error: "Unknown status" };
  }

  const ok = await setTaskStatus(userId, taskId, status);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return { ok };
}

export async function deleteTaskAction(taskId: string) {
  const userId = await requireUserId();
  const ok = await deleteTask(userId, taskId);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return { ok };
}

/**
 * List a directory for the picker. Read-only, and the only filesystem read
 * reachable from the UI — see `lib/fs-browse.ts`.
 *
 * Failures come back as prose rather than thrown: a permission-denied folder
 * is a normal thing to click, not an error state worth a red toast.
 */
export async function browsePathsAction(
  target: string | null,
): Promise<
  { ok: true; listing: BrowseListing } | { ok: false; error: string }
> {
  await requireUserId();

  try {
    return { ok: true, listing: await browseDirectory(target ?? undefined) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      return { ok: false, error: "No permission to read that folder" };
    }
    if (code === "ENOENT") {
      return { ok: false, error: "That path doesn't exist" };
    }
    if (code === "ENOTDIR") {
      return { ok: false, error: "That's a file, not a folder" };
    }
    return { ok: false, error: "Couldn't read that folder" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { createGoal, deleteGoal, setGoalStatus } from "@/data/goals";
import {
  createBlock,
  deleteBlock,
  startSession,
  stopSession,
} from "@/data/time";

/** Authenticate → parse → delegate to `data/` → revalidate. No exceptions. */

const goalSchema = z.object({
  title: z.string().trim().min(1, "Give the goal a name").max(120),
  why: z.string().trim().max(500).optional(),
  targetDate: z.string().optional(),
  targetHours: z.coerce.number().min(0).max(10000).optional(),
});

export async function createGoalAction(formData: FormData) {
  const userId = await requireUserId();

  const parsed = goalSchema.safeParse({
    title: formData.get("title"),
    why: formData.get("why") || undefined,
    targetDate: formData.get("targetDate") || undefined,
    targetHours: formData.get("targetHours") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  await createGoal(userId, {
    title: parsed.data.title,
    why: parsed.data.why,
    targetDate: parsed.data.targetDate
      ? new Date(parsed.data.targetDate)
      : null,
    // Stored in minutes; entered in hours, which is how people think about it.
    targetMinutes: parsed.data.targetHours
      ? Math.round(parsed.data.targetHours * 60)
      : null,
  });

  revalidatePath("/goals");
  revalidatePath("/today");
  return { ok: true as const };
}

export async function setGoalStatusAction(goalId: string, status: string) {
  const userId = await requireUserId();
  if (status !== "active" && status !== "done" && status !== "archived") {
    return { ok: false as const, error: "Unknown status" };
  }

  const ok = await setGoalStatus(userId, goalId, status);
  revalidatePath("/goals");
  revalidatePath("/today");
  return { ok };
}

export async function deleteGoalAction(goalId: string) {
  const userId = await requireUserId();
  const ok = await deleteGoal(userId, goalId);
  revalidatePath("/goals");
  return { ok };
}

/* ------------------------------------------------------------------ time */

const blockSchema = z.object({
  title: z.string().trim().min(1, "Name the block").max(120),
  date: z.string().min(1, "Pick a date"),
  start: z.string().min(1, "Pick a start time"),
  end: z.string().min(1, "Pick an end time"),
  goalId: z.string().optional(),
});

export async function createBlockAction(formData: FormData) {
  const userId = await requireUserId();

  const parsed = blockSchema.safeParse({
    title: formData.get("title"),
    date: formData.get("date"),
    start: formData.get("start"),
    end: formData.get("end"),
    goalId: formData.get("goalId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  // Parsed as local time — a block at 09:00 means nine in the morning where
  // the person is, not UTC.
  const startsAt = new Date(`${parsed.data.date}T${parsed.data.start}`);
  const endsAt = new Date(`${parsed.data.date}T${parsed.data.end}`);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false as const, error: "That date or time isn't valid" };
  }
  if (endsAt <= startsAt) {
    return {
      ok: false as const,
      error: "The block has to end after it starts",
    };
  }

  const block = await createBlock(userId, {
    title: parsed.data.title,
    startsAt,
    endsAt,
    goalId: parsed.data.goalId || null,
  });
  if (!block) return { ok: false as const, error: "That goal doesn't exist" };

  revalidatePath("/time");
  revalidatePath("/today");
  return { ok: true as const };
}

export async function deleteBlockAction(blockId: string) {
  const userId = await requireUserId();
  const ok = await deleteBlock(userId, blockId);
  revalidatePath("/time");
  revalidatePath("/today");
  return { ok };
}

export async function startSessionAction(input: {
  goalId?: string;
  blockId?: string;
}) {
  const userId = await requireUserId();
  await startSession(userId, {
    goalId: input.goalId ?? null,
    blockId: input.blockId ?? null,
  });
  revalidatePath("/time");
  revalidatePath("/today");
  revalidatePath("/goals");
  return { ok: true as const };
}

export async function stopSessionAction() {
  const userId = await requireUserId();
  const stopped = await stopSession(userId);
  revalidatePath("/time");
  revalidatePath("/today");
  revalidatePath("/goals");
  return { ok: Boolean(stopped) };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import {
  createSchedule,
  deleteSchedule,
  setScheduleEnabled,
} from "@/data/schedules";
import { SCHEDULE_KINDS, configSchemaFor } from "@/lib/schedule";

const kindSchema = z.enum(SCHEDULE_KINDS);

export async function createScheduleAction(
  workflowId: string,
  kind: string,
  config: unknown,
) {
  const userId = await requireUserId();

  const parsedKind = kindSchema.safeParse(kind);
  if (!parsedKind.success) {
    return { ok: false as const, error: "Unknown schedule kind" };
  }

  const parsedConfig = configSchemaFor(parsedKind.data).safeParse(config);
  if (!parsedConfig.success) {
    return {
      ok: false as const,
      error: parsedConfig.error.issues[0].message,
    };
  }

  const schedule = await createSchedule(userId, {
    workflowId,
    kind: parsedKind.data,
    config: parsedConfig.data,
  });
  if (!schedule) return { ok: false as const, error: "Workflow not found" };

  revalidatePath("/schedules");
  return { ok: true as const };
}

export async function setScheduleEnabledAction(
  scheduleId: string,
  enabled: boolean,
) {
  const userId = await requireUserId();
  const ok = await setScheduleEnabled(userId, scheduleId, enabled);
  revalidatePath("/schedules");
  return { ok };
}

export async function deleteScheduleAction(scheduleId: string) {
  const userId = await requireUserId();
  const ok = await deleteSchedule(userId, scheduleId);
  revalidatePath("/schedules");
  return { ok };
}

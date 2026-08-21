"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { deleteSecret, saveSecret } from "@/data/secrets";

// Restricted to a safe identifier charset — `{{secret.NAME}}` parsing in
// lib/secrets.ts depends on a name never containing `}}`, whitespace, or a
// `.`, so this is enforced here rather than left to whatever happened to be
// typed into the field.
const nameSchema = z
  .string()
  .trim()
  .min(1, "Give it a name")
  .max(60)
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only");

const valueSchema = z.string().min(1, "Give it a value").max(10_000);

export async function saveSecretAction(name: string, value: string) {
  const userId = await requireUserId();

  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) {
    return { ok: false as const, error: parsedName.error.issues[0].message };
  }
  const parsedValue = valueSchema.safeParse(value);
  if (!parsedValue.success) {
    return { ok: false as const, error: parsedValue.error.issues[0].message };
  }

  await saveSecret(userId, parsedName.data, parsedValue.data);
  revalidatePath("/secrets");
  return { ok: true as const };
}

export async function deleteSecretAction(secretId: string) {
  const userId = await requireUserId();
  const ok = await deleteSecret(userId, secretId);
  revalidatePath("/secrets");
  return { ok };
}

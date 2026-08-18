"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { demoGraph, DEMO_DESCRIPTION, DEMO_NAME } from "@/lib/demo-workflow";

export type AuthState = { error?: string };

const credentials = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function hasAnyUser(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

/**
 * First-run account creation. Also seeds the demo workflow, so a new account
 * lands on something runnable rather than an empty canvas.
 */
export async function setupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Single-user by design: refuse rather than quietly creating a second account.
  if (await hasAnyUser()) {
    return { error: "An account already exists. Sign in instead." };
  }

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.email.split("@")[0],
      passwordHash: await hash(parsed.data.password, 10),
      workflows: {
        create: {
          name: DEMO_NAME,
          slug: "build-and-notify",
          description: DEMO_DESCRIPTION,
          graph: demoGraph() as never,
        },
      },
    },
  });

  await createSession(user.id);
  redirect("/today");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });

  // Same message either way, so this can't be used to enumerate accounts.
  const ok = user ? await compare(password, user.passwordHash) : false;
  if (!user || !ok) return { error: "Incorrect email or password" };

  await createSession(user.id);
  redirect("/today");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

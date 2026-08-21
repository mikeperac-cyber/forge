import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

/**
 * Same rule as everywhere else in `data/`: `userId` first, filtered on. The
 * one thing this file is stricter about than its neighbours: no function
 * here returns a secret's plaintext except `loadDecryptedSecrets`, and that
 * one is called from exactly one place — right before a run starts — never
 * from anything that could put a value in front of the browser.
 */

export interface SecretSummary {
  id: string;
  name: string;
  updatedAt: Date;
}

/** Names and timestamps only — see the module note on why. */
export async function listSecrets(userId: string): Promise<SecretSummary[]> {
  return prisma.secret.findMany({
    where: { userId },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Create or overwrite by name. Upsert rather than requiring a separate
 * "rename" concept — a secret's identity is its name, and replacing the
 * value under an existing name is the whole point of rotating a key.
 */
export async function saveSecret(userId: string, name: string, value: string) {
  const { ciphertext, iv } = encryptSecret(value);
  return prisma.secret.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name, ciphertext, iv },
    update: { ciphertext, iv },
  });
}

export async function deleteSecret(userId: string, secretId: string) {
  const result = await prisma.secret.deleteMany({
    where: { id: secretId, userId },
  });
  return result.count > 0;
}

/**
 * Every one of this account's secrets, decrypted, keyed by name — the shape
 * `resolveSecrets`/`redactSecrets` in `lib/secrets.ts` expect. Called once
 * per run, before it starts, and threaded through as plain data from there;
 * nothing downstream re-reads this table mid-run.
 */
export async function loadDecryptedSecrets(
  userId: string,
): Promise<Record<string, string>> {
  const rows = await prisma.secret.findMany({ where: { userId } });
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.name] = decryptSecret({ ciphertext: row.ciphertext, iv: row.iv });
  }
  return out;
}

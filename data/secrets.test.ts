import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  deleteSecret,
  listSecrets,
  loadDecryptedSecrets,
  saveSecret,
} from "@/data/secrets";

describe("secrets (integration)", () => {
  let userId: string;
  let otherUserId: string;
  const secretIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    userId = user!.id;

    const other = await prisma.user.create({
      data: {
        email: `secret-test-${Date.now()}@local`,
        name: "Secret fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;
  });

  afterAll(async () => {
    await prisma.secret.deleteMany({ where: { id: { in: secretIds } } });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  it("saves a secret encrypted, never storing the plaintext", async () => {
    const secret = await saveSecret(userId, "TEST_API_KEY", "sk-fixture-value");
    secretIds.push(secret.id);

    const row = await prisma.secret.findUnique({ where: { id: secret.id } });
    expect(row!.ciphertext).not.toContain("sk-fixture-value");
  });

  it("lists names and timestamps only, never the value", async () => {
    const secrets = await listSecrets(userId);
    const mine = secrets.find((s) => s.name === "TEST_API_KEY");

    expect(mine).toBeTruthy();
    expect(mine).not.toHaveProperty("value");
    expect(mine).not.toHaveProperty("ciphertext");
  });

  it("decrypts back to the original value for use at run time", async () => {
    const decrypted = await loadDecryptedSecrets(userId);
    expect(decrypted.TEST_API_KEY).toBe("sk-fixture-value");
  });

  it("only decrypts this account's secrets, never another's", async () => {
    const decrypted = await loadDecryptedSecrets(otherUserId);
    expect(decrypted.TEST_API_KEY).toBeUndefined();
  });

  it("saving under the same name again replaces the value — rotation, not duplication", async () => {
    const before = await listSecrets(userId);
    const countBefore = before.length;

    await saveSecret(userId, "TEST_API_KEY", "sk-rotated-value");

    const after = await listSecrets(userId);
    expect(after.length).toBe(countBefore);

    const decrypted = await loadDecryptedSecrets(userId);
    expect(decrypted.TEST_API_KEY).toBe("sk-rotated-value");
  });

  it("will not delete another account's secret", async () => {
    const mine = (await listSecrets(userId)).find(
      (s) => s.name === "TEST_API_KEY",
    )!;

    expect(await deleteSecret(otherUserId, mine.id)).toBe(false);
    expect((await listSecrets(userId)).some((s) => s.id === mine.id)).toBe(
      true,
    );
  });

  it("deletes the secret for its own account", async () => {
    const mine = (await listSecrets(userId)).find(
      (s) => s.name === "TEST_API_KEY",
    )!;

    expect(await deleteSecret(userId, mine.id)).toBe(true);
    expect((await listSecrets(userId)).some((s) => s.id === mine.id)).toBe(
      false,
    );
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSession, getSessionUserId } from "./session";

// Mock next/headers cookies
const cookieStore = new Map<
  string,
  { value: string; [key: string]: unknown }
>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieStore.get(name),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieStore.set(name, { value, ...options });
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

describe("session secret & authentication", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    cookieStore.clear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("succeeds creating and verifying session when AUTH_SECRET is set (>= 16 chars)", async () => {
    process.env.AUTH_SECRET = "super-secret-key-1234567890";
    await createSession("user-123");
    const userId = await getSessionUserId();
    expect(userId).toBe("user-123");
  });

  it("throws error when AUTH_SECRET is not set", async () => {
    delete process.env.AUTH_SECRET;
    await expect(createSession("user-123")).rejects.toThrow(
      "AUTH_SECRET must be set (at least 16 characters).",
    );
  });

  it("throws error when AUTH_SECRET is shorter than 16 characters", async () => {
    process.env.AUTH_SECRET = "too-short";
    await expect(createSession("user-123")).rejects.toThrow(
      "AUTH_SECRET must be set (at least 16 characters).",
    );
  });
});

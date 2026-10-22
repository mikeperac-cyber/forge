import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, getSessionUserId } from "./session";

interface MockCookieEntry {
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: string;
    secure: boolean;
    path: string;
    maxAge: number;
  };
}

// Mock next/headers
const mockCookiesStore = new Map<string, MockCookieEntry>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mockCookiesStore.get(name),
    set: (name: string, value: string, options: MockCookieEntry["options"]) => {
      mockCookiesStore.set(name, { value, options });
    },
    delete: (name: string) => {
      mockCookiesStore.delete(name);
    },
  }),
}));

describe("session cookie security", () => {
  beforeEach(() => {
    mockCookiesStore.clear();
    vi.unstubAllEnvs();
    vi.stubEnv("AUTH_SECRET", "test-secret-at-least-16-chars");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("marks cookie as secure by default in development (NODE_ENV != production)", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await createSession("user-123");
    const cookieEntry = mockCookiesStore.get("forge_session");

    expect(cookieEntry).toBeDefined();
    expect(cookieEntry?.options.secure).toBe(true);
  });

  it("marks cookie as secure by default in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await createSession("user-123");
    const cookieEntry = mockCookiesStore.get("forge_session");

    expect(cookieEntry).toBeDefined();
    expect(cookieEntry?.options.secure).toBe(true);
  });

  it("allows insecure cookie when FORGE_ALLOW_INSECURE_COOKIE=1", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FORGE_ALLOW_INSECURE_COOKIE", "1");

    await createSession("user-123");
    const cookieEntry = mockCookiesStore.get("forge_session");

    expect(cookieEntry).toBeDefined();
    expect(cookieEntry?.options.secure).toBe(false);
  });

  it("successfully verifies session token created with createSession", async () => {
    await createSession("user-456");
    const userId = await getSessionUserId();
    expect(userId).toBe("user-456");
  });
});

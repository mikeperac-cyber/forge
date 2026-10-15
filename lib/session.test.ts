import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCookieStore = new Map<string, { value: string; options?: any }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const entry = mockCookieStore.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: any) => {
      mockCookieStore.set(name, { value, options });
    },
    delete: (name: string) => {
      mockCookieStore.delete(name);
    },
  })),
}));

import {
  createSession,
  destroySession,
  getSessionUserId,
  requireUserId,
} from "./session";

describe("session verification and lifecycle", () => {
  beforeEach(() => {
    mockCookieStore.clear();
    process.env.AUTH_SECRET = "super-secret-key-at-least-16-chars";
  });

  describe("getSessionUserId", () => {
    it("returns null when no session cookie exists", async () => {
      const userId = await getSessionUserId();
      expect(userId).toBeNull();
    });

    it("returns null when session cookie is empty string", async () => {
      mockCookieStore.set("forge_session", { value: "" });
      const userId = await getSessionUserId();
      expect(userId).toBeNull();
    });

    it("returns null when token lacks a dot separator", async () => {
      mockCookieStore.set("forge_session", { value: "invalidtokenwithoutdot" });
      const userId = await getSessionUserId();
      expect(userId).toBeNull();
    });

    it("returns null when token starts with a dot (index <= 0)", async () => {
      mockCookieStore.set("forge_session", { value: ".somesignature" });
      const userId = await getSessionUserId();
      expect(userId).toBeNull();
    });

    it("returns null when token ends with a dot", async () => {
      mockCookieStore.set("forge_session", { value: "user123." });
      const userId = await getSessionUserId();
      expect(userId).toBeNull();
    });

    it("returns null when signature is completely invalid", async () => {
      mockCookieStore.set("forge_session", { value: "user123.invalidsignature" });
      const userId = await getSessionUserId();
      expect(userId).toBeNull();
    });

    it("returns null when signature has correct length but tampered characters", async () => {
      await createSession("user123");
      const raw = mockCookieStore.get("forge_session")!.value;
      const index = raw.lastIndexOf(".");
      const userIdPart = raw.slice(0, index);
      const signaturePart = raw.slice(index + 1);

      // Flip the last character of signature to preserve length but alter HMAC
      const tamperedChar = signaturePart[signaturePart.length - 1] === "a" ? "b" : "a";
      const tamperedSignature = signaturePart.slice(0, -1) + tamperedChar;
      mockCookieStore.set("forge_session", { value: `${userIdPart}.${tamperedSignature}` });

      const result = await getSessionUserId();
      expect(result).toBeNull();
    });

    it("returns null when userId is tampered using another valid signature", async () => {
      await createSession("user123");
      const raw1 = mockCookieStore.get("forge_session")!.value;
      const sig1 = raw1.slice(raw1.lastIndexOf(".") + 1);

      // Attach user123's signature to user456
      mockCookieStore.set("forge_session", { value: `user456.${sig1}` });

      const result = await getSessionUserId();
      expect(result).toBeNull();
    });

    it("returns userId when token and signature are valid", async () => {
      await createSession("usr_abc123");
      const result = await getSessionUserId();
      expect(result).toEqual("usr_abc123");
    });

    it("handles userIds with multiple dots correctly", async () => {
      await createSession("user.with.dots.in.id");
      const result = await getSessionUserId();
      expect(result).toEqual("user.with.dots.in.id");
    });
  });

  describe("createSession", () => {
    it("sets the forge_session cookie with appropriate options", async () => {
      await createSession("user_test");
      const cookie = mockCookieStore.get("forge_session");
      expect(cookie).toBeDefined();
      expect(cookie!.value).toMatch(/^user_test\.[A-Za-z0-9_-]+$/);
      expect(cookie!.options).toEqual({
        httpOnly: true,
        sameSite: "lax",
        secure: false, // process.env.NODE_ENV is test
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    });
  });

  describe("destroySession", () => {
    it("deletes the forge_session cookie", async () => {
      await createSession("user_to_delete");
      expect(mockCookieStore.has("forge_session")).toBe(true);

      await destroySession();
      expect(mockCookieStore.has("forge_session")).toBe(false);

      const userId = await getSessionUserId();
      expect(userId).toBeNull();
    });
  });

  describe("requireUserId", () => {
    it("returns userId when a valid session exists", async () => {
      await createSession("usr_valid");
      const userId = await requireUserId();
      expect(userId).toEqual("usr_valid");
    });

    it("throws UNAUTHENTICATED error when session is missing or invalid", async () => {
      await expect(requireUserId()).rejects.toThrow("UNAUTHENTICATED");

      mockCookieStore.set("forge_session", { value: "badtoken" });
      await expect(requireUserId()).rejects.toThrow("UNAUTHENTICATED");
    });
  });
});

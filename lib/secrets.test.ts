import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  redactSecrets,
  referencedSecretNames,
  resolveSecrets,
} from "./secrets";

describe("encryptSecret / decryptSecret", () => {
  const originalSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-only-secret-not-a-real-one-0123456789";
  });

  afterEach(() => {
    process.env.AUTH_SECRET = originalSecret;
  });

  it("round-trips a value through encryption and decryption", () => {
    const encrypted = encryptSecret("sk-super-secret-api-key");
    expect(decryptSecret(encrypted)).toBe("sk-super-secret-api-key");
  });

  it("never stores the plaintext inside the ciphertext or iv fields", () => {
    const encrypted = encryptSecret("sk-super-secret-api-key");
    expect(encrypted.ciphertext).not.toContain("sk-super-secret-api-key");
    expect(encrypted.iv).not.toContain("sk-super-secret-api-key");
  });

  it("uses a fresh IV per call, so the same plaintext never encrypts identically twice", () => {
    const a = encryptSecret("same value");
    const b = encryptSecret("same value");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses to decrypt if the ciphertext was tampered with", () => {
    const encrypted = encryptSecret("sk-super-secret-api-key");
    // Flip a character in the middle of the ciphertext — GCM's auth tag must
    // catch this rather than silently returning corrupted plaintext.
    const tampered = {
      ...encrypted,
      ciphertext:
        encrypted.ciphertext.slice(0, 10) +
        (encrypted.ciphertext[10] === "A" ? "B" : "A") +
        encrypted.ciphertext.slice(11),
    };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws a clear error rather than silently using an insecure key when AUTH_SECRET is unset", () => {
    delete process.env.AUTH_SECRET;
    expect(() => encryptSecret("anything")).toThrow(/AUTH_SECRET/);
  });
});

describe("referencedSecretNames", () => {
  it("finds every {{secret.NAME}} reference", () => {
    expect(
      referencedSecretNames(
        "Authorization: Bearer {{secret.API_KEY}}, X-Client: {{secret.CLIENT_ID}}",
      ),
    ).toEqual(["API_KEY", "CLIENT_ID"]);
  });

  it("tolerates extra whitespace inside the braces", () => {
    expect(referencedSecretNames("{{  secret.API_KEY  }}")).toEqual([
      "API_KEY",
    ]);
  });

  it("returns nothing for text with no reference", () => {
    expect(referencedSecretNames("nothing to see here")).toEqual([]);
  });
});

describe("resolveSecrets", () => {
  it("substitutes a known secret", () => {
    expect(
      resolveSecrets("Bearer {{secret.API_KEY}}", { API_KEY: "sk-real-value" }),
    ).toBe("Bearer sk-real-value");
  });

  it("leaves an unknown reference as the literal placeholder, not blank", () => {
    expect(resolveSecrets("Bearer {{secret.MISSING}}", {})).toBe(
      "Bearer {{secret.MISSING}}",
    );
  });

  it("resolves multiple distinct references in one pass", () => {
    expect(
      resolveSecrets("{{secret.A}}-{{secret.B}}", { A: "1", B: "2" }),
    ).toBe("1-2");
  });
});

describe("redactSecrets", () => {
  it("replaces every occurrence of a secret value with a placeholder", () => {
    expect(
      redactSecrets("Authorization: Bearer sk-real-value", {
        API_KEY: "sk-real-value",
      }),
    ).toBe("Authorization: Bearer [secret]");
  });

  it("catches a secret value anywhere in the text, not just where it was substituted", () => {
    // The point of value-based redaction: it doesn't matter *how* the value
    // got into the text, only that it's there.
    expect(
      redactSecrets("echo sk-real-value | curl", { X: "sk-real-value" }),
    ).toBe("echo [secret] | curl");
  });

  it("leaves text with no secret values untouched", () => {
    expect(
      redactSecrets("nothing sensitive here", { X: "sk-real-value" }),
    ).toBe("nothing sensitive here");
  });

  it("does not choke on an empty secret value", () => {
    expect(() => redactSecrets("some text", { EMPTY: "" })).not.toThrow();
    expect(redactSecrets("some text", { EMPTY: "" })).toBe("some text");
  });
});

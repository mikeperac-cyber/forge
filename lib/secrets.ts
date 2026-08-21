import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Encryption, and the `{{secret.NAME}}` reference syntax nodes use instead of
 * a plaintext value.
 *
 * Deliberately not `lib/session.ts`'s `secret()`: that function falls back to
 * a random-per-process value when `AUTH_SECRET` is unset, which is a fine
 * trade for session signing (worst case, a dev restart logs you out) and a
 * disastrous one for an encryption key (every secret ever saved would become
 * permanently undecryptable the next time `npm run dev` restarts). Encrypted
 * storage needs a key that cannot silently change out from under it, so this
 * requires the real environment variable rather than inheriting that
 * fallback.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard.
const AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET must be set (at least 16 characters) to use secrets storage.",
    );
  }
  // HKDF derives an independent 32-byte key from AUTH_SECRET rather than
  // reusing those bytes directly — compromising the derived encryption key
  // this way doesn't hand over whatever else AUTH_SECRET protects, and vice
  // versa. The info string is the domain separator between them.
  return Buffer.from(hkdfSync("sha256", secret, "", "forge-secrets-v1", 32));
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  // GCM's auth tag proves the ciphertext wasn't tampered with; stored
  // alongside rather than as its own column, since it only ever travels with
  // the ciphertext it belongs to.
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptSecret(encrypted: EncryptedSecret): string {
  const key = deriveKey();
  const raw = Buffer.from(encrypted.ciphertext, "base64");
  const ciphertext = raw.subarray(0, raw.length - AUTH_TAG_LENGTH);
  const authTag = raw.subarray(raw.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Matches `{{secret.NAME}}` — same brace-placeholder shape `ai.ts` already
 * uses for `{{input}}`, just namespaced so the two can never collide. */
const SECRET_REF = /\{\{\s*secret\.([a-zA-Z0-9_]+)\s*\}\}/g;

/** Which secret names a piece of config text actually references. */
export function referencedSecretNames(text: string): string[] {
  return [...text.matchAll(SECRET_REF)].map((m) => m[1]);
}

/**
 * Substitutes every `{{secret.NAME}}` with the real value. A name with no
 * matching secret is left as the literal placeholder rather than becoming an
 * empty string — a silently-blank credential fails in a way that looks like
 * anything else going wrong, where the untouched placeholder at least says
 * what's missing.
 */
export function resolveSecrets(
  text: string,
  secrets: Record<string, string>,
): string {
  return text.replace(SECRET_REF, (match, name: string) =>
    Object.hasOwn(secrets, name) ? secrets[name] : match,
  );
}

/**
 * Scrubs any resolved secret *value* out of a piece of text — for logging,
 * never for the request/prompt actually built from `resolveSecrets`. This is
 * value-based rather than placeholder-based on purpose: it catches a secret
 * anywhere it ended up, not just the exact spot it was substituted, without
 * every executor needing to separately track "the raw version" of every
 * field it logs.
 */
export function redactSecrets(
  text: string,
  secrets: Record<string, string>,
): string {
  let result = text;
  for (const value of Object.values(secrets)) {
    if (!value) continue;
    result = result.split(value).join("[secret]");
  }
  return result;
}

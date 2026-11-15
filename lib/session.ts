import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A deliberately small session layer.
 *
 * This is a local, single-user desktop tool, so it carries an HMAC-signed
 * cookie holding a user id rather than a full auth framework. That is a
 * considered trade: it avoids pinning a beta auth library to a brand-new Next
 * major, and the surface it replaces is one cookie. The cookie exists to keep
 * the sidecar honest about *who* is asking even though the only client is the
 * app's own webview; if this ever grows multi-user, swap in Auth.js —
 * `requireUser()` is the only seam that matters.
 */

const COOKIE = "forge_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  throw new Error("AUTH_SECRET must be set (at least 16 characters).");
}

/**
 * The session cookie is never marked `Secure`, because the transport is always
 * plain HTTP on the loopback interface: the Tauri shell serves the webview
 * from `http://127.0.0.1:<ephemeral>` and the port dies with the process. A
 * `Secure` cookie would be silently dropped and every login would bounce back
 * to /login with no error anywhere — genuinely horrible to debug, and now
 * structurally impossible. This is safe *only* while the server binds to
 * 127.0.0.1; anything else must revisit this line.
 */
function secureCookie(): boolean {
  return false;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function verify(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId: string): Promise<void> {
  const token = `${userId}.${sign(userId)}`;
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** The signed-in user's id, or null. Never throws. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;

  const index = raw.lastIndexOf(".");
  if (index <= 0) return null;

  const userId = raw.slice(0, index);
  const signature = raw.slice(index + 1);
  return verify(userId, signature) ? userId : null;
}

/**
 * The authorization entry point. Every Server Action and page that touches
 * user data starts here, and passes the result into the `data/` layer — which
 * filters on it. Nothing in `data/` is reachable without a user id.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("UNAUTHENTICATED");
  return userId;
}

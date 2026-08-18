import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * A deliberately small session layer.
 *
 * This is a local, single-user tool, so it carries an HMAC-signed cookie
 * holding a user id rather than a full auth framework. That is a considered
 * trade: it avoids pinning a beta auth library to a brand-new Next major, and
 * the surface it replaces is one cookie. If this ever grows multi-user or goes
 * on a network, swap in Auth.js — `requireUser()` is the only seam that matters.
 */

const COOKIE = "forge_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET must be set (at least 16 characters) outside development.",
    );
  }
  // Dev-only fallback so `npm run dev` works before .env is filled in. It is
  // stable per process, so restarting the dev server logs you out.
  return ((globalThis as { __forgeDevSecret?: string }).__forgeDevSecret ??=
    randomBytes(32).toString("hex"));
}

/**
 * Whether to mark the session cookie `Secure`.
 *
 * A `Secure` cookie is only ever sent over HTTPS. Serve a production build on a
 * tailnet or LAN over plain `http://` with this on and the browser quietly
 * discards the session — every login redirects straight back to the login page,
 * with no error in the console, the server log, or anywhere else. It is a
 * genuinely horrible thing to debug.
 *
 * The default stays on, because the right answer is to serve HTTPS: `tailscale
 * serve` issues a real certificate for `<machine>.<tailnet>.ts.net` and needs
 * no change here. `FORGE_ALLOW_INSECURE_COOKIE=1` is the deliberate escape
 * hatch for plain HTTP on a trusted private network — never on the internet,
 * where it would put the session token on the wire in clear text.
 */
function secureCookie(): boolean {
  if (process.env.FORGE_ALLOW_INSECURE_COOKIE === "1") return false;
  return process.env.NODE_ENV === "production";
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

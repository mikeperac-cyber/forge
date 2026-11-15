/**
 * Server-startup hook. In the packaged desktop app the sidecar is the only
 * long-lived process there is, so it also hosts the background jobs —
 * `FORGE_DESKTOP=1` is set by the Tauri shell when it spawns this server
 * (src-tauri/src/main.rs). Plain `npm run dev` does not start them: firing
 * workflows from a dev-reloading process is exactly the hazard the old
 * external poller existed to work around.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.FORGE_DESKTOP === "1"
  ) {
    // In-place upgrades keep their old database file, and the packaged sidecar
    // has no Prisma CLI — this is where the new tables come from.
    const { ensureSchema } = await import("@/lib/db-bootstrap");
    await ensureSchema();

    const { startBackgroundJobs } = await import("@/lib/jobs");
    startBackgroundJobs();
  }
}

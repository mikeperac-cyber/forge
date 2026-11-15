import "server-only";
import { prisma } from "@/lib/db";

/**
 * Bring an existing packaged database up to the current schema.
 *
 * The desktop app ships a schema-only template and copies it on *first* run.
 * An install created by an earlier build therefore keeps an older file, and
 * the packaged sidecar has no Prisma CLI to run `db push` with. This is that
 * missing step: idempotent DDL for tables added after the first release, run
 * once at startup before any request can touch them.
 *
 * Deliberately limited to *new tables and indexes*. Columns added to an
 * existing table need a real migration strategy (SQLite's `ADD COLUMN` with
 * backfill), so when that day comes this file is where it starts — but it is
 * not a general migration runner, and pretending otherwise would be worse than
 * keeping the scope honest.
 *
 * Generated from `prisma migrate diff --from-empty --to-schema`; keep the two
 * in step. If this ever grows past a handful of statements, adopt Prisma
 * Migrate (`prisma migrate deploy`) and bundle the CLI instead.
 */
export async function ensureSchema(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Task" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "note" TEXT,
      "status" TEXT NOT NULL DEFAULT 'open',
      "path" TEXT,
      "displayPath" TEXT,
      "pathKind" TEXT,
      "goalId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "completedAt" DATETIME,
      CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Task_userId_status_idx" ON "Task"("userId", "status")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Task_userId_path_idx" ON "Task"("userId", "path")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Task_goalId_idx" ON "Task"("goalId")`,
  );
}

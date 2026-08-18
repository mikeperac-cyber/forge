-- AlterTable
ALTER TABLE "Session" ADD COLUMN "minutes" INTEGER;

-- CreateIndex
CREATE INDEX "Session_goalId_idx" ON "Session"("goalId");

-- Backfill every session that already finished.
--
-- Without this every historical session reads NULL, contributes nothing to
-- SUM("minutes"), and every goal's claimed time silently drops to zero — the
-- kind of migration failure that looks like a feature working correctly.
--
-- Prisma stores DateTime in SQLite as ISO-8601 TEXT, so julianday() parses it
-- and the difference is in days; 1440 converts to minutes. MAX(0, …) and
-- ROUND() reproduce the JavaScript `minutesBetween` exactly, so backfilled rows
-- agree with rows written from now on.
--
-- SQLite-specific, which is fine: a migration only ever runs against the
-- database it was generated for. The *schema* stays portable, which is why
-- this value is stored rather than computed at query time.
UPDATE "Session"
SET "minutes" = MAX(
  0,
  CAST(ROUND((julianday("endedAt") - julianday("startedAt")) * 1440) AS INTEGER)
)
WHERE "endedAt" IS NOT NULL AND "minutes" IS NULL;

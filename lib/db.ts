import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client";

/**
 * Prisma 7 connects through a driver adapter rather than a connection string,
 * which is convenient here: moving to Postgres later swaps this one import for
 * `@prisma/adapter-pg` and flips the schema's `provider`. Nothing else changes.
 *
 * One client per process — Next re-evaluates modules on every hot reload, so
 * without the global cache you leak a pool per edit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

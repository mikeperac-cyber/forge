import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { demoGraph, DEMO_DESCRIPTION, DEMO_NAME } from "../lib/demo-workflow";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

async function main() {
  const email = process.env.SEED_EMAIL ?? "dev@local";
  const password = process.env.SEED_PASSWORD ?? "forge-dev";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists — nothing to do.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: "Developer",
      passwordHash: await hash(password, 10),
      workflows: {
        create: {
          name: DEMO_NAME,
          slug: "build-and-notify",
          description: DEMO_DESCRIPTION,
          graph: demoGraph() as never,
        },
      },
    },
    include: { workflows: true },
  });

  console.log(`Seeded ${user.email} with "${user.workflows[0].name}".`);
  console.log(`Password: ${password}  (override with SEED_PASSWORD)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

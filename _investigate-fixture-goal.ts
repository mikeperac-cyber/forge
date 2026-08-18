import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

async function main() {
  const goals = await prisma.goal.findMany({
    where: { title: "Ledger fixture goal" },
    include: {
      projects: true,
      blocks: true,
      sessions: true,
      user: { select: { id: true, email: true, createdAt: true } },
    },
  });

  console.log(`Found ${goals.length} goal(s) titled "Ledger fixture goal"\n`);
  for (const g of goals) {
    console.log(JSON.stringify(g, null, 2));
  }

  const allGoalTitles = await prisma.goal.findMany({
    select: { id: true, title: true, userId: true },
  });
  console.log(
    `\nAll ${allGoalTitles.length} goals in dev.db (id, title, userId):`,
  );
  for (const g of allGoalTitles) {
    console.log(`  ${g.id}  ${JSON.stringify(g.title)}  user=${g.userId}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

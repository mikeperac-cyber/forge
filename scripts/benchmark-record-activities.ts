import "dotenv/config";
import { performance } from "node:perf_hooks";
import { prisma } from "../lib/db";
import { recordActivities } from "../data/projects";
import type { RawActivity } from "../lib/harvest/types";

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error("No user found. Please seed the database first.");
    process.exit(1);
  }

  const numTools = 50;
  const refsPerTool = 10;
  const activities: RawActivity[] = [];

  for (let t = 0; t < numTools; t++) {
    const tool = `bench-tool-${t}`;
    for (let r = 0; r < refsPerTool; r++) {
      activities.push({
        tool,
        sessionRef: `bench-ref-${r}`,
        path:
          process.platform === "win32" ? "C:\\bench_project" : "/bench_project",
        displayPath:
          process.platform === "win32" ? "C:\\bench_project" : "/bench_project",
        startedAt: new Date("2026-08-16T09:00:00Z"),
        endedAt: new Date("2026-08-16T10:00:00Z"),
        activeMinutes: 30,
        messageCount: 10,
      });
    }
  }

  console.log(
    `Benchmarking recordActivities with ${activities.length} activities across ${numTools} tools...`,
  );

  // Warmup run
  await recordActivities(user.id, activities);

  const iterations = 10;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await recordActivities(user.id, activities);
  }
  const end = performance.now();

  const totalMs = end - start;
  const avgMs = totalMs / iterations;

  console.log(
    `Total time for ${iterations} iterations: ${totalMs.toFixed(2)}ms`,
  );
  console.log(`Average time per call: ${avgMs.toFixed(2)}ms`);

  // Cleanup benchmark activities
  await prisma.activity.deleteMany({
    where: { userId: user.id, tool: { startsWith: "bench-tool-" } },
  });
  await prisma.project.deleteMany({
    where: {
      userId: user.id,
      path:
        process.platform === "win32" ? "c:\\bench_project" : "/bench_project",
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

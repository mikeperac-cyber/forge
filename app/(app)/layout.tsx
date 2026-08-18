import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import { listWorkflows } from "@/data/workflows";
import { countActiveGoals } from "@/data/goals";
import { getRunningSession } from "@/data/time";
import { listRuns } from "@/data/runs";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/shell/AppShell";

/**
 * The session guard for everything inside the shell. Pages below this can
 * assume a user, but they still pass the id into `data/` explicitly — the guard
 * proves *who*, the data layer enforces *what*.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  // A valid signature over a deleted user — treat as signed out.
  if (!user) redirect("/login");

  const [workflows, recentRuns, activeGoals, running] = await Promise.all([
    listWorkflows(userId),
    listRuns(userId, { limit: 6 }),
    countActiveGoals(userId),
    getRunningSession(userId),
  ]);

  return (
    <AppShell
      userEmail={user.email}
      userName={user.name}
      activeGoals={activeGoals}
      runningSession={
        running
          ? {
              id: running.id,
              startedAt: running.startedAt.toISOString(),
              label:
                running.goal?.title ??
                running.block?.title ??
                "Untracked session",
            }
          : null
      }
      workflows={workflows.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        nodeCount: w.nodeCount,
        lastRunStatus: w.lastRun?.status ?? null,
      }))}
      recentRuns={recentRuns.map((r) => ({
        id: r.id,
        status: r.status,
        workflowName: r.workflow.name,
        startedAt: r.startedAt.toISOString(),
      }))}
    >
      {children}
    </AppShell>
  );
}

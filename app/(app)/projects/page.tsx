import { requireUserId } from "@/lib/session";
import { listHarvestState, listProjects } from "@/data/projects";
import { listGoalOptions } from "@/data/goals";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";
import { formatRelative } from "@/lib/status";
import {
  ArchiveButton,
  GoalPicker,
  HarvestButton,
  ProjectName,
} from "@/components/projects/ProjectControls";

function hm(minutes: number): string {
  if (minutes === 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * The ledger, and the one thing you can do to it.
 *
 * A project arrives here on its own — the harvester creates it the first time a
 * transcript names its folder. The only decision left to a person is which goal
 * the time counts toward, which is why that control is the prominent one and
 * everything else is read-only.
 */
export default async function ProjectsPage() {
  const userId = await requireUserId();

  const [projects, goalOptions, harvests] = await Promise.all([
    listProjects(userId),
    listGoalOptions(userId),
    listHarvestState(userId),
  ]);

  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status !== "active");

  const observed = projects.reduce((total, p) => total + p.activeMinutes, 0);
  const counted = active
    .filter((p) => p.goal)
    .reduce((total, p) => total + p.activeMinutes, 0);

  const lastHarvest = harvests.reduce<Date | null>(
    (latest, h) =>
      h.lastHarvestedAt && (!latest || h.lastHarvestedAt > latest)
        ? h.lastHarvestedAt
        : latest,
    null,
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Activity"
        title="Projects"
        meta={
          <span>
            {active.length} active
            {archived.length > 0 && ` · ${archived.length} archived`}
            {lastHarvest && ` · harvested ${formatRelative(lastHarvest)}`}
          </span>
        }
        actions={<HarvestButton />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5">
          {projects.length === 0 ? (
            <div className="mt-8 text-center">
              <h2 className="font-serif text-[19px] italic text-ink">
                Nothing harvested yet.
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-[13px] text-ink-soft">
                Press <strong className="font-bold text-ink">Harvest</strong> and
                Forge will read your AI tools&rsquo; own histories to work out
                which folders you&rsquo;ve been working in, and for how long.
                Transcripts are only ever read.
              </p>
            </div>
          ) : (
            <>
              {/* The headline the page exists to answer: of the time that was
                  observed, how much is actually counting toward something? */}
              <section className="rounded-lg border border-line bg-panel p-3">
                <p className="font-serif text-[17px] italic leading-snug text-ink">
                  {counted === 0
                    ? "None of this time counts toward a goal yet."
                    : counted === observed
                      ? `All ${hm(observed)} counts toward a goal.`
                      : `${hm(counted)} of ${hm(observed)} counts toward a goal.`}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-soft">
                  Point a project at a goal and its observed time starts showing
                  up there. Nothing is counted twice — observed time is kept
                  separate from time you track by hand.
                </p>
              </section>

              <ul className="mt-4 space-y-1.5">
                {active.map((project) => (
                  <li
                    key={project.id}
                    className="rounded-lg border border-line px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <ProjectName
                          projectId={project.id}
                          name={project.name}
                          className="text-[13.5px] font-bold text-ink"
                        />
                        <p
                          className="truncate font-mono text-[11px] text-ink-faint"
                          title={project.displayPath}
                        >
                          {project.displayPath}
                        </p>
                      </div>

                      <GoalPicker
                        projectId={project.id}
                        goalId={project.goal?.id ?? null}
                        goals={goalOptions}
                      />
                      <ArchiveButton
                        projectId={project.id}
                        status={project.status}
                      />
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-faint">
                      <span className="font-mono tabular-nums text-ink-soft">
                        {hm(project.activeMinutes)}
                      </span>
                      <span>observed</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {project.sessionCount} session
                        {project.sessionCount === 1 ? "" : "s"}
                      </span>
                      {project.lastActiveAt && (
                        <span className="ml-auto">
                          last {formatRelative(project.lastActiveAt)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {archived.length > 0 && (
                <section className="pt-5">
                  <h2 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-faint">
                    Archived
                  </h2>
                  <ul className="mt-1.5 space-y-1">
                    {archived.map((project) => (
                      <li
                        key={project.id}
                        className="flex items-center gap-2.5 rounded border border-line px-3 py-1.5"
                      >
                        <Icon
                          name="FolderOpen"
                          className="size-3.5 text-ink-faint"
                        />
                        <span className="min-w-0 flex-1">
                          <ProjectName
                            projectId={project.id}
                            name={project.name}
                            className="text-[13px] text-ink-soft"
                          />
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                          {hm(project.activeMinutes)}
                        </span>
                        <ArchiveButton
                          projectId={project.id}
                          status={project.status}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

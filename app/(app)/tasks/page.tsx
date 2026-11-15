import { requireUserId } from "@/lib/session";
import { listTasks } from "@/data/tasks";
import { listGoalOptions } from "@/data/goals";
import { PageHeader, Icon } from "@/components/shell";
import {
  DeleteTaskButton,
  TaskForm,
  TaskStatusButton,
} from "@/components/tasks/TaskControls";

/**
 * Tasks: what to do, and where.
 *
 * A task may point at a file or a folder, but the pointer is only ever a
 * reference — this page never writes, moves or deletes anything on disk. That
 * constraint is the feature: a list you can point at a working directory has to
 * be incapable of damaging it.
 */
export default async function TasksPage() {
  const userId = await requireUserId();
  const [open, done, goals] = await Promise.all([
    listTasks(userId, { status: "open" }),
    listTasks(userId, { status: "done", limit: 50 }),
    listGoalOptions(userId),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="ListTodo"
        title="Tasks"
        meta={
          <span>
            {open.length === 0 ? "nothing open" : `${open.length} open`}
            {done.length > 0 && ` · ${done.length} done`}
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5">
          <TaskForm goals={goals} />

          {open.length === 0 ? (
            <div className="border-line mt-4 flex items-center gap-3 rounded-lg border border-dashed px-4 py-6">
              <span className="bg-accent-soft text-accent flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon name="ListTodo" className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-ink font-serif text-[16px] italic">
                  Nothing open.
                </p>
                <p className="text-ink-soft mt-0.5 text-[12.5px]">
                  Add one above — attach a file or folder to keep it next to the
                  work it&rsquo;s about.
                </p>
              </div>
            </div>
          ) : (
            <ul className="mt-4 space-y-1">
              {open.map((task) => (
                <li
                  key={task.id}
                  className="border-line group flex items-start gap-2.5 rounded-md border px-2.5 py-2"
                >
                  <span className="pt-0.5">
                    <TaskStatusButton task={task} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-ink text-[13px] leading-snug">
                      {task.title}
                    </p>
                    {task.note && (
                      <p className="text-ink-soft mt-0.5 text-[11.5px] leading-snug">
                        {task.note}
                      </p>
                    )}
                    {(task.displayPath || task.goal) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {task.displayPath && (
                          <span
                            className="border-line text-ink-faint flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px]"
                            title={task.displayPath}
                          >
                            <Icon
                              name={
                                task.pathKind === "folder" ? "Folder" : "File"
                              }
                              className="size-3 shrink-0"
                            />
                            <span className="min-w-0 truncate">
                              {task.displayPath}
                            </span>
                          </span>
                        )}
                        {task.goal && (
                          <span className="bg-accent-soft text-accent flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px]">
                            <Icon name="Target" className="size-3 shrink-0" />
                            <span className="max-w-40 truncate">
                              {task.goal.title}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <DeleteTaskButton taskId={task.id} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <details className="mt-6">
              <summary className="text-ink-faint hover:text-ink cursor-pointer text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Done ({done.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {done.map((task) => (
                  <li
                    key={task.id}
                    className="border-line group flex items-start gap-2.5 rounded-md border px-2.5 py-2 opacity-70"
                  >
                    <span className="pt-0.5">
                      <TaskStatusButton task={task} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-faint text-[13px] leading-snug line-through">
                        {task.title}
                      </p>
                      {task.displayPath && (
                        <p
                          className="text-ink-faint mt-0.5 truncate font-mono text-[10.5px]"
                          title={task.displayPath}
                        >
                          {task.displayPath}
                        </p>
                      )}
                    </div>
                    <span className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <DeleteTaskButton taskId={task.id} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

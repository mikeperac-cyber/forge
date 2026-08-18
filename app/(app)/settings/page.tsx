import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getRunStats } from "@/data/runs";
import { logoutAction } from "@/actions/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { SHORTCUTS } from "@/components/shell/shortcuts";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { formatDuration } from "@/lib/status";
import { cn } from "@/lib/cn";

/** Names what each colour means, so the palette reads as a system. */
function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex flex-col gap-1">
      <span className={cn("block h-1.5 w-10 rounded-full", className)} />
      <span className="text-ink-faint text-[10px]">{label}</span>
    </span>
  );
}

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, stats] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, createdAt: true },
    }),
    getRunStats(userId),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon="Settings" title="Settings" />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid max-w-4xl [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3">
          <Card title="Appearance">
            <p className="text-ink-soft pb-2 text-[12px]">
              Auto follows your system.
            </p>
            <ThemeToggle />
            <div className="flex gap-1.5 pt-3" aria-hidden>
              <Swatch className="bg-accent" label="Interactive" />
              <Swatch className="bg-ok" label="Clear" />
              <Swatch className="bg-now" label="Attention" />
              <Swatch className="bg-bad" label="Failed" />
            </div>
          </Card>

          <Card title="Account">
            <Row label="Email" value={user.email} />
            <Row label="Name" value={user.name} />
            <Row label="Created" value={user.createdAt.toLocaleDateString()} />
            <form action={logoutAction} className="pt-2">
              <button
                type="submit"
                className="border-line text-bad hover:bg-bad-soft rounded border px-2.5 py-1 text-[12.5px]"
              >
                Sign out
              </button>
            </form>
          </Card>

          <Card title="Activity">
            <Row label="Runs" value={String(stats.total)} />
            <Row label="Succeeded" value={String(stats.succeeded)} />
            <Row label="Failed" value={String(stats.failed)} />
            <Row
              label="Median duration"
              value={formatDuration(stats.medianMs)}
            />
          </Card>

          <Card title="Keyboard">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.keys}
                className="flex items-center justify-between gap-3 py-0.5"
              >
                <span className="text-ink-soft text-[12px]">
                  {shortcut.label}
                </span>
                <kbd className="border-line bg-canvas text-ink-faint shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10.5px]">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </Card>

          <Card title="Runner">
            <p className="text-ink-soft text-[12px]">
              Steps execute against the simulated runner. Only{" "}
              <code className="font-mono">transform</code> and{" "}
              <code className="font-mono">branch</code> evaluate for real.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-panel rounded-lg border p-3">
      <h2 className="text-ink-faint mb-2 text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5 text-[12.5px]">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink-soft truncate">{value}</span>
    </div>
  );
}

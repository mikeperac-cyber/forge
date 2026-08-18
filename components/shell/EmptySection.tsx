import Link from "next/link";
import { Icon } from "./Icon";
import { PageHeader } from "./PageHeader";

/**
 * A section that exists but has nothing in it yet.
 *
 * Says what will live here and offers the nearest thing you can actually do
 * today. It never invents data and never offers a button that does nothing —
 * an invitation you can't accept is worse than no invitation.
 */
export function EmptySection({
  icon,
  title,
  what,
  meanwhile,
  action,
}: {
  icon: string;
  title: string;
  /** One sentence: what this section is for. */
  what: string;
  /** One sentence: what to do until it's built. */
  meanwhile: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={icon} title={title} />

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name={icon} className="size-5" />
          </span>

          <h2 className="mt-4 font-serif text-[19px] italic text-ink">{what}</h2>

          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            {meanwhile}
          </p>

          <Link
            href={action.href}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-bold text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {action.label}
            <Icon name="ChevronRight" className="size-3.5" />
          </Link>

          <p className="mt-4 text-[11.5px] text-ink-faint">
            Not built yet — this page is a placeholder, not a preview.
          </p>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface SubTab {
  href: string;
  label: string;
  icon?: string;
  badge?: string;
  disabled?: boolean;
}

/**
 * Title row plus the contextual strip beneath it. Kept as one component so the
 * two never drift apart — the strip belongs to the title, not to the page.
 */
export function PageHeader({
  icon,
  title,
  meta,
  actions,
  tabs,
  active,
}: {
  icon: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: SubTab[];
  active?: string;
}) {
  return (
    <div className="border-line bg-panel shrink-0 border-b">
      <div className="flex h-12 items-center gap-3 px-4">
        <span className="bg-accent-soft text-accent flex size-6 items-center justify-center rounded">
          <Icon name={icon} className="size-3.5" />
        </span>
        <h1 className="text-[14px] font-semibold">{title}</h1>
        {meta && (
          <div className="text-ink-faint flex items-center gap-3 text-[12px]">
            {meta}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>

      {tabs && tabs.length > 0 && (
        <nav className="flex items-center gap-0.5 px-3">
          {tabs.map((tab) => {
            const isActive = tab.href === active;
            const content = (
              <>
                {tab.icon && <Icon name={tab.icon} className="size-3.5" />}
                {tab.label}
                {tab.badge && (
                  <span className="bg-line text-ink-faint rounded px-1 text-[9px] font-semibold tracking-wide uppercase">
                    {tab.badge}
                  </span>
                )}
              </>
            );

            const className = cn(
              "flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-[12.5px]",
              isActive
                ? "border-accent text-ink"
                : "border-transparent text-ink-soft hover:text-ink",
              tab.disabled &&
                "cursor-not-allowed opacity-50 hover:text-ink-soft",
            );

            return tab.disabled ? (
              <span
                key={tab.href}
                className={className}
                title="Not in this build"
              >
                {content}
              </span>
            ) : (
              <Link key={tab.href} href={tab.href} className={className}>
                {content}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

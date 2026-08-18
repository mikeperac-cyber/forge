import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";

/**
 * In-app 404 — a workflow slug or run id that doesn't resolve. Renders inside
 * the shell so the explorer and tabs stay put and you can carry on from here,
 * rather than being ejected to a bare page.
 */
export default function AppNotFound() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon="TriangleAlert" title="Not found" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Icon name="TriangleAlert" className="text-ink-faint size-6" />
        <p className="text-ink-faint max-w-sm text-[12.5px]">
          This workflow or run doesn&apos;t exist, or it belongs to another
          account.
        </p>
        <div className="flex gap-2">
          <Link
            href="/workflows"
            className="bg-accent rounded px-2.5 py-1 text-[12.5px] font-medium text-white"
          >
            All workflows
          </Link>
          <Link
            href="/runs"
            className="border-line text-ink-soft hover:bg-line/50 rounded border px-2.5 py-1 text-[12.5px]"
          >
            Run history
          </Link>
        </div>
      </div>
    </div>
  );
}

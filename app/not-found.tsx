import Link from "next/link";

/**
 * Global 404 for URLs that match no route at all. Renders standalone, because
 * nothing has matched, so no layout — and therefore no shell — applies.
 */
export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-sunken px-4 text-center">
      <span className="flex size-10 items-center justify-center rounded-md bg-accent text-white">
        ⚡
      </span>
      <h1 className="text-[15px] font-semibold">Nothing here</h1>
      <p className="max-w-xs text-[12.5px] text-ink-faint">
        That address doesn&apos;t match anything in Forge.
      </p>
      <Link
        href="/workflows"
        className="rounded bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white"
      >
        Back to workflows
      </Link>
    </div>
  );
}

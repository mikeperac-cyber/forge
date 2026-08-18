"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreVersionAction } from "@/actions/workflows";
import { Icon } from "@/components/shell/Icon";

export function RestoreVersionButton({
  workflowId,
  version,
}: {
  workflowId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await restoreVersionAction(workflowId, version);
            if (result.ok) {
              setError(null);
              router.refresh();
            } else {
              setError(result.error);
            }
          })
        }
        // Restoring archives the graph it replaces, so this is reversible —
        // no confirmation dialog for something you can immediately undo.
        title={`Restore v${version} as a new version`}
        className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-[12px] text-ink-soft hover:bg-line/50 disabled:opacity-50"
      >
        <Icon name="History" className="size-3.5" />
        {pending ? "Restoring…" : "Restore"}
      </button>
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
    </div>
  );
}

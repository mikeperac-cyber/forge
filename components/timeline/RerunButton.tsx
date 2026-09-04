"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rerunAction } from "@/actions/workflows";
import { Icon } from "@/components/shell";

export function RerunButton({
  runId,
  version,
}: {
  runId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={pending}
        // Re-runs the graph this run actually executed, not the current one.
        title={`Run v${version} again`}
        onClick={() =>
          start(async () => {
            const result = await rerunAction(runId);
            if (result.ok) {
              setError(null);
              router.push(`/runs/${result.runId}`);
            } else {
              setError(result.error);
            }
          })
        }
        className="bg-accent flex items-center gap-1.5 rounded px-2.5 py-1 text-[12.5px] font-medium text-white disabled:opacity-50"
      >
        <Icon name="Play" className="size-3.5" />
        {pending ? "Starting…" : `Re-run v${version}`}
      </button>
      {error && (
        <p className="text-bad absolute top-full right-0 mt-1 text-[11px] whitespace-nowrap">
          {error}
        </p>
      )}
    </div>
  );
}

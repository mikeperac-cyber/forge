"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSecretAction, saveSecretAction } from "@/actions/secrets";
import { Icon } from "@/components/shell/Icon";

/**
 * Write-only by design: this form's value field never gets pre-filled from
 * an existing secret, because nothing in this app ever reads one back out in
 * plaintext except right before a run starts. Saving under a name that
 * already exists replaces it — that's rotation, not a separate feature.
 */
export function NewSecretForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  function submit() {
    setError(null);
    start(async () => {
      const result = await saveSecretAction(name, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setValue("");
      router.refresh();
    });
  }

  return (
    <div className="border-line bg-panel space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="NAME (e.g. OPENAI_API_KEY)"
          className="border-line bg-canvas w-56 rounded border px-2 py-1 font-mono text-[12.5px] uppercase"
        />
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          className="border-line bg-canvas min-w-0 flex-1 rounded border px-2 py-1 text-[12.5px]"
        />
        <button
          type="button"
          disabled={pending || !name || !value}
          onClick={submit}
          className="bg-accent text-canvas flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-bold disabled:opacity-50"
        >
          <Icon name="Plus" className="size-3.5" />
          Save secret
        </button>
      </div>
      <p className="text-ink-faint text-[11.5px]">
        Reference it from a node&rsquo;s config as{" "}
        <code className="text-ink-soft">{`{{secret.NAME}}`}</code>. The value is
        encrypted at rest and never shown again after saving.
      </p>
      {error && <p className="text-bad text-[12px]">{error}</p>}
    </div>
  );
}

export function DeleteSecretButton({ secretId }: { secretId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Delete this secret"
      onClick={() =>
        start(async () => {
          await deleteSecretAction(secretId);
          router.refresh();
        })
      }
      className="text-ink-faint hover:bg-bad-soft hover:text-bad shrink-0 rounded p-1 disabled:opacity-50"
    >
      <Icon name="Trash2" className="size-3.5" />
    </button>
  );
}

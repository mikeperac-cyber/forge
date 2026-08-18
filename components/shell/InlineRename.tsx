"use client";

import { useState, useTransition } from "react";

interface RenameResult {
  ok: boolean;
  error?: string;
}

/**
 * Click the text to rename in place. Enter or blur saves, Escape reverts.
 * A rejected save (blank, too long) keeps the input open with the error
 * shown, rather than silently discarding what was typed.
 */
export function InlineRename({
  value,
  onSave,
  onSaved,
  textClassName,
  inputClassName,
}: {
  value: string;
  onSave: (name: string) => Promise<RenameResult>;
  onSaved?: () => void;
  textClassName?: string;
  inputClassName?: string;
}) {
  const [name, setName] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function begin() {
    setDraft(name);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function commit() {
    const next = draft.trim();
    if (!next || next === name) {
      cancel();
      return;
    }

    start(async () => {
      const result = await onSave(next);
      if (result.ok) {
        setName(next);
        cancel();
        onSaved?.();
      } else {
        setError(result.error ?? "Couldn't rename");
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={begin}
        title="Click to rename"
        className={textClassName}
      >
        {name}
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      <input
        autoFocus
        value={draft}
        disabled={pending}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className={inputClassName}
      />
      {error && <span className="mt-0.5 text-[11px] text-bad">{error}</span>}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import type { AuthState } from "@/actions/auth";

interface Props {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  title: string;
  subtitle: string;
  submitLabel: string;
  footer?: React.ReactNode;
}

export function AuthForm({
  action,
  title,
  subtitle,
  submitLabel,
  footer,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="bg-sunken flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="bg-accent flex size-8 items-center justify-center rounded-md text-white">
            ⚡
          </span>
          <span className="text-[15px] font-semibold">Forge</span>
        </div>

        <div className="border-line bg-panel rounded-lg border p-6">
          <h1 className="text-[15px] font-semibold">{title}</h1>
          <p className="text-ink-soft mt-1 text-[12.5px]">{subtitle}</p>

          <form action={formAction} className="mt-5 space-y-3">
            <label className="block">
              <span className="text-ink-soft mb-1 block text-[12px] font-medium">
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="border-line bg-canvas focus:border-accent w-full rounded border px-2.5 py-1.5 text-[13px] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-ink-soft mb-1 block text-[12px] font-medium">
                Password
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="border-line bg-canvas focus:border-accent w-full rounded border px-2.5 py-1.5 text-[13px] outline-none"
              />
            </label>

            {state.error && (
              <p className="border-bad/30 bg-bad-soft text-bad rounded border px-2.5 py-1.5 text-[12px]">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="bg-accent w-full rounded px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {pending ? "Working…" : submitLabel}
            </button>
          </form>
        </div>

        {footer && (
          <p className="text-ink-faint mt-4 text-center text-[12px]">
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}

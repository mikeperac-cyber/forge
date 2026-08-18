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
    <div className="flex h-full items-center justify-center bg-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent text-white">
            ⚡
          </span>
          <span className="text-[15px] font-semibold">Forge</span>
        </div>

        <div className="rounded-lg border border-line bg-panel p-6">
          <h1 className="text-[15px] font-semibold">{title}</h1>
          <p className="mt-1 text-[12.5px] text-ink-soft">{subtitle}</p>

          <form action={formAction} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">
                Password
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              />
            </label>

            {state.error && (
              <p className="rounded border border-bad/30 bg-bad-soft px-2.5 py-1.5 text-[12px] text-bad">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded bg-accent px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {pending ? "Working…" : submitLabel}
            </button>
          </form>
        </div>

        {footer && (
          <p className="mt-4 text-center text-[12px] text-ink-faint">{footer}</p>
        )}
      </div>
    </div>
  );
}

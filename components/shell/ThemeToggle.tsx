"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "light", label: "Day", icon: "Sun" },
  { value: "dark", label: "Night", icon: "Moon" },
  { value: "system", label: "Auto", icon: "Monitor" },
];

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
}

export function ThemeToggle() {
  const current = useThemePreference();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="border-line bg-canvas inline-flex gap-0.5 rounded-lg border p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition-colors",
              "focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2",
              active
                ? "bg-accent-soft text-accent font-bold"
                : "text-ink-soft hover:text-ink",
            )}
          >
            <Icon name={option.icon} className="size-3.5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

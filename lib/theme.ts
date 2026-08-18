"use client";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "forge.theme";

/**
 * A tiny external store for the theme preference.
 *
 * `useSyncExternalStore` needs `getSnapshot` to return a *stable* value — a
 * fresh read of localStorage on every call would return a new string each time
 * and spin React forever. Hence the cache, invalidated only on write.
 */
let cached: ThemePreference | null = null;
const listeners = new Set<() => void>();

export function getThemeSnapshot(): ThemePreference {
  if (cached !== null) return cached;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    cached = raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    cached = "system";
  }
  return cached;
}

/** The server has no preference to read; assume system and let hydration correct. */
export function getThemeServerSnapshot(): ThemePreference {
  return "system";
}

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** The concrete theme a preference resolves to right now. */
export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

/**
 * `data-theme` is always concrete. Leaving it off and letting CSS follow the
 * system reads cleaner, but then the two themes have to be expressed as two
 * different CSS conditions — and the runtime toggle can't override a media
 * query. Resolving here keeps one selector per theme.
 */
export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(preference);
}

export function setTheme(preference: ThemePreference): void {
  cached = preference;
  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Private mode or blocked storage — the theme still applies for this session.
  }
  applyTheme(preference);
  for (const listener of listeners) listener();
}

/**
 * Runs before first paint, inlined into <head>. Without it the document renders
 * with the system theme and then snaps to the stored one — the flash every
 * theme toggle is judged by.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||((!p||p==="system")&&matchMedia("${DARK_QUERY}").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`;

/**
 * Keeps "follow the system" honest after first paint. Only re-applies while the
 * stored preference is system — an explicit Day/Night choice should survive the
 * OS changing underneath it.
 */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (getThemeSnapshot() === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

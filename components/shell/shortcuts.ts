/**
 * The keyboard map, in one place so the settings page, the command palette and
 * the handler that implements them can never disagree.
 *
 * Chrome reserves Ctrl+1..9 (browser tabs) and Ctrl+W (close window) and will
 * not let a page preventDefault them — hence Alt for tab manipulation.
 */
export interface Shortcut {
  keys: string;
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "Ctrl K", label: "Command palette" },
  { keys: "Ctrl P", label: "Go to workflow" },
  { keys: "Ctrl B", label: "Toggle explorer" },
  { keys: "Ctrl S", label: "Save workflow" },
  { keys: "Alt 1–9", label: "Switch to tab" },
  { keys: "Alt W", label: "Close tab" },
  { keys: "Alt [ / ]", label: "Previous / next tab" },
];

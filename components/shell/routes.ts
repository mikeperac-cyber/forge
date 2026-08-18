/**
 * Every fixed route the app has, and what to call it.
 *
 * Single source of truth for the tab label, for whether a restored tab still
 * points somewhere real, and for the palette's "Go to" list. It lives in its
 * own module because the moment two of those keep their own copy they drift —
 * the palette used to offer "All workflows" and "Node reference" for
 * destinations the sidebar called "Automations" and "Steps".
 *
 * Vocabulary is the user's, not the system's.
 */
export interface RouteMeta {
  label: string;
  icon: string;
}

export const FIXED_ROUTES: Record<string, RouteMeta> = {
  "/today": { label: "Today", icon: "CalendarDays" },
  "/goals": { label: "Goals", icon: "Target" },
  "/time": { label: "Time", icon: "Clock" },
  "/projects": { label: "Projects", icon: "Activity" },
  "/files": { label: "Files", icon: "FolderOpen" },
  "/inbox": { label: "Inbox", icon: "Inbox" },
  "/notes": { label: "Notes", icon: "NotebookPen" },
  "/workflows": { label: "Automations", icon: "Zap" },
  "/runs": { label: "Runs", icon: "History" },
  "/nodes": { label: "Steps", icon: "Boxes" },
  "/settings": { label: "Settings", icon: "Settings" },
  "/workflows/new": { label: "New automation", icon: "Plus" },
};

/**
 * What the palette offers under "Go to", in the order it offers them —
 * the daily loop first, then the automation side, then settings.
 *
 * `/workflows/new` is deliberately absent: creating something is an action,
 * and the palette lists it as one.
 */
export const NAV_ROUTES: string[] = [
  "/today",
  "/goals",
  "/time",
  "/projects",
  "/inbox",
  "/workflows",
  "/runs",
  "/nodes",
  "/files",
  "/notes",
  "/settings",
];

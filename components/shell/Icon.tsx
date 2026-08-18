"use client";

import {
  Activity,
  BookOpen,
  Boxes,
  Braces,
  CalendarDays,
  FolderOpen,
  Target,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  Monitor,
  Moon,
  NotebookPen,
  Sun,
  Users,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDot,
  Clock,
  Command,
  FileCode,
  GitFork,
  Globe,
  History,
  LayoutGrid,
  ListTree,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  TriangleAlert,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * Explicit map rather than dynamic import: executors declare their icon as a
 * string, and a lookup table keeps that string honest while letting the bundler
 * tree-shake everything unused.
 */
const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Activity,
  BookOpen,
  Boxes,
  Braces,
  CalendarDays,
  FolderOpen,
  Target,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  Monitor,
  Moon,
  NotebookPen,
  Sun,
  Users,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDot,
  Clock,
  Command,
  FileCode,
  GitFork,
  Globe,
  History,
  LayoutGrid,
  ListTree,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  TriangleAlert,
  Workflow,
  X,
  Zap,
};

export function Icon({
  name,
  className,
  ...rest
}: { name: string } & SVGProps<SVGSVGElement>) {
  const Component = ICONS[name] ?? CircleDot;
  return <Component className={className} {...rest} />;
}

export type IconName = keyof typeof ICONS;

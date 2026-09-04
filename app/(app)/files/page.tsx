import { EmptySection } from "@/components/shell";

/**
 * Report-only by design. It will read folders you point it at and tell you
 * what's accumulating — duplicates, forgotten downloads, screenshots — and
 * never move or delete anything. That constraint is the feature: a cleanup
 * tool you have to trust with delete permission is one you won't run.
 */
export default function FilesPage() {
  return (
    <EmptySection
      icon="FolderOpen"
      title="Files"
      what="See what's piling up, without anything being touched."
      meanwhile="Point it at a folder and it reports duplicates, large files and things you haven't opened in months. It only ever reads — you decide what goes. Automations will run the report on a schedule."
      action={{ href: "/workflows", label: "Set up an automation" }}
    />
  );
}

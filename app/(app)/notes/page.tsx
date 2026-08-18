import { EmptySection } from "@/components/shell/EmptySection";

export default function NotesPage() {
  return (
    <EmptySection
      icon="NotebookPen"
      title="Notes"
      what="What happened in the room, kept next to the class."
      meanwhile="The thing you'd otherwise write on the back of a printout and lose. Automations already keep a written record of every run, which is the nearest thing to this today."
      action={{ href: "/runs", label: "See run history" }}
    />
  );
}

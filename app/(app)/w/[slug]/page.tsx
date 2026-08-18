import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { getWorkflow } from "@/data/workflows";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userId = await requireUserId();

  // Scoped by userId, so another account's slug is indistinguishable from a
  // slug that doesn't exist.
  const workflow = await getWorkflow(userId, slug);
  if (!workflow) notFound();

  return (
    <WorkflowCanvas
      workflow={{
        id: workflow.id,
        name: workflow.name,
        slug: workflow.slug,
        version: workflow.version,
      }}
      initialGraph={workflow.graph}
    />
  );
}

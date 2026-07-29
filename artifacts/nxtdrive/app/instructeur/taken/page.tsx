import { InstructorTasksView } from "@/components/instructor/RedesignViews";
import { loadInstructorTaskWorkspace } from "@/lib/instructor/tasks-server";

export const dynamic = "force-dynamic";

export default async function InstructorTasksPage() {
  const workspace = await loadInstructorTaskWorkspace();
  return <InstructorTasksView workspace={workspace} />;
}

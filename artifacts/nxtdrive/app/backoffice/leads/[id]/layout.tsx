import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireLeadBackofficeAccess } from "@/lib/leads/access";

export default async function LeadDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { lead } = await requireLeadBackofficeAccess(
    createServiceRoleClient(),
    id,
    "read",
  );

  if (!lead) notFound();

  return <>{children}</>;
}

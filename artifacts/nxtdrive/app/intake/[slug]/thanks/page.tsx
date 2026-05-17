import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function IntakeThanksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = createServiceRoleClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  return (
    <main className="bg-nxt-grid relative flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md p-8 text-center">
        <NxtdriveLogo className="mx-auto text-xl" />
        <h1 className="mt-6 text-2xl font-semibold text-foreground">
          Bedankt voor je aanmelding!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tenant.name} ontvangt je gegevens en neemt zo snel mogelijk contact
          met je op.
        </p>
      </Card>
    </main>
  );
}

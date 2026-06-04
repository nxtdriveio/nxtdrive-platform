/**
 * Franchise template reads.
 * All writes go through service-role RPCs.
 */
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { FranchiseTemplate, FranchiseTemplateActivation } from "@/lib/types";

export type FranchiseTemplateWithActivations = FranchiseTemplate & {
  activations: FranchiseTemplateActivation[];
};

/** Load all templates for a franchisegever tenant with their activations. */
export async function loadFranchiseTemplates(
  franchisegever_tenant_id: string,
): Promise<FranchiseTemplateWithActivations[]> {
  const service = createServiceRoleClient();

  const { data: templates, error } = await service
    .from("franchise_templates")
    .select("*")
    .eq("tenant_id", franchisegever_tenant_id)
    .order("is_active", { ascending: false })
    .order("name");

  if (error) throw new Error(`Templates laden mislukt: ${error.message}`);

  if (!templates || templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);
  const { data: activations, error: actErr } = await service
    .from("franchise_template_activations")
    .select("*")
    .in("franchise_template_id", templateIds);

  if (actErr) throw new Error(`Activaties laden mislukt: ${actErr.message}`);

  const activationsByTemplate: Record<string, FranchiseTemplateActivation[]> = {};
  for (const a of activations ?? []) {
    (activationsByTemplate[a.franchise_template_id] ??= []).push(
      a as FranchiseTemplateActivation,
    );
  }

  return templates.map((t) => ({
    ...(t as FranchiseTemplate),
    activations: activationsByTemplate[t.id] ?? [],
  }));
}

/**
 * Load templates available to a franchisee (from its franchisegever),
 * along with the franchisee's own activations.
 */
export async function loadFranchiseeTemplates(
  franchisee_tenant_id: string,
): Promise<{
  templates: FranchiseTemplate[];
  activations: FranchiseTemplateActivation[];
  franchisegever_name: string | null;
}> {
  const service = createServiceRoleClient();

  // Find the franchisegever.
  const { data: franchisee, error: feErr } = await service
    .from("tenants")
    .select("id, parent_tenant_id")
    .eq("id", franchisee_tenant_id)
    .single();

  if (feErr || !franchisee || !franchisee.parent_tenant_id) {
    return { templates: [], activations: [], franchisegever_name: null };
  }

  const franchisegever_id = franchisee.parent_tenant_id as string;

  const [
    { data: franchisegever, error: fgErr },
    { data: templates, error: tmplErr },
    { data: activations, error: actErr },
  ] = await Promise.all([
    service.from("tenants").select("name").eq("id", franchisegever_id).single(),
    service
      .from("franchise_templates")
      .select("*")
      .eq("tenant_id", franchisegever_id)
      .eq("is_active", true)
      .order("name"),
    service
      .from("franchise_template_activations")
      .select("*")
      .eq("franchisee_tenant_id", franchisee_tenant_id),
  ]);

  if (fgErr)   throw new Error(`Franchisegever laden mislukt: ${fgErr.message}`);
  if (tmplErr) throw new Error(`Templates laden mislukt: ${tmplErr.message}`);
  if (actErr)  throw new Error(`Activaties laden mislukt: ${actErr.message}`);

  return {
    templates: (templates ?? []) as FranchiseTemplate[],
    activations: (activations ?? []) as FranchiseTemplateActivation[],
    franchisegever_name: franchisegever?.name ?? null,
  };
}

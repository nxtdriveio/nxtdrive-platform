"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { LEAD_SOURCES, type LeadSource } from "@/lib/leads/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{5,}$/;

function err(slug: string, message: string): never {
  redirect(`/intake/${slug}?error=${encodeURIComponent(message)}`);
}

function trimOrNull(value: FormDataEntryValue | null, max = 200): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, max);
  return v.length > 0 ? v : null;
}

export async function submitIntake(formData: FormData) {
  const slug = String(formData.get("tenant_slug") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    redirect("/");
  }

  // Honeypot — silently accept and redirect, do not reveal the trap.
  if (String(formData.get("website_url") ?? "").trim() !== "") {
    redirect(`/intake/${slug}/thanks`);
  }

  const full_name = trimOrNull(formData.get("full_name"));
  const email = trimOrNull(formData.get("email"))?.toLowerCase() ?? null;
  const phone = trimOrNull(formData.get("phone"), 50);
  const postcode = trimOrNull(formData.get("postcode"), 20);
  const message = trimOrNull(formData.get("message"), 2000);
  const rawSource = String(formData.get("source") ?? "website") as LeadSource;
  const source: LeadSource = LEAD_SOURCES.includes(rawSource)
    ? rawSource
    : "website";

  if (!full_name) err(slug, "Vul je naam in.");
  if (!email && !phone)
    err(slug, "Vul minimaal een e-mailadres of telefoonnummer in.");
  if (email && !EMAIL_RE.test(email)) err(slug, "Vul een geldig e-mailadres in.");
  if (phone && !PHONE_RE.test(phone))
    err(slug, "Vul een geldig telefoonnummer in.");

  const service = createServiceRoleClient();

  const { data: tenant, error: tErr } = await service
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr || !tenant) err(slug, "Deze rijschool is niet gevonden.");

  const hdrs = await headers();
  const ipHeader =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // Transactional RPC: inserts lead + lead_event + audit_log atomically.
  const { error: rpcErr } = await service.rpc("create_lead", {
    p_tenant_id: tenant.id,
    p_source: source,
    p_full_name: full_name,
    p_email: email,
    p_phone: phone,
    p_postcode: postcode,
    p_message: message,
    p_submitted_ip: ipHeader,
    p_user_agent: userAgent,
  });

  if (rpcErr) {
    err(slug, "Er ging iets mis bij het versturen. Probeer het opnieuw.");
  }

  redirect(`/intake/${slug}/thanks`);
}

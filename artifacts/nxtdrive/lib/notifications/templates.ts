import { formatEuro, formatDateTimeNl } from "./format";
import type { EmailBranding, RenderedEmail, TemplateOverride } from "./types";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Branded HTML shell around the per-template body. */
function layout(branding: EmailBranding, innerHtml: string): string {
  const accent =
    branding.whiteLabelEnabled && branding.primaryColor
      ? branding.primaryColor
      : "#0f172a";
  const onAccent =
    branding.whiteLabelEnabled && branding.primaryForeground
      ? branding.primaryForeground
      : "#ffffff";
  const header =
    branding.whiteLabelEnabled && branding.logoUrl
      ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.tenantName)}" style="height:40px;display:block" />`
      : `<span style="font-size:20px;font-weight:700;color:${escapeHtml(onAccent)}">${escapeHtml(branding.tenantName)}</span>`;
  // White-label tenants do not show the platform footer.
  const platformFooter = branding.whiteLabelEnabled
    ? ""
    : `<p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">Verzonden via NXTDRIVE</p>`;

  return `<!doctype html>
<html lang="nl">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="background:${escapeHtml(accent)};border-radius:12px 12px 0 0;padding:20px 24px">${header}</div>
      <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;line-height:1.6;font-size:15px">
        ${innerHtml}
        <p style="margin-top:32px;color:#475569;font-size:14px">Met vriendelijke groet,<br/>${escapeHtml(branding.tenantName)}</p>
      </div>
      ${platformFooter}
    </div>
  </body>
</html>`;
}

/** Replace {{placeholders}} in an override string. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
    const v = vars[key.toLowerCase()];
    return v === undefined ? "" : v;
  });
}

/**
 * If an enabled override exists, use its (interpolated) subject/body, falling
 * back per-field to the built-in default. Otherwise return the default.
 */
function applyOverride(
  override: TemplateOverride,
  branding: EmailBranding,
  fallback: RenderedEmail,
  vars: Record<string, string>,
): RenderedEmail {
  if (!override || !override.enabled) return fallback;
  const subject = override.subject
    ? interpolate(override.subject, vars)
    : fallback.subject;
  const text = override.bodyText
    ? interpolate(override.bodyText, vars)
    : fallback.text;
  const html = override.bodyHtml
    ? layout(branding, interpolate(override.bodyHtml, vars))
    : fallback.html;
  return { subject, html, text };
}

export type PaymentConfirmationData = {
  studentName: string;
  invoiceNo: number;
  amountCents: number;
  paidAt: string | Date | null;
};

export function renderPaymentConfirmation(
  branding: EmailBranding,
  data: PaymentConfirmationData,
  override?: TemplateOverride,
): RenderedEmail {
  const amount = formatEuro(data.amountCents);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    invoice_no: String(data.invoiceNo),
    amount,
    paid_at: formatDateTimeNl(data.paidAt),
  };

  const subject = `Betaling ontvangen — factuur ${data.invoiceNo}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>We hebben je betaling van <strong>${escapeHtml(amount)}</strong> voor factuur <strong>#${escapeHtml(String(data.invoiceNo))}</strong> in goede orde ontvangen. Hartelijk dank!</p>
    <p>Je hoeft verder niets te doen — dit bericht dient als bevestiging.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `We hebben je betaling van ${amount} voor factuur #${data.invoiceNo} in goede orde ontvangen. Hartelijk dank!\n\n` +
    `Je hoeft verder niets te doen — dit bericht dient als bevestiging.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type LessonReminderData = {
  studentName: string;
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
};

export function renderLessonReminder(
  branding: EmailBranding,
  data: LessonReminderData,
  override?: TemplateOverride,
): RenderedEmail {
  const when = formatDateTimeNl(data.startsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    lesson_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const subject = `Herinnering: je rijles op ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Dit is een herinnering aan je aankomende rijles op <strong>${escapeHtml(when)}</strong>.</p>
    ${locationLine}
    <p>Tot dan! Kun je niet komen? Neem dan tijdig contact met ons op.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Dit is een herinnering aan je aankomende rijles op ${when}.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    `\nTot dan! Kun je niet komen? Neem dan tijdig contact met ons op.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

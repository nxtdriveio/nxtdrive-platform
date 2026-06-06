import type { EmailBranding, RenderedEmail } from "./types";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

export type StaffWelcomeData = {
  staffName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  roleLabel: string;
};

export function renderStaffWelcome(
  branding: EmailBranding,
  data: StaffWelcomeData,
): RenderedEmail {
  const subject = `Welkom bij ${branding.tenantName} — je inloggegevens`;
  const inner = `
    <p>Beste ${escapeHtml(data.staffName)},</p>
    <p>Je bent als medewerker toegevoegd aan <strong>${escapeHtml(branding.tenantName)}</strong> met de rol <strong>${escapeHtml(data.roleLabel)}</strong>. Hieronder vind je je tijdelijke inloggegevens.</p>
    <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap">E-mailadres</td>
        <td style="padding:4px 0"><strong>${escapeHtml(data.email)}</strong></td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap">Tijdelijk wachtwoord</td>
        <td style="padding:4px 0"><strong style="font-family:monospace">${escapeHtml(data.temporaryPassword)}</strong></td>
      </tr>
    </table>
    <p>
      <a href="${escapeHtml(data.loginUrl)}" style="display:inline-block;padding:10px 20px;background:#0f172a;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">Inloggen</a>
    </p>
    <p style="color:#475569;font-size:14px">Je wordt bij de eerste login gevraagd een nieuw wachtwoord in te stellen. Bewaar dit bericht tot dan goed.</p>`;
  const text =
    `Beste ${data.staffName},\n\n` +
    `Je bent als medewerker toegevoegd aan ${branding.tenantName} met de rol ${data.roleLabel}.\n\n` +
    `E-mailadres: ${data.email}\n` +
    `Tijdelijk wachtwoord: ${data.temporaryPassword}\n\n` +
    `Log in via: ${data.loginUrl}\n\n` +
    `Je wordt bij de eerste login gevraagd een nieuw wachtwoord in te stellen.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return { subject, html: layout(branding, inner), text };
}

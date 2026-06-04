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

export type TaskAssignedData = {
  assigneeName: string;
  taskTitle: string;
  boardName: string | null;
  departmentName: string | null;
  priorityLabel: string | null;
  dueDate: string | null;
  taskUrl: string | null;
};

function formatDateNl(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function renderTaskAssigned(
  branding: EmailBranding,
  data: TaskAssignedData,
  override?: TemplateOverride,
): RenderedEmail {
  const due = formatDateNl(data.dueDate);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    assignee_name: data.assigneeName,
    task_title: data.taskTitle,
    board_name: data.boardName ?? "",
    department_name: data.departmentName ?? "",
    priority: data.priorityLabel ?? "",
    due_date: due,
    task_url: data.taskUrl ?? "",
  };

  const metaRows: string[] = [];
  if (data.departmentName)
    metaRows.push(`<li>Afdeling: <strong>${escapeHtml(data.departmentName)}</strong></li>`);
  if (data.boardName)
    metaRows.push(`<li>Bord: <strong>${escapeHtml(data.boardName)}</strong></li>`);
  if (data.priorityLabel)
    metaRows.push(`<li>Prioriteit: <strong>${escapeHtml(data.priorityLabel)}</strong></li>`);
  if (due) metaRows.push(`<li>Deadline: <strong>${escapeHtml(due)}</strong></li>`);
  const metaList = metaRows.length
    ? `<ul style="margin:8px 0 0;padding-left:20px;color:#475569">${metaRows.join("")}</ul>`
    : "";
  const cta = data.taskUrl
    ? `<p style="margin-top:20px"><a href="${escapeHtml(data.taskUrl)}" style="color:#2563eb">Bekijk de taak</a></p>`
    : "";

  const subject = `Nieuwe taak toegewezen: ${data.taskTitle}`;
  const inner = `
    <p>Beste ${escapeHtml(data.assigneeName)},</p>
    <p>Er is een taak aan jou toegewezen: <strong>${escapeHtml(data.taskTitle)}</strong>.</p>
    ${metaList}
    ${cta}`;
  const metaText =
    (data.departmentName ? `Afdeling: ${data.departmentName}\n` : "") +
    (data.boardName ? `Bord: ${data.boardName}\n` : "") +
    (data.priorityLabel ? `Prioriteit: ${data.priorityLabel}\n` : "") +
    (due ? `Deadline: ${due}\n` : "");
  const text =
    `Beste ${data.assigneeName},\n\n` +
    `Er is een taak aan jou toegewezen: ${data.taskTitle}.\n` +
    metaText +
    (data.taskUrl ? `\nBekijk de taak: ${data.taskUrl}\n` : "") +
    `\nMet vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type TrialLessonReceivedData = {
  leadName: string;
  startsAt: string | Date;
  location: string | null;
};

export function renderTrialLessonReceived(
  branding: EmailBranding,
  data: TrialLessonReceivedData,
  override?: TemplateOverride,
): RenderedEmail {
  const when = formatDateTimeNl(data.startsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    lead_name: data.leadName,
    lesson_time: when,
    location: data.location ?? "",
  };

  const locationLine = data.location
    ? `<p>Voorkeurslocatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const subject = `We hebben je voorkeursmoment ontvangen`;
  const inner = `
    <p>Beste ${escapeHtml(data.leadName)},</p>
    <p>Bedankt voor je aanvraag! We hebben je voorkeursmoment voor een proefles op <strong>${escapeHtml(when)}</strong> in goede orde ontvangen.</p>
    ${locationLine}
    <p>Dit moment is nog niet definitief. We nemen het door en sturen je zo snel mogelijk een bevestiging.</p>`;
  const text =
    `Beste ${data.leadName},\n\n` +
    `Bedankt voor je aanvraag! We hebben je voorkeursmoment voor een proefles op ${when} in goede orde ontvangen.\n` +
    (data.location ? `Voorkeurslocatie: ${data.location}\n` : "") +
    `\nDit moment is nog niet definitief. We nemen het door en sturen je zo snel mogelijk een bevestiging.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type TrialLessonConfirmedData = {
  leadName: string;
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
};

export function renderTrialLessonConfirmed(
  branding: EmailBranding,
  data: TrialLessonConfirmedData,
  override?: TemplateOverride,
): RenderedEmail {
  const when = formatDateTimeNl(data.startsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    lead_name: data.leadName,
    lesson_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const subject = `Je proefles is bevestigd — ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.leadName)},</p>
    <p>Goed nieuws! Je proefles is bevestigd op <strong>${escapeHtml(when)}</strong>.</p>
    ${locationLine}
    ${instructorLine}
    <p>Tot dan! Kun je niet komen? Neem dan tijdig contact met ons op.</p>`;
  const text =
    `Beste ${data.leadName},\n\n` +
    `Goed nieuws! Je proefles is bevestigd op ${when}.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    `\nTot dan! Kun je niet komen? Neem dan tijdig contact met ons op.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type LessonRefillInvitationData = {
  studentName: string;
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
  expiresAt: string | Date | null;
};

export function renderLessonRefillInvitation(
  branding: EmailBranding,
  data: LessonRefillInvitationData,
  override?: TemplateOverride,
): RenderedEmail {
  const when = formatDateTimeNl(data.startsAt);
  const expires = data.expiresAt ? formatDateTimeNl(data.expiresAt) : "";
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    lesson_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
    expires_at: expires,
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const expiresLine = expires
    ? `<p style="color:#475569">Reageer vóór <strong>${escapeHtml(expires)}</strong> — daarna vervalt de uitnodiging.</p>`
    : "";
  const subject = `Er is een lesmoment vrijgekomen — ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Er is onverwacht een lesmoment vrijgekomen op <strong>${escapeHtml(when)}</strong>. Omdat je hebt aangegeven beschikbaar te zijn voor extra lessen, bieden we het jou als eerste aan.</p>
    ${locationLine}
    ${instructorLine}
    ${expiresLine}
    <p>Log in op je leerlingomgeving om de les te <strong>bevestigen</strong> of <strong>af te wijzen</strong>. Bij bevestiging wordt de les direct ingepland en je tegoed verrekend.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Er is onverwacht een lesmoment vrijgekomen op ${when}. Omdat je hebt aangegeven beschikbaar te zijn voor extra lessen, bieden we het jou als eerste aan.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    (expires ? `\nReageer vóór ${expires} — daarna vervalt de uitnodiging.\n` : "") +
    `\nLog in op je leerlingomgeving om de les te bevestigen of af te wijzen. Bij bevestiging wordt de les direct ingepland en je tegoed verrekend.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type LessonRefillConfirmedData = {
  studentName: string;
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
};

export function renderLessonRefillConfirmed(
  branding: EmailBranding,
  data: LessonRefillConfirmedData,
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
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const subject = `Je extra les is ingepland — ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Top! Je extra les is bevestigd en ingepland op <strong>${escapeHtml(when)}</strong>. Je tegoed is hiervoor verrekend.</p>
    ${locationLine}
    ${instructorLine}
    <p>Tot dan! Kun je toch niet komen? Neem dan tijdig contact met ons op.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Top! Je extra les is bevestigd en ingepland op ${when}. Je tegoed is hiervoor verrekend.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    `\nTot dan! Kun je toch niet komen? Neem dan tijdig contact met ons op.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type PaymentReminderData = {
  studentName: string;
  invoiceNo: number;
  amountCents: number;
  dueDate: string | null;
  daysOverdue: number;
};

export function renderPaymentReminder(
  branding: EmailBranding,
  data: PaymentReminderData,
  override?: TemplateOverride,
): RenderedEmail {
  const amount = formatEuro(data.amountCents);
  const due = formatDateNl(data.dueDate);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    invoice_no: String(data.invoiceNo),
    amount,
    due_date: due,
    days_overdue: String(data.daysOverdue),
  };

  const dueLine = due
    ? `<p>De vervaldatum was <strong>${escapeHtml(due)}</strong>.</p>`
    : "";
  const subject = `Herinnering: factuur ${data.invoiceNo} staat nog open`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Onze administratie laat zien dat factuur <strong>#${escapeHtml(String(data.invoiceNo))}</strong> van <strong>${escapeHtml(amount)}</strong> nog niet is voldaan.</p>
    ${dueLine}
    <p>Wil je de betaling zo snel mogelijk in orde maken? Heb je al betaald, dan kun je dit bericht als niet verzonden beschouwen.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Onze administratie laat zien dat factuur #${data.invoiceNo} van ${amount} nog niet is voldaan.\n` +
    (due ? `De vervaldatum was ${due}.\n` : "") +
    `\nWil je de betaling zo snel mogelijk in orde maken? Heb je al betaald, dan kun je dit bericht als niet verzonden beschouwen.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

const EXAM_NOUN: Record<"exam" | "interim_test", string> = {
  exam: "examen",
  interim_test: "tussentijdse toets",
};

export type ExamInvitationData = {
  studentName: string;
  examType: "exam" | "interim_test";
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
  expiresAt: string | Date | null;
};

export function renderExamInvitation(
  branding: EmailBranding,
  data: ExamInvitationData,
  override?: TemplateOverride,
): RenderedEmail {
  const noun = EXAM_NOUN[data.examType];
  const when = formatDateTimeNl(data.startsAt);
  const expires = data.expiresAt ? formatDateTimeNl(data.expiresAt) : "";
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    exam_type: noun,
    exam_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
    expires_at: expires,
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const expiresLine = expires
    ? `<p style="color:#475569">Reageer vóór <strong>${escapeHtml(expires)}</strong> — daarna vervalt de uitnodiging.</p>`
    : "";
  const subject = `Examenmoment beschikbaar — ${noun} op ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Er is een ${escapeHtml(noun)} beschikbaar op <strong>${escapeHtml(when)}</strong> en we bieden dit moment aan jou aan.</p>
    ${locationLine}
    ${instructorLine}
    ${expiresLine}
    <p>Log in op je leerlingomgeving om dit moment te <strong>bevestigen</strong> of <strong>af te wijzen</strong>. Een examen kost geen lestegoed.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Er is een ${noun} beschikbaar op ${when} en we bieden dit moment aan jou aan.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    (expires ? `\nReageer vóór ${expires} — daarna vervalt de uitnodiging.\n` : "") +
    `\nLog in op je leerlingomgeving om dit moment te bevestigen of af te wijzen. Een examen kost geen lestegoed.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type ExamConfirmedData = {
  studentName: string;
  examType: "exam" | "interim_test";
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
};

export function renderExamConfirmed(
  branding: EmailBranding,
  data: ExamConfirmedData,
  override?: TemplateOverride,
): RenderedEmail {
  const noun = EXAM_NOUN[data.examType];
  const when = formatDateTimeNl(data.startsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    exam_type: noun,
    exam_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const subject = `Je ${noun} is bevestigd — ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Top! Je ${escapeHtml(noun)} is bevestigd op <strong>${escapeHtml(when)}</strong>.</p>
    ${locationLine}
    ${instructorLine}
    <p>Veel succes! Kun je toch niet komen? Neem dan tijdig contact met ons op.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Top! Je ${noun} is bevestigd op ${when}.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    `\nVeel succes! Kun je toch niet komen? Neem dan tijdig contact met ons op.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type ExamPlannedData = {
  studentName: string;
  examType: "exam" | "interim_test";
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
};

export function renderExamPlanned(
  branding: EmailBranding,
  data: ExamPlannedData,
  override?: TemplateOverride,
): RenderedEmail {
  const noun = EXAM_NOUN[data.examType];
  const when = formatDateTimeNl(data.startsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    exam_type: noun,
    exam_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const subject = `Je ${noun} is ingepland — ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Je ${escapeHtml(noun)} staat ingepland op <strong>${escapeHtml(when)}</strong>.</p>
    ${locationLine}
    ${instructorLine}
    <p>In je leerlingomgeving vind je een handig voorbereidingsoverzicht: de benodigde documenten, een aftelindicator en tips voor de examendag. Bekijk het en bereid je rustig voor.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Je ${noun} staat ingepland op ${when}.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    `\nIn je leerlingomgeving vind je een handig voorbereidingsoverzicht: de benodigde documenten, een aftelindicator en tips voor de examendag.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type ExamResultData = {
  studentName: string;
  examType: "exam" | "interim_test";
};

/**
 * Geslaagd — felicitatie + zachte uitnodiging om in de leerlingomgeving een
 * review te delen en (optioneel, AVG-expliciet) toestemming voor social media te
 * geven. Geen lestegoed-/factuurdetails: die staan los in de backoffice.
 */
export function renderExamResultPassed(
  branding: EmailBranding,
  data: ExamResultData,
  override?: TemplateOverride,
): RenderedEmail {
  const noun = EXAM_NOUN[data.examType];
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    exam_type: noun,
  };

  const subject = `Gefeliciteerd — je bent geslaagd voor je ${noun}! 🎉`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p><strong>Gefeliciteerd!</strong> Je bent geslaagd voor je ${escapeHtml(noun)}. Wat een mooie prestatie — geniet ervan!</p>
    <p>Trots op je resultaat? In je leerlingomgeving kun je een review achterlaten en, als je dat wilt, toestemming geven om je succes op social media te delen. Je vindt daar ook een deelbare badge en een tip-een-vriend-link.</p>
    <p>Nogmaals gefeliciteerd en veilig op weg!</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Gefeliciteerd! Je bent geslaagd voor je ${noun}. Wat een mooie prestatie — geniet ervan!\n\n` +
    `Trots op je resultaat? In je leerlingomgeving kun je een review achterlaten en, als je dat wilt, toestemming geven om je succes op social media te delen. Je vindt daar ook een deelbare badge en een tip-een-vriend-link.\n\n` +
    `Nogmaals gefeliciteerd en veilig op weg!\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

/**
 * Gezakt — empathisch bericht. Geen oordeel, gericht op het vervolg: feedback,
 * een herexamen plannen en samen verder werken. Concrete planning loopt via de
 * backoffice; de mail nodigt alleen uit om de draad weer op te pakken.
 */
export function renderExamResultFailed(
  branding: EmailBranding,
  data: ExamResultData,
  override?: TemplateOverride,
): RenderedEmail {
  const noun = EXAM_NOUN[data.examType];
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    exam_type: noun,
  };

  const subject = `Je ${noun} — even balen, samen pakken we de draad weer op`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Je ${escapeHtml(noun)} is deze keer helaas niet gelukt. Vervelend, maar het zegt niets over wat je al kunt — bijna iedereen heeft wel eens een mindere dag.</p>
    <p>Je instructeur neemt de uitslag met je door en bespreekt waar nog winst te halen valt. We plannen samen een herexamen en een paar gerichte lessen, zodat je goed voorbereid weer gaat.</p>
    <p>Kop op — we gaan ervoor. Tot snel!</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Je ${noun} is deze keer helaas niet gelukt. Vervelend, maar het zegt niets over wat je al kunt — bijna iedereen heeft wel eens een mindere dag.\n\n` +
    `Je instructeur neemt de uitslag met je door en bespreekt waar nog winst te halen valt. We plannen samen een herexamen en een paar gerichte lessen, zodat je goed voorbereid weer gaat.\n\n` +
    `Kop op — we gaan ervoor. Tot snel!\n\n` +
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

// ===========================================================================
// Task #107 — uitbreiding van de automatische e-mailcatalogus
// ===========================================================================

export type IntakeReceivedData = {
  leadName: string;
};

/**
 * Aanvraag ontvangen — bevestigt aan de prospect dat hun inschrijving/aanvraag
 * binnen is en wat de vervolgstap is. Verstuurd vanuit de intake server action.
 */
export function renderIntakeReceived(
  branding: EmailBranding,
  data: IntakeReceivedData,
  override?: TemplateOverride,
): RenderedEmail {
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    lead_name: data.leadName,
  };

  const subject = `We hebben je aanvraag ontvangen`;
  const inner = `
    <p>Beste ${escapeHtml(data.leadName)},</p>
    <p>Bedankt voor je aanmelding bij <strong>${escapeHtml(branding.tenantName)}</strong>. We hebben je aanvraag in goede orde ontvangen.</p>
    <p>We bekijken je gegevens en nemen zo snel mogelijk contact met je op om de volgende stap te plannen — bijvoorbeeld een proefles of een kennismaking.</p>
    <p>Heb je in de tussentijd vragen? Reageer gerust op dit bericht.</p>`;
  const text =
    `Beste ${data.leadName},\n\n` +
    `Bedankt voor je aanmelding bij ${branding.tenantName}. We hebben je aanvraag in goede orde ontvangen.\n\n` +
    `We bekijken je gegevens en nemen zo snel mogelijk contact met je op om de volgende stap te plannen — bijvoorbeeld een proefles of een kennismaking.\n\n` +
    `Heb je in de tussentijd vragen? Reageer gerust op dit bericht.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type LessonCancelledData = {
  studentName: string;
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
  refunded: boolean;
};

/**
 * Les geannuleerd — meldt de leerling dat een geplande rijles is geannuleerd,
 * inclusief of het lestegoed is teruggestort. Verstuurd vanuit de annuleer-actie.
 */
export function renderLessonCancelled(
  branding: EmailBranding,
  data: LessonCancelledData,
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
  const refundLine = data.refunded
    ? `<p>Je lestegoed voor deze les is teruggestort en kun je opnieuw inplannen.</p>`
    : `<p>Voor deze annulering is geen lestegoed teruggestort. Heb je hier vragen over? Neem dan contact met ons op.</p>`;
  const subject = `Je rijles van ${when} is geannuleerd`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Je geplande rijles op <strong>${escapeHtml(when)}</strong> is geannuleerd.</p>
    ${locationLine}
    ${refundLine}
    <p>Neem gerust contact met ons op om een nieuwe les in te plannen.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Je geplande rijles op ${when} is geannuleerd.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.refunded
      ? `\nJe lestegoed voor deze les is teruggestort en kun je opnieuw inplannen.\n`
      : `\nVoor deze annulering is geen lestegoed teruggestort. Heb je hier vragen over? Neem dan contact met ons op.\n`) +
    `\nNeem gerust contact met ons op om een nieuwe les in te plannen.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type LessonRescheduledData = {
  studentName: string;
  previousStartsAt: string | Date;
  newStartsAt: string | Date;
  location: string | null;
  instructorName: string | null;
};

/**
 * Les verzet (leerling/voogd-bevestiging) — meldt dat een geplande rijles naar
 * een nieuw moment is verplaatst, met de oude én nieuwe tijd. Verstuurd vanuit
 * de self-service verzet-actie (student_reschedule_lesson).
 */
export function renderLessonRescheduled(
  branding: EmailBranding,
  data: LessonRescheduledData,
  override?: TemplateOverride,
): RenderedEmail {
  const previousWhen = formatDateTimeNl(data.previousStartsAt);
  const newWhen = formatDateTimeNl(data.newStartsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    previous_lesson_time: previousWhen,
    new_lesson_time: newWhen,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const subject = `Je rijles is verzet naar ${newWhen}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Je rijles is verzet. Het oude moment van <strong>${escapeHtml(previousWhen)}</strong> komt te vervallen.</p>
    <p>Je nieuwe lesmoment is: <strong>${escapeHtml(newWhen)}</strong>.</p>
    ${locationLine}
    ${instructorLine}
    <p>Je lestegoed blijft ongewijzigd. Tot dan!</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Je rijles is verzet. Het oude moment van ${previousWhen} komt te vervallen.\n` +
    `Je nieuwe lesmoment is: ${newWhen}.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    `\nJe lestegoed blijft ongewijzigd. Tot dan!\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type LessonRescheduledInstructorData = {
  instructorName: string | null;
  studentName: string;
  previousStartsAt: string | Date;
  newStartsAt: string | Date;
  location: string | null;
};

/**
 * Les verzet (instructeur-melding) — laat de toegewezen instructeur weten dat
 * een leerling/voogd een geplande rijles naar een nieuw moment heeft verplaatst,
 * zodat de agenda klopt. Bevat de oude én nieuwe tijd en de leerlingnaam.
 */
export function renderLessonRescheduledInstructor(
  branding: EmailBranding,
  data: LessonRescheduledInstructorData,
  override?: TemplateOverride,
): RenderedEmail {
  const previousWhen = formatDateTimeNl(data.previousStartsAt);
  const newWhen = formatDateTimeNl(data.newStartsAt);
  const instructorName = data.instructorName ?? "instructeur";
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    instructor_name: instructorName,
    student_name: data.studentName,
    previous_lesson_time: previousWhen,
    new_lesson_time: newWhen,
    location: data.location ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const subject = `Rijles van ${data.studentName} verzet naar ${newWhen}`;
  const inner = `
    <p>Beste ${escapeHtml(instructorName)},</p>
    <p><strong>${escapeHtml(data.studentName)}</strong> heeft een geplande rijles verzet.</p>
    <p>Oud moment (vervalt): <strong>${escapeHtml(previousWhen)}</strong></p>
    <p>Nieuw moment: <strong>${escapeHtml(newWhen)}</strong></p>
    ${locationLine}
    <p>Je agenda is bijgewerkt.</p>`;
  const text =
    `Beste ${instructorName},\n\n` +
    `${data.studentName} heeft een geplande rijles verzet.\n` +
    `Oud moment (vervalt): ${previousWhen}\n` +
    `Nieuw moment: ${newWhen}\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    `\nJe agenda is bijgewerkt.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type InvoiceCreatedData = {
  studentName: string;
  invoiceNo: number;
  amountCents: number;
  dueDate: string | null;
};

/**
 * Factuur klaar — meldt de leerling dat er een nieuwe factuur klaarstaat met het
 * bedrag en de vervaldatum. Verstuurd wanneer een factuur op 'open' wordt gezet.
 */
export function renderInvoiceCreated(
  branding: EmailBranding,
  data: InvoiceCreatedData,
  override?: TemplateOverride,
): RenderedEmail {
  const amount = formatEuro(data.amountCents);
  const due = formatDateNl(data.dueDate);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    invoice_no: String(data.invoiceNo),
    amount,
    due_date: due,
  };

  const dueLine = due
    ? `<p>Gelieve het bedrag te voldoen vóór <strong>${escapeHtml(due)}</strong>.</p>`
    : "";
  const subject = `Nieuwe factuur ${data.invoiceNo} staat voor je klaar`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Er staat een nieuwe factuur voor je klaar: factuur <strong>#${escapeHtml(String(data.invoiceNo))}</strong> van <strong>${escapeHtml(amount)}</strong>.</p>
    ${dueLine}
    <p>Je vindt de volledige factuur terug in je leerlingomgeving.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Er staat een nieuwe factuur voor je klaar: factuur #${data.invoiceNo} van ${amount}.\n` +
    (due ? `Gelieve het bedrag te voldoen vóór ${due}.\n` : "") +
    `\nJe vindt de volledige factuur terug in je leerlingomgeving.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type CbrAuthorizationNeededData = {
  studentName: string;
};

/**
 * Machtiging nodig — vraagt de leerling om bij het CBR de digitale machtiging te
 * regelen, zodat de rijschool het examen kan reserveren. Verstuurd wanneer de
 * machtigingsstatus op 'nog_nodig' wordt gezet.
 */
export function renderCbrAuthorizationNeeded(
  branding: EmailBranding,
  data: CbrAuthorizationNeededData,
  override?: TemplateOverride,
): RenderedEmail {
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
  };

  const subject = `Actie nodig: regel je CBR-machtiging`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Om je examen te kunnen reserveren hebben we een <strong>digitale machtiging</strong> van je nodig in MijnCBR.</p>
    <p>Log in op MijnCBR met je DigiD en machtig <strong>${escapeHtml(branding.tenantName)}</strong>. Zodra de machtiging binnen is, plannen wij je examen in.</p>
    <p>Kom je er niet uit? Neem dan gerust contact met ons op, dan helpen we je verder.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Om je examen te kunnen reserveren hebben we een digitale machtiging van je nodig in MijnCBR.\n\n` +
    `Log in op MijnCBR met je DigiD en machtig ${branding.tenantName}. Zodra de machtiging binnen is, plannen wij je examen in.\n\n` +
    `Kom je er niet uit? Neem dan gerust contact met ons op, dan helpen we je verder.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

/** Minuten lestegoed → leesbare NL-tekst, bijv. "90 minuten" of "1 uur". */
function formatMinutesNl(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} minuten`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  const hourPart = hours === 1 ? "1 uur" : `${hours} uur`;
  return rest === 0 ? hourPart : `${hourPart} en ${rest} minuten`;
}

export type CreditLowData = {
  studentName: string;
  balanceMinutes: number;
};

/**
 * Lestegoed bijna op — attendeert de leerling erop dat hun resterende lestegoed
 * onder de drempel is gezakt, zodat ze tijdig kunnen bijbestellen. Verstuurd via
 * de credit-low cron.
 */
export function renderCreditLow(
  branding: EmailBranding,
  data: CreditLowData,
  override?: TemplateOverride,
): RenderedEmail {
  const remaining = formatMinutesNl(data.balanceMinutes);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    balance: remaining,
  };

  const subject = `Je lestegoed is bijna op`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Je hebt nog <strong>${escapeHtml(remaining)}</strong> aan lestegoed over. Dat is genoeg voor nog maar een korte tijd.</p>
    <p>Wil je zonder onderbreking doorrijden naar je examen? Bestel dan op tijd een nieuw lespakket bij, dan staat je tegoed weer klaar.</p>
    <p>Vragen over je tegoed of de mogelijkheden? Neem gerust contact met ons op.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Je hebt nog ${remaining} aan lestegoed over. Dat is genoeg voor nog maar een korte tijd.\n\n` +
    `Wil je zonder onderbreking doorrijden naar je examen? Bestel dan op tijd een nieuw lespakket bij, dan staat je tegoed weer klaar.\n\n` +
    `Vragen over je tegoed of de mogelijkheden? Neem gerust contact met ons op.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type InstallmentDueData = {
  studentName: string;
  invoiceNo: number;
  amountCents: number;
  dueDate: string | null;
  installmentNo: number | null;
  installmentCount: number | null;
};

/**
 * Termijnbetaling open — herinnert de leerling dat een termijnfactuur bijna
 * vervalt. Aanvulling op de overdue-betaalherinnering (die ná de vervaldatum
 * loopt): dit is de vriendelijke heads-up rond de vervaldatum. Verstuurd via de
 * installment-due cron.
 */
export function renderInstallmentDue(
  branding: EmailBranding,
  data: InstallmentDueData,
  override?: TemplateOverride,
): RenderedEmail {
  const amount = formatEuro(data.amountCents);
  const due = formatDateNl(data.dueDate);
  const termijn =
    data.installmentNo && data.installmentCount
      ? `termijn ${data.installmentNo} van ${data.installmentCount}`
      : "termijn";
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    invoice_no: String(data.invoiceNo),
    amount,
    due_date: due,
    installment: termijn,
  };

  const dueLine = due
    ? `<p>De vervaldatum is <strong>${escapeHtml(due)}</strong>.</p>`
    : "";
  const subject = `Herinnering: ${termijn} (factuur ${data.invoiceNo}) staat open`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Dit is een vriendelijke herinnering dat je <strong>${escapeHtml(termijn)}</strong> van <strong>${escapeHtml(amount)}</strong> (factuur <strong>#${escapeHtml(String(data.invoiceNo))}</strong>) binnenkort verloopt.</p>
    ${dueLine}
    <p>Heb je al betaald? Dan kun je dit bericht als afgehandeld beschouwen.</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Dit is een vriendelijke herinnering dat je ${termijn} van ${amount} (factuur #${data.invoiceNo}) binnenkort verloopt.\n` +
    (due ? `De vervaldatum is ${due}.\n` : "") +
    `\nHeb je al betaald? Dan kun je dit bericht als afgehandeld beschouwen.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type ExamDayReminderData = {
  studentName: string;
  examType: "exam" | "interim_test";
  startsAt: string | Date;
  location: string | null;
  instructorName: string | null;
};

/**
 * Examendag-herinnering — herinnert de leerling kort voor hun examen/TTT aan het
 * moment, de locatie en de instructeur. Verstuurd via de exam-day-reminder cron.
 */
export function renderExamDayReminder(
  branding: EmailBranding,
  data: ExamDayReminderData,
  override?: TemplateOverride,
): RenderedEmail {
  const noun = EXAM_NOUN[data.examType];
  const when = formatDateTimeNl(data.startsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    exam_type: noun,
    exam_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Je instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const subject = `Herinnering: je ${noun} op ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Dit is een herinnering aan je aankomende <strong>${escapeHtml(noun)}</strong> op <strong>${escapeHtml(when)}</strong>.</p>
    ${locationLine}
    ${instructorLine}
    <p>Zorg dat je je legitimatie meeneemt en op tijd aanwezig bent. Succes — je kunt dit!</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `Dit is een herinnering aan je aankomende ${noun} op ${when}.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Je instructeur: ${data.instructorName}\n` : "") +
    `\nZorg dat je je legitimatie meeneemt en op tijd aanwezig bent. Succes — je kunt dit!\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type ReviewMomentKey =
  | "after_trial"
  | "after_lessons"
  | "progress_milestone"
  | "exam_passed"
  | "traject_finished";

export type ReviewRequestData = {
  studentName: string;
  moment: ReviewMomentKey;
  /** Waar de leerling de review achterlaat (Google-URL of de app). */
  reviewUrl: string;
};

/** Moment-specifieke aanhef (waarom we nú om een review vragen). */
const REVIEW_INTRO: Record<ReviewMomentKey, string> = {
  after_trial:
    "Je hebt onlangs je proefles gereden — we hopen dat het je goed is bevallen!",
  after_lessons:
    "Je bent inmiddels lekker op weg met je rijlessen. Tijd voor een korte terugblik!",
  progress_milestone:
    "Wat een vooruitgang — je nadert het examenniveau. Een mooi moment om terug te kijken!",
  exam_passed:
    "Gefeliciteerd met je behaalde rijbewijs! Wat een prestatie.",
  traject_finished:
    "Je traject zit erop — bedankt dat we je mochten begeleiden!",
};

/**
 * Reviewverzoek — vraagt de leerling vriendelijk om een review op het juiste
 * moment in hun traject. De CTA wijst naar de tenant-geconfigureerde
 * Google-review-URL (of, bij afwezigheid, naar de app). White-label-bewust.
 */
export function renderReviewRequest(
  branding: EmailBranding,
  data: ReviewRequestData,
  override?: TemplateOverride,
): RenderedEmail {
  const intro = REVIEW_INTRO[data.moment];
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    intro,
    review_url: data.reviewUrl,
  };

  const subject = `Zou je ${branding.tenantName} willen aanbevelen?`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>${escapeHtml(intro)}</p>
    <p>Zou je een momentje willen nemen om je ervaring met <strong>${escapeHtml(branding.tenantName)}</strong> te delen? Een review helpt andere leerlingen én ons enorm.</p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(data.reviewUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Laat een review achter</a>
    </p>
    <p>Alvast hartelijk dank — het kost maar een minuutje!</p>`;
  const text =
    `Beste ${data.studentName},\n\n` +
    `${intro}\n\n` +
    `Zou je een momentje willen nemen om je ervaring met ${branding.tenantName} te delen? Een review helpt andere leerlingen én ons enorm.\n\n` +
    `Laat een review achter: ${data.reviewUrl}\n\n` +
    `Alvast hartelijk dank — het kost maar een minuutje!\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

// ---------------------------------------------------------------------------
// Task #131 — ouder-notificaties. Voor gekoppelde voogden (student_guardians)
// van een kind. Andere toon dan de leerling-mails: gericht aan de ouder/voogd,
// met de naam van het kind, en wijst naar het Ouderportaal (/ouder) i.p.v. de
// leerlingomgeving. White-label-bewust via dezelfde layout()/applyOverride().
// ---------------------------------------------------------------------------

export type ParentInvoiceReadyData = {
  /** Naam van de ouder/voogd (valt terug op "ouder/verzorger"). */
  guardianName: string;
  /** Naam van het kind/leerling. */
  childName: string;
  invoiceNo: number;
  amountCents: number;
  dueDate: string | null;
};

/**
 * Nieuwe factuur klaar — meldt de ouder/voogd dat er een factuur voor hun kind
 * klaarstaat. Geen online-betaallink (het portaal is alleen-lezen); verwijst
 * naar het Ouderportaal voor de details.
 */
export function renderParentInvoiceReady(
  branding: EmailBranding,
  data: ParentInvoiceReadyData,
  override?: TemplateOverride,
): RenderedEmail {
  const amount = formatEuro(data.amountCents);
  const due = formatDateNl(data.dueDate);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    guardian_name: data.guardianName,
    child_name: data.childName,
    invoice_no: String(data.invoiceNo),
    amount,
    due_date: due,
  };

  const dueLine = due
    ? `<p>Gelieve het bedrag te voldoen vóór <strong>${escapeHtml(due)}</strong>.</p>`
    : "";
  const subject = `Nieuwe factuur voor ${data.childName} staat klaar`;
  const inner = `
    <p>Beste ${escapeHtml(data.guardianName)},</p>
    <p>Er staat een nieuwe factuur klaar voor <strong>${escapeHtml(data.childName)}</strong>: factuur <strong>#${escapeHtml(String(data.invoiceNo))}</strong> van <strong>${escapeHtml(amount)}</strong>.</p>
    ${dueLine}
    <p>U vindt de volledige factuur terug in het ouderportaal.</p>`;
  const text =
    `Beste ${data.guardianName},\n\n` +
    `Er staat een nieuwe factuur klaar voor ${data.childName}: factuur #${data.invoiceNo} van ${amount}.\n` +
    (due ? `Gelieve het bedrag te voldoen vóór ${due}.\n` : "") +
    `\nU vindt de volledige factuur terug in het ouderportaal.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type ParentInvoicePaidData = {
  /** Naam van de ouder/voogd (valt terug op "ouder/verzorger"). */
  guardianName: string;
  /** Naam van het kind/leerling. */
  childName: string;
  invoiceNo: number;
  amountCents: number;
  paidAt: string | null;
};

/**
 * Factuur betaald — meldt de ouder/voogd dat de factuur van hun kind is
 * voldaan. Geen actie meer nodig; verwijst naar het ouderportaal voor de
 * betaalhistorie.
 */
export function renderParentInvoicePaid(
  branding: EmailBranding,
  data: ParentInvoicePaidData,
  override?: TemplateOverride,
): RenderedEmail {
  const amount = formatEuro(data.amountCents);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    guardian_name: data.guardianName,
    child_name: data.childName,
    invoice_no: String(data.invoiceNo),
    amount,
    paid_at: formatDateTimeNl(data.paidAt),
  };

  const subject = `Betaling ontvangen — factuur ${data.invoiceNo} van ${data.childName}`;
  const inner = `
    <p>Beste ${escapeHtml(data.guardianName)},</p>
    <p>We hebben de betaling van <strong>${escapeHtml(amount)}</strong> voor factuur <strong>#${escapeHtml(String(data.invoiceNo))}</strong> van <strong>${escapeHtml(data.childName)}</strong> in goede orde ontvangen. Hartelijk dank!</p>
    <p>U hoeft verder niets te doen — dit bericht dient als bevestiging. De betaalhistorie vindt u terug in het ouderportaal.</p>`;
  const text =
    `Beste ${data.guardianName},\n\n` +
    `We hebben de betaling van ${amount} voor factuur #${data.invoiceNo} van ${data.childName} in goede orde ontvangen. Hartelijk dank!\n\n` +
    `U hoeft verder niets te doen — dit bericht dient als bevestiging. De betaalhistorie vindt u terug in het ouderportaal.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type ParentLessonScheduledData = {
  /** Naam van de ouder/voogd (valt terug op "ouder/verzorger"). */
  guardianName: string;
  /** Naam van het kind/leerling. */
  childName: string;
  startsAt: string;
  location: string | null;
  instructorName: string | null;
};

/**
 * Rijles ingepland — meldt de ouder/voogd dat er een rijles voor hun kind is
 * ingepland. Verwijst naar het ouderportaal voor de planning.
 */
export function renderParentLessonScheduled(
  branding: EmailBranding,
  data: ParentLessonScheduledData,
  override?: TemplateOverride,
): RenderedEmail {
  const when = formatDateTimeNl(data.startsAt);
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    guardian_name: data.guardianName,
    child_name: data.childName,
    lesson_time: when,
    location: data.location ?? "",
    instructor_name: data.instructorName ?? "",
  };

  const locationLine = data.location
    ? `<p>Locatie: <strong>${escapeHtml(data.location)}</strong></p>`
    : "";
  const instructorLine = data.instructorName
    ? `<p>Instructeur: <strong>${escapeHtml(data.instructorName)}</strong></p>`
    : "";
  const subject = `Rijles ingepland voor ${data.childName} — ${when}`;
  const inner = `
    <p>Beste ${escapeHtml(data.guardianName)},</p>
    <p>Er is een rijles ingepland voor <strong>${escapeHtml(data.childName)}</strong> op <strong>${escapeHtml(when)}</strong>.</p>
    ${locationLine}
    ${instructorLine}
    <p>De volledige planning vindt u terug in het ouderportaal.</p>`;
  const text =
    `Beste ${data.guardianName},\n\n` +
    `Er is een rijles ingepland voor ${data.childName} op ${when}.\n` +
    (data.location ? `Locatie: ${data.location}\n` : "") +
    (data.instructorName ? `Instructeur: ${data.instructorName}\n` : "") +
    `\nDe volledige planning vindt u terug in het ouderportaal.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

export type StudentWelcomeData = {
  studentName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
};

export function renderStudentWelcome(
  branding: EmailBranding,
  data: StudentWelcomeData,
  override?: TemplateOverride,
): RenderedEmail {
  const vars: Record<string, string> = {
    tenant_name: branding.tenantName,
    student_name: data.studentName,
    email: data.email,
    temporary_password: data.temporaryPassword,
    login_url: data.loginUrl,
  };

  const subject = `Welkom bij ${branding.tenantName} — je inloggegevens`;
  const inner = `
    <p>Beste ${escapeHtml(data.studentName)},</p>
    <p>Je bent als leerling aangemeld bij <strong>${escapeHtml(branding.tenantName)}</strong>. Hieronder vind je je tijdelijke inloggegevens.</p>
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
    `Beste ${data.studentName},\n\n` +
    `Je bent als leerling aangemeld bij ${branding.tenantName}.\n\n` +
    `E-mailadres: ${data.email}\n` +
    `Tijdelijk wachtwoord: ${data.temporaryPassword}\n\n` +
    `Log in via: ${data.loginUrl}\n\n` +
    `Je wordt bij de eerste login gevraagd een nieuw wachtwoord in te stellen.\n\n` +
    `Met vriendelijke groet,\n${branding.tenantName}`;

  return applyOverride(
    override ?? null,
    branding,
    { subject, html: layout(branding, inner), text },
    vars,
  );
}

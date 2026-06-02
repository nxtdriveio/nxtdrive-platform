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

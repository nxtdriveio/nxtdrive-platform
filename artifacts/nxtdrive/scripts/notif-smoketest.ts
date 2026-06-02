/**
 * Live email smoke test (render + real SendGrid send).
 *
 * Renders the customer-facing message templates and sends each one for real via
 * the configured provider, proving that SendGrid is wired up and that every
 * template actually delivers. It also exercises the white-label-aware sender: one
 * case is sent under a white-label tenant name so you can confirm the "from" name
 * follows the tenant, not the platform.
 *
 * This does NOT touch the database or notification_log — DB-level enqueue/status/
 * idempotency is covered by `pnpm --filter @workspace/scripts run db:test-notifications`,
 * and the full end-to-end dispatch + logging + cron idempotency path is covered by
 * `pnpm --filter @workspace/scripts run db:test-notifications-send`.
 *
 * Recipient: TEST_NOTIFICATION_EMAIL, falling back to SENDGRID_FROM_EMAIL.
 *
 * Run: pnpm --filter @workspace/nxtdrive run notif:smoketest
 */
import { isEmailConfigured, sendEmail } from "../lib/notifications/provider";
import {
  renderPaymentConfirmation,
  renderLessonReminder,
  renderTaskAssigned,
  renderTrialLessonReceived,
  renderTrialLessonConfirmed,
} from "../lib/notifications/templates";
import type { EmailBranding, RenderedEmail } from "../lib/notifications/types";

const platformBranding: EmailBranding = {
  tenantName: "NXTDRIVE Demo Academy",
  whiteLabelEnabled: false,
  logoUrl: null,
  primaryColor: null,
  primaryForeground: null,
};

const whiteLabelBranding: EmailBranding = {
  tenantName: "Demo Rijschool (white-label)",
  whiteLabelEnabled: true,
  logoUrl: null,
  primaryColor: "#1d4ed8",
  primaryForeground: "#ffffff",
};

const inOneDay = new Date(Date.now() + 24 * 3_600_000).toISOString();

type Case = { type: string; branding: EmailBranding; email: RenderedEmail };

const cases: Case[] = [
  {
    type: "payment_confirmation",
    branding: platformBranding,
    email: renderPaymentConfirmation(platformBranding, {
      studentName: "Test Cursist",
      invoiceNo: 1001,
      amountCents: 24900,
      paidAt: new Date().toISOString(),
    }),
  },
  {
    // White-label case: confirm the sender name follows the tenant.
    type: "lesson_reminder (white-label)",
    branding: whiteLabelBranding,
    email: renderLessonReminder(whiteLabelBranding, {
      studentName: "Test Cursist",
      startsAt: inOneDay,
      location: "Stationsplein 1, Utrecht",
      instructorName: "Test Instructeur",
    }),
  },
  {
    type: "task_assigned",
    branding: platformBranding,
    email: renderTaskAssigned(platformBranding, {
      assigneeName: "Test Medewerker",
      taskTitle: "Bel cursist terug over proefles",
      boardName: "Leads",
      departmentName: "Frontoffice",
      priorityLabel: "Hoog",
      dueDate: inOneDay,
      taskUrl: null,
    }),
  },
  {
    type: "trial_lesson_received",
    branding: platformBranding,
    email: renderTrialLessonReceived(platformBranding, {
      leadName: "Test Lead",
      startsAt: inOneDay,
      location: "Stationsplein 1, Utrecht",
    }),
  },
  {
    type: "trial_lesson_confirmed",
    branding: platformBranding,
    email: renderTrialLessonConfirmed(platformBranding, {
      leadName: "Test Lead",
      startsAt: inOneDay,
      location: "Stationsplein 1, Utrecht",
      instructorName: "Test Instructeur",
    }),
  },
];

async function main(): Promise<void> {
  if (!isEmailConfigured()) {
    console.error(
      "Email is not configured: set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.",
    );
    process.exit(1);
  }

  const to = process.env["TEST_NOTIFICATION_EMAIL"] ?? process.env["SENDGRID_FROM_EMAIL"];
  if (!to) {
    console.error(
      "No recipient: set TEST_NOTIFICATION_EMAIL or SENDGRID_FROM_EMAIL.",
    );
    process.exit(1);
  }

  console.log(`Sending ${cases.length} live test emails to ${to}\n`);

  let failures = 0;
  for (const c of cases) {
    const result = await sendEmail({
      to,
      fromName: c.branding.tenantName,
      email: c.email,
    });
    if (result.ok) {
      console.log(
        `  OK   ${c.type} — from "${c.branding.tenantName}" — message-id=${result.providerMessageId ?? "(none)"}`,
      );
    } else {
      failures++;
      console.error(`  FAIL ${c.type} — ${result.error}`);
    }
  }

  console.log();
  if (failures > 0) {
    console.error(`${failures}/${cases.length} sends failed.`);
    process.exit(1);
  }
  console.log(`All ${cases.length} test emails sent. Check the inbox at ${to}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildFinanceOnboardingPlan, type FinanceOnboardingFacts } from "./onboarding";

const completeFacts: FinanceOnboardingFacts = {
  tenantName: "Rijschool Voorbeeld",
  mollie: { configured: true, mode: "live" },
  paymentReminderPolicy: { enabled: true, days: [1, 7, 14] },
  installmentCreditMode: "per_installment",
  packageCount: 3,
  invoiceCounts: {
    total: 12,
    draft: 1,
    open: 2,
    paid: 9,
    overdue: 0,
    withOnlinePayment: 8,
  },
  paymentRecordCount: 9,
  vatRateCount: 1,
};

test("finance onboarding marks a fully configured tenant as ready", () => {
  const plan = buildFinanceOnboardingPlan(completeFacts);

  assert.equal(plan.status, "done");
  assert.equal(plan.completionPct, 100);
  assert.equal(plan.riskNotes.length, 0);
  assert.ok(plan.goLiveChecklist.some((item) => item.includes("Mollie live")));
});

test("finance onboarding exposes missing setup and customer script", () => {
  const plan = buildFinanceOnboardingPlan({
    ...completeFacts,
    mollie: { configured: false, mode: null },
    paymentReminderPolicy: { enabled: false, days: [] },
    installmentCreditMode: "immediate",
    packageCount: 0,
    invoiceCounts: {
      total: 0,
      draft: 0,
      open: 0,
      paid: 0,
      overdue: 0,
      withOnlinePayment: 0,
    },
    paymentRecordCount: 0,
    vatRateCount: 0,
  });

  assert.equal(plan.status, "open");
  assert.ok(plan.completionPct < 50);
  assert.ok(plan.steps.some((step) => step.id === "mollie" && step.status === "open"));
  assert.ok(plan.riskNotes.some((note) => note.includes("Zonder Mollie")));
  assert.ok(plan.conversationScript.some((section) => section.title === "Besluitpunten met de klant"));
});

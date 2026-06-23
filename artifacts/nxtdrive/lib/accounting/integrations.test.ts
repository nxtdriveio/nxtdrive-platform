import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountingIntegrationHealth,
  mergeAccountingIntegrationSettings,
  type AccountingIntegrationSettings,
} from "./integrations";
import type { AccountingOverview } from "./overview";

const overview: AccountingOverview = {
  from: "2026-01-01",
  to: "2026-06-23",
  monthly: [],
  revenueTotals: { subtotalCents: 100000, taxCents: 21000, totalCents: 121000 },
  vatByRate: [{ rateBp: 2100, baseCents: 100000, vatCents: 21000, grossCents: 121000 }],
  vatTotals: { baseCents: 100000, vatCents: 21000, grossCents: 121000 },
  outstanding: [],
  outstandingTotalCents: 0,
};

test("mergeAccountingIntegrationSettings sanitizes untrusted values", () => {
  const settings = mergeAccountingIntegrationSettings({
    enabled: true,
    provider: "exact_online",
    syncMode: "api_ready",
    relationPrefix: "NXTD",
    invoiceJournalCode: "VERK",
    accounts: {
      debtors: "1300",
      revenueLessons: "8000",
      bank: "11 00",
    },
    vatMappings: [
      { rateBp: 2100, code: "VH", description: "Hoog" },
      { rateBp: 2100, code: "DUP", description: "Dubbel" },
      { rateBp: -1, code: "BAD", description: "Slecht" },
    ],
  });

  assert.equal(settings.enabled, true);
  assert.equal(settings.provider, "exact_online");
  assert.equal(settings.syncMode, "api_ready");
  assert.equal(settings.relationPrefix, "NXTD");
  assert.equal(settings.invoiceJournalCode, "VERK");
  assert.equal(settings.accounts.bank, "1100");
  assert.equal(settings.vatMappings.filter((row) => row.rateBp === 2100).length, 1);
});

test("buildAccountingIntegrationHealth marks complete mapping ready", () => {
  const settings = mergeAccountingIntegrationSettings({
    enabled: true,
    provider: "moneybird",
    administrationName: "Rijschool administratie",
  }) as AccountingIntegrationSettings;

  const health = buildAccountingIntegrationHealth(settings, overview);

  assert.equal(health.status, "ready");
  assert.equal(health.score, 100);
});

test("buildAccountingIntegrationHealth blocks missing provider", () => {
  const settings = mergeAccountingIntegrationSettings({
    enabled: true,
    provider: "none",
  });

  const health = buildAccountingIntegrationHealth(settings, overview);

  assert.equal(health.status, "disabled");
});

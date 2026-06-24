import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKFLOW_TEMPLATE_CATALOG,
  mergeTenantWorkflowCatalogSettings,
  workflowCatalogSummary,
} from "./workflow-catalog";

test("workflow catalog merges untrusted tenant settings safely", () => {
  const firstTemplate = WORKFLOW_TEMPLATE_CATALOG[0];
  const settings = mergeTenantWorkflowCatalogSettings({
    version: 99,
    templates: {
      [firstTemplate.id]: {
        enabled: true,
        mode: "automatic",
        ownerRole: "finance",
        slaHours: "99999",
        channels: ["email", "unknown", "task", "email"],
        notes: "  Graag extra controleren.  ",
      },
      removed_template: {
        enabled: true,
      },
    },
  });

  assert.equal(settings.version, 1);
  assert.equal(settings.templates[firstTemplate.id].enabled, true);
  assert.equal(settings.templates[firstTemplate.id].mode, "automatic");
  assert.equal(settings.templates[firstTemplate.id].ownerRole, "finance");
  assert.equal(settings.templates[firstTemplate.id].slaHours, 8760);
  assert.deepEqual(settings.templates[firstTemplate.id].channels, [
    "email",
    "task",
  ]);
  assert.equal(
    settings.templates[firstTemplate.id].notes,
    "Graag extra controleren.",
  );
  assert.equal("removed_template" in settings.templates, false);
});

test("workflow catalog summary counts only enabled templates", () => {
  const firstTemplate = WORKFLOW_TEMPLATE_CATALOG[0];
  const secondTemplate = WORKFLOW_TEMPLATE_CATALOG[1];
  const settings = mergeTenantWorkflowCatalogSettings({
    templates: {
      [firstTemplate.id]: {
        enabled: true,
        mode: "manual",
      },
      [secondTemplate.id]: {
        enabled: true,
        mode: "suggested",
      },
    },
  });

  const summary = workflowCatalogSummary(settings);
  assert.equal(summary.total, WORKFLOW_TEMPLATE_CATALOG.length);
  assert.equal(summary.enabled, 2);
  assert.equal(summary.manual, 1);
  assert.equal(summary.suggested, 1);
  assert.equal(summary.automatic, 0);
});


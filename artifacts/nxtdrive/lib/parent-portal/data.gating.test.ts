import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadParentPortalData, type ParentPortalData } from "./data";
import {
  DEFAULT_PARENT_PORTAL_VISIBILITY,
  PARENT_PORTAL_SECTIONS,
  type ParentPortalSection,
  type ParentPortalVisibility,
} from "./visibility";

// ---------------------------------------------------------------------------
// Task #96 gating proof: a section the tenant switched OFF must be neither
// queried (no .from()) nor returned (null). We feed loadParentPortalData a
// recording stub Supabase client and assert which tables were touched and
// which result fields are populated. This is the automated counterpart to the
// RLS test: RLS proves a parent CAN'T read another child; this proves the
// portal WON'T even read a disabled section for its own child.
// ---------------------------------------------------------------------------

type RecordingClient = {
  client: SupabaseClient;
  tables: string[];
};

function makeRecordingClient(): RecordingClient {
  const tables: string[] = [];
  const builder = () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of [
      "select",
      "eq",
      "neq",
      "in",
      "gt",
      "gte",
      "lt",
      "lte",
      "or",
      "not",
      "order",
      "limit",
      "range",
    ]) {
      b[m] = chain;
    }
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    // Make the builder awaitable: resolves to an empty, error-free result.
    b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null });
    return b;
  };
  const client = {
    from(table: string) {
      tables.push(table);
      return builder();
    },
  } as unknown as SupabaseClient;
  return { client, tables };
}

const FALSE_VISIBILITY: ParentPortalVisibility = Object.fromEntries(
  PARENT_PORTAL_SECTIONS.map((s) => [s, false]),
) as ParentPortalVisibility;

function only(section: ParentPortalSection): ParentPortalVisibility {
  return { ...FALSE_VISIBILITY, [section]: true };
}

test("all sections disabled → zero queries and every field null", async () => {
  const { client, tables } = makeRecordingClient();
  const data = await loadParentPortalData(client, "t1", "s1", FALSE_VISIBILITY);

  assert.equal(tables.length, 0, `expected no queries, got: ${tables.join(", ")}`);
  for (const section of PARENT_PORTAL_SECTIONS) {
    assert.equal(
      data[section],
      null,
      `section ${section} should be null when disabled`,
    );
  }
});

test("only facturen enabled → only invoices queried, other fields null", async () => {
  const { client, tables } = makeRecordingClient();
  const data = await loadParentPortalData(client, "t1", "s1", only("facturen"));

  assert.deepEqual(
    Array.from(new Set(tables)),
    ["invoices"],
    `facturen must only read invoices, got: ${tables.join(", ")}`,
  );
  assert.notEqual(data.facturen, null, "facturen should be populated");
  for (const section of PARENT_PORTAL_SECTIONS) {
    if (section === "facturen") continue;
    assert.equal(
      data[section],
      null,
      `section ${section} should be null when only facturen is on`,
    );
  }
});

test("only betalingen enabled → only invoices queried", async () => {
  const { client, tables } = makeRecordingClient();
  const data = await loadParentPortalData(
    client,
    "t1",
    "s1",
    only("betalingen"),
  );

  assert.deepEqual(Array.from(new Set(tables)), ["invoices"]);
  assert.notEqual(data.betalingen, null);
  assert.equal(data.facturen, null);
});

test("only documenten enabled → only student_documents queried", async () => {
  const { client, tables } = makeRecordingClient();
  const data = await loadParentPortalData(
    client,
    "t1",
    "s1",
    only("documenten"),
  );

  assert.deepEqual(
    Array.from(new Set(tables)),
    ["student_documents"],
    `documenten must only read student_documents, got: ${tables.join(", ")}`,
  );
  // Empty stub → empty document list (proper empty state, not "unavailable").
  assert.deepEqual(data.documenten, { documents: [] });
  for (const section of PARENT_PORTAL_SECTIONS) {
    if (section === "documenten") continue;
    assert.equal(data[section], null);
  }
});

test("disabled documenten → student_documents never queried, field null", async () => {
  const { client, tables } = makeRecordingClient();
  const data = await loadParentPortalData(client, "t1", "s1", FALSE_VISIBILITY);
  assert.ok(
    !tables.includes("student_documents"),
    "disabled documenten must not query student_documents",
  );
  assert.equal(data.documenten, null);
});

test("all enabled (defaults) → every section populates (readiness path off)", async () => {
  // Sanity: with defaults every section is on, so each non-readiness section
  // must produce a non-null value from the stub (readiness path is exercised
  // separately by integration coverage; here we only assert gating shape).
  const vis = { ...DEFAULT_PARENT_PORTAL_VISIBILITY, voortgang: false };
  const { client } = makeRecordingClient();
  const data: ParentPortalData = await loadParentPortalData(
    client,
    "t1",
    "s1",
    vis,
  );
  assert.notEqual(data.planning, null);
  assert.notEqual(data.facturen, null);
  assert.notEqual(data.betalingen, null);
  assert.notEqual(data.pakketinformatie, null);
  assert.notEqual(data.tegoed, null);
  assert.deepEqual(data.documenten, { documents: [] });
  assert.equal(data.voortgang, null);
});

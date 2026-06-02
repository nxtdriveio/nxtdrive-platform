import test from "node:test";
import assert from "node:assert/strict";
import { roleHomePath } from "./role-home";
import type { AuthenticatedUser, MemberRole } from "@/lib/types";

// ---------------------------------------------------------------------------
// Task #96 access-control regression: the /student layout redirects any user
// admitted there WITHOUT the `student` role to roleHomePath(...). The student
// PWA is NOT subject to the tenant's per-section parent-portal visibility
// toggles, so a pure parent reaching /student would bypass a section the tenant
// disabled. These tests pin the destinations the guard relies on:
//   - pure parent      → /ouder   (kept out of /student)
//   - student+parent   → /student (dual-role keeps own student data)
//   - admin+parent     → /backoffice (never lands on /student)
// ---------------------------------------------------------------------------

function userWith(roles: MemberRole[], tenantId = "t1"): AuthenticatedUser {
  return {
    profile: { is_platform_admin: false },
    memberships: roles.map((role) => ({ tenant_id: tenantId, role })),
  } as unknown as AuthenticatedUser;
}

test("pure parent is routed to /ouder (kept out of the student PWA)", () => {
  assert.equal(roleHomePath(userWith(["parent"]), "t1"), "/ouder");
});

test("student+parent dual-role is routed to /student (own student data)", () => {
  assert.equal(roleHomePath(userWith(["parent", "student"]), "t1"), "/student");
});

test("admin+parent is routed to /backoffice, never /student", () => {
  const home = roleHomePath(userWith(["tenant_admin", "parent"]), "t1");
  assert.equal(home, "/backoffice");
  assert.notEqual(home, "/student");
});

test("plain student is routed to /student", () => {
  assert.equal(roleHomePath(userWith(["student"]), "t1"), "/student");
});

test("platform admin always lands on /admin", () => {
  const user = {
    profile: { is_platform_admin: true },
    memberships: [{ tenant_id: "t1", role: "parent" as MemberRole }],
  } as unknown as AuthenticatedUser;
  assert.equal(roleHomePath(user, "t1"), "/admin");
});

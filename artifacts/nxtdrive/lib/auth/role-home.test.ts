import test from "node:test";
import assert from "node:assert/strict";
import { roleHomePath } from "./role-home";
import type { AuthenticatedUser, MemberRole } from "@/lib/types";

function userWith(roles: MemberRole[], tenantId = "t1"): AuthenticatedUser {
  return {
    profile: { is_platform_admin: false },
    memberships: roles.map((role) => ({ tenant_id: tenantId, role })),
  } as unknown as AuthenticatedUser;
}

test("pure parent is routed to /ouder", () => {
  assert.equal(roleHomePath(userWith(["parent"]), "t1"), "/ouder");
});

test("student plus parent stays in /leerling", () => {
  assert.equal(roleHomePath(userWith(["parent", "student"]), "t1"), "/leerling");
});

test("admin plus parent lands in /backoffice", () => {
  const home = roleHomePath(userWith(["tenant_admin", "parent"]), "t1");
  assert.equal(home, "/backoffice");
  assert.notEqual(home, "/leerling");
});

test("plain student is routed to /leerling", () => {
  assert.equal(roleHomePath(userWith(["student"]), "t1"), "/leerling");
});

test("student plus instructor resolves to /instructeur so no app selector is needed", () => {
  assert.equal(roleHomePath(userWith(["student", "instructor"]), "t1"), "/instructeur");
});

test("tenant admin plus instructor resolves to /backoffice over the instructor app", () => {
  assert.equal(roleHomePath(userWith(["tenant_admin", "instructor"]), "t1"), "/backoffice");
});

test("platform admin always lands on /admin", () => {
  const user = {
    profile: { is_platform_admin: true },
    memberships: [{ tenant_id: "t1", role: "parent" as MemberRole }],
  } as unknown as AuthenticatedUser;
  assert.equal(roleHomePath(user, "t1"), "/admin");
});

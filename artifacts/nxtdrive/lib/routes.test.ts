import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsKeyForPath,
  canonicalizeAppPath,
  learnerNavigation,
  routeManifest,
} from "./routes";

test("the central manifest has unique Dutch canonical paths and analytics keys", () => {
  const canonicalPaths = routeManifest.map((route) => route.canonicalPath);
  assert.equal(new Set(canonicalPaths).size, canonicalPaths.length);
  assert.ok(routeManifest.every((route) => route.analyticsKey.length > 0));
  assert.ok(
    learnerNavigation.every((route) =>
      route.canonicalPath.startsWith("/leerling"),
    ),
  );
});

test("legacy learner aliases resolve directly to canonical paths", () => {
  assert.equal(canonicalizeAppPath("/student"), "/leerling");
  assert.equal(canonicalizeAppPath("/student/agenda"), "/leerling/lessen");
  assert.equal(
    canonicalizeAppPath("/student/lessons/les met spatie"),
    "/leerling/lessen/les%20met%20spatie",
  );
  assert.equal(
    canonicalizeAppPath("/student/messages/thread-42"),
    "/leerling/berichten/thread-42",
  );
  assert.equal(analyticsKeyForPath("/student/cbr-exams"), "learner.exams");
});

test("registered aliases never point at another alias", () => {
  const aliases = new Set(routeManifest.flatMap((route) => route.aliases));
  for (const route of routeManifest) {
    assert.equal(aliases.has(route.canonicalPath), false, route.canonicalPath);
  }
});

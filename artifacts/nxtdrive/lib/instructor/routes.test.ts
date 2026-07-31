import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInstructorRoute,
  canonicalizeInstructorPath,
  instructorAnalyticsKeyForPath,
  instructorNavigation,
  instructorRouteAliases,
} from "./routes";

test("the instructor route manifest exposes the Dutch canonical navigation", () => {
  assert.deepEqual(
    instructorNavigation.map((route) => route.canonicalPath),
    [
      "/instructeur",
      "/instructeur/agenda",
      "/instructeur/leerlingen",
      "/instructeur/taken",
      "/instructeur/meer",
    ],
  );
  assert.ok(
    instructorNavigation.every(
      (route) =>
        route.allowedRoles.includes("instructor") &&
        route.analyticsKey.startsWith("instructor."),
    ),
  );
});

test("legacy English and /instructor paths canonicalize without redirect chains", () => {
  const aliases = new Map<string, string>(
    instructorRouteAliases.map((alias) => [alias.source, alias.destination]),
  );

  assert.equal(aliases.get("/instructor"), "/instructeur");
  assert.equal(aliases.get("/instructor/students"), "/instructeur/leerlingen");
  assert.equal(
    canonicalizeInstructorPath("/instructor/students"),
    "/instructeur/leerlingen",
  );
  assert.equal(aliases.get("/instructeur/lessons"), "/instructeur/agenda");
  assert.equal(aliases.get("/instructor/availability"), "/instructeur/beschikbaarheid");
  assert.equal(
    canonicalizeInstructorPath("/instructor/messages/thread-42"),
    "/instructeur/berichten/thread-42",
  );
  assert.equal(
    canonicalizeInstructorPath("/instructor/evaluations/lesson-42"),
    "/instructeur/lessen/lesson-42",
  );
  assert.equal(
    instructorAnalyticsKeyForPath("/instructor/evaluations/lesson-42"),
    "instructor.lesson",
  );

  for (const destination of aliases.values()) {
    assert.equal(
      aliases.has(destination),
      false,
      `alias ${destination} must already be canonical`,
    );
  }
});

test("route builder interpolates dynamic segments and retains query parameters", () => {
  assert.equal(
    buildInstructorRoute(
      "lesson",
      { lessonId: "les met spatie" },
      { terug: "/instructeur?tab=vandaag", filter: ["open", "urgent"] },
    ),
    "/instructeur/lessen/les%20met%20spatie?terug=%2Finstructeur%3Ftab%3Dvandaag&filter=open&filter=urgent",
  );
});

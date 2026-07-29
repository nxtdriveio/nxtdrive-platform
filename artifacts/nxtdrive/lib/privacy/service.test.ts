import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mayAccessPrivacyRequest } from "@/lib/privacy/service";

describe("privacy request IDOR guard", () => {
  const request = {
    tenant_id: "tenant-a",
    subject_user_id: "subject-a",
    requested_by: "requester-a",
  };

  it("allows the subject, requester and authorized tenant staff", () => {
    assert.equal(
      mayAccessPrivacyRequest(request, "subject-a", []),
      true,
    );
    assert.equal(
      mayAccessPrivacyRequest(request, "requester-a", []),
      true,
    );
    assert.equal(
      mayAccessPrivacyRequest(request, "staff-a", ["tenant-a"]),
      true,
    );
  });

  it("blocks a user from another tenant even with a guessed request id", () => {
    assert.equal(
      mayAccessPrivacyRequest(request, "attacker", ["tenant-b"]),
      false,
    );
  });
});

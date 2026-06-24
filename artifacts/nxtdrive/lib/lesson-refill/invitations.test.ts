import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isInvitationActionable } from "@/lib/lesson-refill/invitations";

describe("lesson refill invitations", () => {
  it("only allows pending invitations before their expiry", () => {
    const now = new Date("2026-06-23T10:00:00.000Z");

    assert.equal(
      isInvitationActionable(
        {
          status: "pending",
          expiresAt: "2026-06-23T10:00:01.000Z",
        },
        now,
      ),
      true,
    );
    assert.equal(
      isInvitationActionable(
        {
          status: "pending",
          expiresAt: "2026-06-23T10:00:00.000Z",
        },
        now,
      ),
      false,
    );
    assert.equal(
      isInvitationActionable(
        {
          status: "accepted",
          expiresAt: "2026-06-23T10:15:00.000Z",
        },
        now,
      ),
      false,
    );
    assert.equal(
      isInvitationActionable(
        {
          status: "cancelled",
          expiresAt: "2026-06-23T10:15:00.000Z",
        },
        now,
      ),
      false,
    );
  });
});

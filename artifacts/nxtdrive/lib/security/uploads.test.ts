import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasExpectedDocumentSignature,
  scanDocumentForMalware,
} from "@/lib/security/uploads";

describe("secure document uploads", () => {
  it("checks bytes instead of trusting the claimed MIME type", () => {
    assert.equal(
      hasExpectedDocumentSignature(
        new TextEncoder().encode("%PDF-1.7\n"),
        "application/pdf",
      ),
      true,
    );
    assert.equal(
      hasExpectedDocumentSignature(
        new TextEncoder().encode("<script>alert(1)</script>"),
        "application/pdf",
      ),
      false,
    );
  });

  it("blocks the standard antivirus test marker locally", async () => {
    assert.equal(
      await scanDocumentForMalware(
        new TextEncoder().encode(
          "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
        ),
      ),
      "INFECTED",
    );
  });
});

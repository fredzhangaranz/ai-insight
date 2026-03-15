import { describe, expect, it } from "vitest";

import { PromptSanitizationService } from "@/lib/services/prompt-sanitization.service";

describe("PromptSanitizationService", () => {
  it("replaces patient mentions with opaque placeholders", () => {
    const service = new PromptSanitizationService();

    const result = service.sanitize({
      question: "show me wound area over time for patient Fred Smith",
      patientMentions: [
        {
          matchedText: "Fred Smith",
          opaqueRef: "abc123opaque",
        },
      ],
    });

    expect(result.sanitizedQuestion).toContain("PATIENT_REF_1");
    expect(result.sanitizedQuestion).not.toContain("Fred Smith");
    expect(result.trustedContextLines).toEqual([
      "Resolved patient placeholder PATIENT_REF_1: abc123opaque; bind parameter @patientId1 is available.",
    ]);
  });
});

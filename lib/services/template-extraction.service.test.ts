import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/template-flags", () => ({
  isTemplateSystemEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  getAIProvider: vi.fn(),
}));

import { extractTemplateDraft } from "./template-extraction.service";
import { TemplateServiceError } from "./template.service";
import type {
  TemplateExtractionDraft,
  TemplateExtractionResponse,
} from "@/lib/ai/providers/i-query-funnel-provider";
import {
  isTemplateSystemEnabled,
} from "@/lib/config/template-flags";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";

const isTemplateSystemEnabledMock =
  isTemplateSystemEnabled as unknown as vi.Mock;
const getAIProviderMock = getAIProvider as unknown as vi.Mock;

describe("template-extraction.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTemplateSystemEnabledMock.mockReturnValue(true);
  });

  afterEach(() => {
    isTemplateSystemEnabledMock.mockReturnValue(true);
  });

  it("throws when template system is disabled", async () => {
    isTemplateSystemEnabledMock.mockReturnValue(false);

    await expect(
      extractTemplateDraft({
        questionText: "How many assessments?",
        sqlQuery: "SELECT 1",
      })
    ).rejects.toBeInstanceOf(TemplateServiceError);
  });

  it("normalizes extracted draft and runs validation", async () => {
    const draft: TemplateExtractionDraft = {
      name: "Count Assessments by Window ",
      intent: " aggregation_by_category ",
      description: " Counts distinct assessments for a patient over a lookback window. ",
      sqlPattern: `SELECT TOP 1000
  COUNT(DISTINCT A.id) AS assessmentCount
FROM rpt.Assessment AS A
JOIN rpt.DimDate AS D ON D.id = A.dimDateFk
WHERE A.patientFk = {patientId}
  AND D.date >= DATEADD(day, -{windowDays}, GETUTCDATE())`,
      placeholdersSpec: {
        slots: [
          {
            name: " patientId ",
            type: " guid ",
            semantic: " patient_id ",
            required: true,
            validators: [" non-empty "],
          },
        ],
      },
      keywords: ["count", "assessments", "count"],
      tags: ["patient-analysis", "patient-analysis"],
      examples: [
        "How many assessments has this patient had in the past 180 days?",
        "How many assessments has this patient had in the past 180 days?",
      ],
    };

    const response: TemplateExtractionResponse = {
      modelId: "claude-3-5-sonnet-latest",
      draft,
      warnings: ["Ensure windowDays default is appropriate."],
    };

    getAIProviderMock.mockResolvedValue({
      extractTemplateDraft: vi.fn().mockResolvedValue(response),
    });

    const result = await extractTemplateDraft({
      questionText: "How many assessments has this patient had in the past 180 days?",
      sqlQuery: draft.sqlPattern,
    });

    expect(result.modelId).toBe("claude-3-5-sonnet-latest");
    expect(result.warnings).toEqual([
      "Ensure windowDays default is appropriate.",
    ]);
    expect(result.draft.name).toBe("Count Assessments by Window");
    expect(result.draft.intent).toBe("aggregation_by_category");
    expect(result.draft.placeholdersSpec?.slots.map((slot) => slot.name)).toEqual(
      expect.arrayContaining(["patientId", "windowDays"])
    );
    expect(result.draft.keywords).toEqual([
      "count",
      "assessments",
    ]);
    expect(result.draft.tags).toEqual(["patient-analysis"]);
    expect(result.draft.examples).toEqual([
      "How many assessments has this patient had in the past 180 days?",
    ]);
    expect(result.validation.valid).toBe(true);
  });
});

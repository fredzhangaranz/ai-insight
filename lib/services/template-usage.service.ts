import { getInsightGenDbPool } from "../db";

export interface TemplateUsageCreateInput {
  templateVersionId?: number;
  subQuestionId?: number;
  questionText: string;
  matchedKeywords?: string[];
  matchedExample?: string | null;
  chosen?: boolean;
}

export interface TemplateUsageCreateResult {
  id: number;
}

export interface TemplateUsageOutcomeInput {
  templateUsageId: number;
  success: boolean;
  errorType?: string | null;
}

export async function createTemplateUsage(
  input: TemplateUsageCreateInput
): Promise<TemplateUsageCreateResult> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
    INSERT INTO "TemplateUsage"
      ("templateVersionId",
       "subQuestionId",
       "questionText",
       chosen,
       "matchedKeywords",
       "matchedExample")
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id;
  `,
    [
      input.templateVersionId ?? null,
      input.subQuestionId ?? null,
      input.questionText ?? null,
      input.chosen ?? true,
      input.matchedKeywords && input.matchedKeywords.length > 0
        ? input.matchedKeywords
        : null,
      input.matchedExample ?? null,
    ]
  );

  return { id: result.rows[0].id as number };
}

export async function markTemplateUsageOutcome(
  outcome: TemplateUsageOutcomeInput
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query(
    `
    UPDATE "TemplateUsage"
    SET success = $2,
        "errorType" = $3,
        "latencyMs" = GREATEST(
          0,
          CAST(EXTRACT(EPOCH FROM (NOW() - "matchedAt")) * 1000 AS INTEGER)
        )
    WHERE id = $1;
  `,
    [outcome.templateUsageId, outcome.success, outcome.errorType ?? null]
  );
}

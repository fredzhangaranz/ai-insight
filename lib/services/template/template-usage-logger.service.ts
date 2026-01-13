import { getInsightGenDbPool } from "@/lib/db";

const BASE_INSERT_SQL = `
  INSERT INTO "TemplateUsage"
    ("templateVersionId",
     "subQuestionId",
     "questionText",
     chosen,
     success,
     "matchedKeywords",
     "matchedExample")
  VALUES ($1, $2, $3, $4, NULL, $5, $6)
  RETURNING id;
`;

const BASE_UPDATE_SQL = `
  UPDATE "TemplateUsage"
  SET success = $2,
      "errorType" = $3,
      "latencyMs" = GREATEST(
        0,
        CAST(EXTRACT(EPOCH FROM (NOW() - "matchedAt")) * 1000 AS INTEGER)
      )
  WHERE id = $1;
`;

const DIRECT_UPDATE_SQL = `
  UPDATE "TemplateUsage"
  SET success = $2,
      "errorType" = $3,
      "latencyMs" = $4
  WHERE id = $1;
`;

export type TemplateUsageMode = "template_direct" | "template_reference";

export interface TemplateUsageLog {
  templateVersionId: number;
  subQuestionId?: number | null;
  question: string;
  mode: TemplateUsageMode;
  placeholderValues?: Record<string, unknown>;
  matchedKeywords?: string[];
  matchedExample?: string | null;
}

export interface TemplateUsageOutcome {
  templateUsageId: number;
  success: boolean;
  errorType?: string | null;
  latencyMs?: number | null;
}

export class TemplateUsageLoggerService {
  constructor(
    private readonly dbProvider: typeof getInsightGenDbPool = getInsightGenDbPool
  ) {}

  async logUsageStart(log: TemplateUsageLog): Promise<number> {
    const pool = await this.dbProvider();
    const metadata = this.buildMetadataSnapshot(log);
    const matchedKeywords = this.buildKeywords(log);

    const result = await pool.query(BASE_INSERT_SQL, [
      log.templateVersionId,
      log.subQuestionId ?? null,
      log.question,
      log.mode === "template_direct",
      matchedKeywords,
      metadata ?? log.matchedExample ?? null,
    ]);

    return result.rows[0]?.id as number;
  }

  async logUsageOutcome(outcome: TemplateUsageOutcome): Promise<void> {
    const pool = await this.dbProvider();
    if (outcome.latencyMs != null) {
      await pool.query(DIRECT_UPDATE_SQL, [
        outcome.templateUsageId,
        outcome.success,
        outcome.errorType ?? null,
        Math.max(0, Math.round(outcome.latencyMs)),
      ]);
      return;
    }

    await pool.query(BASE_UPDATE_SQL, [
      outcome.templateUsageId,
      outcome.success,
      outcome.errorType ?? null,
    ]);
  }

  private buildKeywords(log: TemplateUsageLog): string[] | null {
    const keywords = [
      ...(log.matchedKeywords ?? []),
      `mode:${log.mode}`,
    ];
    return keywords.length ? keywords : null;
  }

  private buildMetadataSnapshot(
    log: TemplateUsageLog
  ): string | null {
    if (!log.placeholderValues || Object.keys(log.placeholderValues).length === 0) {
      return null;
    }

    try {
      return JSON.stringify({
        placeholderValues: log.placeholderValues,
      });
    } catch {
      return null;
    }
  }
}

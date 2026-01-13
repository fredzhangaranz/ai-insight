import { NextRequest, NextResponse } from "next/server";

import { withErrorHandling } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { getInsightGenDbPool } from "@/lib/db";

interface RawLogRow {
  id: string;
  customer_id: string;
  customer_code: string;
  question: string;
  intent: string;
  confidence: number;
  method: "pattern" | "ai" | "fallback";
  latency_ms: number;
  matched_patterns: string[] | null;
  reasoning: string | null;
  created_at: string;
}

interface RawDisagreementRow {
  id: string;
  customer_id: string;
  customer_code: string;
  question: string;
  pattern_intent: string;
  pattern_confidence: number;
  ai_intent: string;
  ai_confidence: number;
  created_at: string;
  resolved: boolean;
  resolution_notes: string | null;
}

function clampLimit(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

async function cleanupOldLogs(): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query(
    `DELETE FROM "IntentClassificationLog" WHERE created_at < NOW() - INTERVAL '30 days'`
  );
  await pool.query(
    `DELETE FROM "IntentClassificationDisagreement" WHERE created_at < NOW() - INTERVAL '30 days'`
  );
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const search = req.nextUrl.searchParams;
  const customerId = search.get("customerId");
  const intent = search.get("intent");
  const method = search.get("method");
  const startDate = search.get("startDate");
  const endDate = search.get("endDate");
  const limit = clampLimit(parseInt(search.get("limit") ?? "100", 10), 1, 500);

  await cleanupOldLogs();

  const baseFilters: string[] = [];
  const baseValues: any[] = [];

  if (customerId) {
    baseFilters.push(`l.customer_id = $${baseValues.length + 1}`);
    baseValues.push(customerId);
  }
  if (startDate) {
    baseFilters.push(`l.created_at >= $${baseValues.length + 1}`);
    baseValues.push(new Date(startDate).toISOString());
  }
  if (endDate) {
    baseFilters.push(`l.created_at <= $${baseValues.length + 1}`);
    baseValues.push(new Date(endDate).toISOString());
  }

  const logFilters = [...baseFilters];
  const logValues = [...baseValues];
  if (intent) {
    logFilters.push(`l.intent = $${logValues.length + 1}`);
    logValues.push(intent);
  }
  if (method) {
    logFilters.push(`l.method = $${logValues.length + 1}`);
    logValues.push(method);
  }

  const logWhere = logFilters.length ? `WHERE ${logFilters.join(" AND ")}` : "";

  const pool = await getInsightGenDbPool();
  const logsResult = await pool.query<RawLogRow>(
    `
      SELECT
        l.id::text,
        l.customer_id::text,
        c.code AS customer_code,
        l.question,
        l.intent,
        l.confidence::float,
        l.method,
        l.latency_ms,
        l.matched_patterns,
        l.reasoning,
        l.created_at::text
      FROM "IntentClassificationLog" l
      JOIN "Customer" c ON c.id = l.customer_id
      ${logWhere}
      ORDER BY l.created_at DESC
      LIMIT $${logValues.length + 1}
    `,
    [...logValues, limit]
  );

  const disagreementFilters = [...baseFilters];
  const disagreementValues = [...baseValues];
  const disagreementWhere = disagreementFilters.length
    ? `WHERE ${disagreementFilters.join(" AND ")}`
    : "";

  const disagreementsResult = await pool.query<RawDisagreementRow>(
    `
      SELECT
        d.id::text,
        d.customer_id::text,
        c.code AS customer_code,
        d.question,
        d.pattern_intent,
        d.pattern_confidence::float,
        d.ai_intent,
        d.ai_confidence::float,
        d.created_at::text,
        d.resolved,
        d.resolution_notes
      FROM "IntentClassificationDisagreement" d
      JOIN "Customer" c ON c.id = d.customer_id
      ${disagreementWhere}
      ORDER BY d.created_at DESC
      LIMIT 50
    `,
    disagreementValues
  );

  const logs = logsResult.rows;
  const disagreements = disagreementsResult.rows;

  const summary = logs.reduce(
    (acc, log) => {
      acc.total += 1;
      acc.byMethod[log.method] = (acc.byMethod[log.method] ?? 0) + 1;
      acc.intentCounts[log.intent] = (acc.intentCounts[log.intent] ?? 0) + 1;
      acc.totalLatencyMs += log.latency_ms;
      return acc;
    },
    {
      total: 0,
      byMethod: { pattern: 0, ai: 0, fallback: 0 } as Record<string, number>,
      intentCounts: {} as Record<string, number>,
      totalLatencyMs: 0,
    }
  );

  const avgLatencyMs =
    summary.total > 0 ? Math.round(summary.totalLatencyMs / summary.total) : 0;

  return NextResponse.json({
    summary: {
      total: summary.total,
      byMethod: summary.byMethod,
      intentCounts: summary.intentCounts,
      avgLatencyMs,
      disagreementCount: disagreements.length,
    },
    logs: logs.map((log) => ({
      id: log.id,
      customerId: log.customer_id,
      customerCode: log.customer_code,
      question: log.question,
      intent: log.intent,
      confidence: log.confidence,
      method: log.method,
      latencyMs: log.latency_ms,
      matchedPatterns: log.matched_patterns,
      reasoning: log.reasoning,
      createdAt: log.created_at,
    })),
    disagreements: disagreements.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerCode: row.customer_code,
      question: row.question,
      patternIntent: row.pattern_intent,
      patternConfidence: row.pattern_confidence,
      aiIntent: row.ai_intent,
      aiConfidence: row.ai_confidence,
      createdAt: row.created_at,
      resolved: row.resolved,
      resolutionNotes: row.resolution_notes,
    })),
  });
});

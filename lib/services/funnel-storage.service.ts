import { getInsightGenDbPool } from "@/lib/db";
import type {
  QueryFunnel,
  SubQuestion,
  QueryFunnelStatus,
  SubQuestionStatus,
} from "@/lib/types/funnel";

// Minimal CRUD for QueryFunnel
export async function createFunnel(data: {
  assessmentFormVersionFk: string;
  originalQuestion: string;
}): Promise<QueryFunnel> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      INSERT INTO "QueryFunnel" ("assessmentFormVersionFk", "originalQuestion", status, "createdDate", "lastModifiedDate")
      VALUES ($1, $2, 'active', NOW(), NOW())
      RETURNING *
    `,
    [data.assessmentFormVersionFk, data.originalQuestion]
  );
  return result.rows[0];
}

export async function getFunnelById(id: number): Promise<QueryFunnel | null> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query('SELECT * FROM "QueryFunnel" WHERE id = $1', [
    id,
  ]);
  return result.rows[0] || null;
}

export async function findFunnelByQuestion(
  assessmentFormVersionFk: string,
  originalQuestion: string
): Promise<QueryFunnel | null> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      SELECT * FROM "QueryFunnel"
      WHERE "assessmentFormVersionFk" = $1
      AND "originalQuestion" = $2
      AND status = 'active'
      ORDER BY "createdDate" DESC
    `,
    [assessmentFormVersionFk, originalQuestion]
  );
  return result.rows[0] || null;
}

export async function findMostRecentFunnelByKey(
  assessmentFormVersionFk: string
): Promise<QueryFunnel | null> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      SELECT * FROM "QueryFunnel"
      WHERE "assessmentFormVersionFk" = $1
      ORDER BY "createdDate" DESC
      LIMIT 1
    `,
    [assessmentFormVersionFk]
  );
  return result.rows[0] || null;
}

export async function listFunnels(): Promise<QueryFunnel[]> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    'SELECT * FROM "QueryFunnel" ORDER BY "createdDate" DESC'
  );
  return result.rows;
}

export async function updateFunnelStatus(
  id: number,
  status: QueryFunnelStatus
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query(
    `UPDATE "QueryFunnel" SET status = $1, "lastModifiedDate" = NOW() WHERE id = $2`,
    [status, id]
  );
}

// SubQuestions
export async function addSubQuestion(
  funnelId: number,
  data: { questionText: string; order: number; sqlQuery?: string }
): Promise<SubQuestion> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      INSERT INTO "SubQuestions" ("funnelId", "questionText", "order", "sqlQuery", status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `,
    [funnelId, data.questionText, data.order, data.sqlQuery ?? null]
  );
  return result.rows[0];
}

export async function addSubQuestions(
  funnelId: number,
  subQuestions: Array<{
    questionText: string;
    order: number;
    sqlQuery?: string;
  }>
): Promise<SubQuestion[]> {
  const pool = await getInsightGenDbPool();
  const client = await pool.connect();
  const results: SubQuestion[] = [];

  try {
    await client.query("BEGIN");
    for (const sq of subQuestions) {
      const result = await client.query(
        `
          INSERT INTO "SubQuestions" ("funnelId", "questionText", "order", "sqlQuery", status)
          VALUES ($1, $2, $3, $4, 'pending')
          RETURNING *
        `,
        [funnelId, sq.questionText, sq.order, sq.sqlQuery ?? null]
      );
      results.push(result.rows[0]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return results;
}

export async function getSubQuestions(
  funnelId: number
): Promise<SubQuestion[]> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    'SELECT * FROM "SubQuestions" WHERE "funnelId" = $1 ORDER BY "order"',
    [funnelId]
  );
  return result.rows;
}

export async function updateSubQuestionStatus(
  id: number,
  status: SubQuestionStatus
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query('UPDATE "SubQuestions" SET status = $1 WHERE id = $2', [
    status,
    id,
  ]);
}

export async function updateSubQuestionSql(
  id: number,
  sqlQuery: string,
  metadata?: {
    sqlExplanation?: string;
    sqlValidationNotes?: string;
    sqlMatchedTemplate?: string;
  }
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query(
    `
    UPDATE "SubQuestions"
    SET "sqlQuery" = $1,
        "sqlExplanation" = $2,
        "sqlValidationNotes" = $3,
        "sqlMatchedTemplate" = $4
    WHERE id = $5
  `,
    [
      sqlQuery,
      metadata?.sqlExplanation ?? null,
      metadata?.sqlValidationNotes ?? null,
      metadata?.sqlMatchedTemplate ?? null,
      id,
    ]
  );
}

export async function updateSubQuestionText(
  id: number,
  questionText: string
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query(
    'UPDATE "SubQuestions" SET "questionText" = $1 WHERE id = $2',
    [questionText, id]
  );
}

// QueryResults
export async function storeQueryResult(
  subQuestionId: number,
  resultData: any
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query(
    `
      INSERT INTO "QueryResults" ("subQuestionId", "resultData")
      VALUES ($1, $2)
    `,
    [subQuestionId, JSON.stringify(resultData)]
  );
}

export async function getQueryResult(
  subQuestionId: number
): Promise<any | null> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    'SELECT "resultData" FROM "QueryResults" WHERE "subQuestionId" = $1 ORDER BY "executionDate" DESC LIMIT 1',
    [subQuestionId]
  );
  if (result.rows.length === 0) return null;
  try {
    return JSON.parse(result.rows[0].resultData);
  } catch {
    return result.rows[0].resultData;
  }
}

export async function cleanupOldResults(
  olderThanHours: number = 24
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await pool.query(
    `
    DELETE FROM "QueryResults"
    WHERE "executionDate" < NOW() - INTERVAL '${olderThanHours} hours'
  `
  );
}

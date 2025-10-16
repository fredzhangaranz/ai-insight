import { getInsightGenDbPool } from "@/lib/db";
import type { Pool, PoolClient } from "pg";
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
  userId: number;
  createdBy?: string | null;
}): Promise<QueryFunnel> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      INSERT INTO "QueryFunnel" ("assessmentFormVersionFk", "originalQuestion", status, "createdDate", "lastModifiedDate", "userId", "createdBy")
      VALUES ($1, $2, 'active', NOW(), NOW(), $3, $4)
      RETURNING *
    `,
    [
      data.assessmentFormVersionFk,
      data.originalQuestion,
      data.userId,
      data.createdBy ?? null,
    ]
  );
  return result.rows[0];
}

async function ensureFunnelOwnedByUser(
  executor: Pool | PoolClient,
  funnelId: number,
  userId: number
): Promise<void> {
  const check = await executor.query(
    'SELECT 1 FROM "QueryFunnel" WHERE id = $1 AND "userId" = $2',
    [funnelId, userId]
  );
  if (check.rowCount === 0) {
    throw new Error("FunnelNotFound");
  }
}

async function ensureSubQuestionOwnedByUser(
  executor: Pool | PoolClient,
  subQuestionId: number,
  userId: number
): Promise<void> {
  const check = await executor.query(
    `SELECT 1
     FROM "SubQuestions" sq
     INNER JOIN "QueryFunnel" qf ON sq."funnelId" = qf.id
     WHERE sq.id = $1 AND qf."userId" = $2`,
    [subQuestionId, userId]
  );
  if (check.rowCount === 0) {
    throw new Error("SubQuestionNotFound");
  }
}

export async function getFunnelById(
  id: number,
  userId: number
): Promise<QueryFunnel | null> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    'SELECT * FROM "QueryFunnel" WHERE id = $1 AND "userId" = $2',
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function findFunnelByQuestion(
  assessmentFormVersionFk: string,
  originalQuestion: string,
  userId: number
): Promise<QueryFunnel | null> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      SELECT * FROM "QueryFunnel"
      WHERE "assessmentFormVersionFk" = $1
      AND "originalQuestion" = $2
      AND status = 'active'
      AND "userId" = $3
      ORDER BY "createdDate" DESC
    `,
    [assessmentFormVersionFk, originalQuestion, userId]
  );
  return result.rows[0] || null;
}

export async function findMostRecentFunnelByKey(
  assessmentFormVersionFk: string,
  userId: number
): Promise<QueryFunnel | null> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      SELECT * FROM "QueryFunnel"
      WHERE "assessmentFormVersionFk" = $1
      AND "userId" = $2
      ORDER BY "createdDate" DESC
      LIMIT 1
    `,
    [assessmentFormVersionFk, userId]
  );
  return result.rows[0] || null;
}

export async function listFunnels(userId: number): Promise<QueryFunnel[]> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    'SELECT * FROM "QueryFunnel" WHERE "userId" = $1 ORDER BY "createdDate" DESC',
    [userId]
  );
  return result.rows;
}

export async function listFunnelsByAssessmentKey(
  assessmentFormVersionFk: string,
  limit = 50,
  userId: number
): Promise<QueryFunnel[]> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      SELECT * FROM "QueryFunnel"
      WHERE "assessmentFormVersionFk" = $1
      AND "userId" = $2
      ORDER BY "createdDate" DESC
      LIMIT $3
    `,
    [assessmentFormVersionFk, userId, limit]
  );
  return result.rows;
}

export async function updateFunnelStatus(
  id: number,
  status: QueryFunnelStatus,
  userId: number
): Promise<void> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `UPDATE "QueryFunnel" SET status = $1, "lastModifiedDate" = NOW() WHERE id = $2 AND "userId" = $3`,
    [status, id, userId]
  );
  if (result.rowCount === 0) {
    throw new Error("FunnelNotFound");
  }
}

// SubQuestions
export async function addSubQuestion(
  funnelId: number,
  data: { questionText: string; order: number; sqlQuery?: string },
  userId: number
): Promise<SubQuestion> {
  const pool = await getInsightGenDbPool();
  await ensureFunnelOwnedByUser(pool, funnelId, userId);
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
  }>,
  userId: number
): Promise<SubQuestion[]> {
  const pool = await getInsightGenDbPool();
  const client = await pool.connect();
  const results: SubQuestion[] = [];

  try {
    await client.query("BEGIN");
    await ensureFunnelOwnedByUser(client, funnelId, userId);
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
  funnelId: number,
  userId: number
): Promise<SubQuestion[]> {
  const pool = await getInsightGenDbPool();
  await ensureFunnelOwnedByUser(pool, funnelId, userId);
  const result = await pool.query(
    'SELECT * FROM "SubQuestions" WHERE "funnelId" = $1 ORDER BY "order"',
    [funnelId]
  );
  return result.rows;
}

export async function updateSubQuestionStatus(
  id: number,
  status: SubQuestionStatus,
  userId: number
): Promise<void> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `UPDATE "SubQuestions" AS sq
     SET status = $1
     FROM "QueryFunnel" qf
     WHERE sq.id = $2 AND sq."funnelId" = qf.id AND qf."userId" = $3`,
    [status, id, userId]
  );
  if (result.rowCount === 0) {
    throw new Error("SubQuestionNotFound");
  }
}

export async function updateSubQuestionSql(
  id: number,
  sqlQuery: string,
  metadata?: {
    sqlExplanation?: string;
    sqlValidationNotes?: string;
    sqlMatchedTemplate?: string;
  },
  userId: number
): Promise<void> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
    UPDATE "SubQuestions" AS sq
    SET "sqlQuery" = $1,
        "sqlExplanation" = $2,
        "sqlValidationNotes" = $3,
        "sqlMatchedTemplate" = $4
    FROM "QueryFunnel" qf
    WHERE sq.id = $5
      AND sq."funnelId" = qf.id
      AND qf."userId" = $6
  `,
    [
      sqlQuery,
      metadata?.sqlExplanation ?? null,
      metadata?.sqlValidationNotes ?? null,
      metadata?.sqlMatchedTemplate ?? null,
      id,
      userId,
    ]
  );
  if (result.rowCount === 0) {
    throw new Error("SubQuestionNotFound");
  }
}

export async function updateSubQuestionText(
  id: number,
  questionText: string,
  userId: number
): Promise<void> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `UPDATE "SubQuestions" AS sq
     SET "questionText" = $1
     FROM "QueryFunnel" qf
     WHERE sq.id = $2 AND sq."funnelId" = qf.id AND qf."userId" = $3`,
    [questionText, id, userId]
  );
  if (result.rowCount === 0) {
    throw new Error("SubQuestionNotFound");
  }
}

export async function deleteFunnelCascade(
  id: number,
  userId: number
): Promise<void> {
  const pool = await getInsightGenDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureFunnelOwnedByUser(client, id, userId);
    await client.query(
      'DELETE FROM "QueryResults" WHERE "subQuestionId" IN (SELECT id FROM "SubQuestions" WHERE "funnelId" = $1)',
      [id]
    );
    await client.query('DELETE FROM "SubQuestions" WHERE "funnelId" = $1', [id]);
    await client.query('DELETE FROM "QueryFunnel" WHERE id = $1', [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// QueryResults
export async function storeQueryResult(
  subQuestionId: number,
  resultData: any,
  userId: number
): Promise<void> {
  const pool = await getInsightGenDbPool();
  await ensureSubQuestionOwnedByUser(pool, subQuestionId, userId);
  await pool.query(
    `
      INSERT INTO "QueryResults" ("subQuestionId", "resultData")
      VALUES ($1, $2)
    `,
    [subQuestionId, JSON.stringify(resultData)]
  );
}

export async function getQueryResult(
  subQuestionId: number,
  userId: number
): Promise<any | null> {
  const pool = await getInsightGenDbPool();
  await ensureSubQuestionOwnedByUser(pool, subQuestionId, userId);
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

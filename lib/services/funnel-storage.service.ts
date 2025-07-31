import { getDbPool } from "@/lib/db";
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
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("assessmentFormVersionFk", data.assessmentFormVersionFk)
    .input("originalQuestion", data.originalQuestion).query(`
      INSERT INTO rpt.QueryFunnel (assessmentFormVersionFk, originalQuestion, status, createdDate, lastModifiedDate)
      OUTPUT inserted.*
      VALUES (@assessmentFormVersionFk, @originalQuestion, 'active', GETUTCDATE(), GETUTCDATE())
    `);
  return result.recordset[0];
}

export async function getFunnelById(id: number): Promise<QueryFunnel | null> {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("id", id)
    .query("SELECT * FROM rpt.QueryFunnel WHERE id = @id");
  return result.recordset[0] || null;
}

export async function listFunnels(): Promise<QueryFunnel[]> {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .query("SELECT * FROM rpt.QueryFunnel ORDER BY createdDate DESC");
  return result.recordset;
}

export async function updateFunnelStatus(
  id: number,
  status: QueryFunnelStatus
): Promise<void> {
  const pool = await getDbPool();
  await pool
    .request()
    .input("id", id)
    .input("status", status)
    .query(
      `UPDATE rpt.QueryFunnel SET status = @status, lastModifiedDate = GETUTCDATE() WHERE id = @id`
    );
}

// SubQuestions
export async function addSubQuestion(
  funnelId: number,
  data: { questionText: string; order: number; sqlQuery?: string }
): Promise<SubQuestion> {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("funnelId", funnelId)
    .input("questionText", data.questionText)
    .input("order", data.order)
    .input("sqlQuery", data.sqlQuery ?? null).query(`
      INSERT INTO rpt.SubQuestions (funnelId, questionText, [order], sqlQuery, status)
      OUTPUT inserted.*
      VALUES (@funnelId, @questionText, @order, @sqlQuery, 'pending')
    `);
  return result.recordset[0];
}

export async function getSubQuestions(
  funnelId: number
): Promise<SubQuestion[]> {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("funnelId", funnelId)
    .query(
      "SELECT * FROM rpt.SubQuestions WHERE funnelId = @funnelId ORDER BY [order]"
    );
  return result.recordset;
}

export async function updateSubQuestionStatus(
  id: number,
  status: SubQuestionStatus
): Promise<void> {
  const pool = await getDbPool();
  await pool
    .request()
    .input("id", id)
    .input("status", status)
    .query(`UPDATE rpt.SubQuestions SET status = @status WHERE id = @id`);
}

export async function updateSubQuestionSql(
  id: number,
  sqlQuery: string
): Promise<void> {
  const pool = await getDbPool();
  await pool
    .request()
    .input("id", id)
    .input("sqlQuery", sqlQuery)
    .query(`UPDATE rpt.SubQuestions SET sqlQuery = @sqlQuery WHERE id = @id`);
}

// QueryResults
export async function storeQueryResult(
  subQuestionId: number,
  resultData: any
): Promise<void> {
  const pool = await getDbPool();
  await pool
    .request()
    .input("subQuestionId", subQuestionId)
    .input("resultData", JSON.stringify(resultData)).query(`
      INSERT INTO rpt.QueryResults (subQuestionId, resultData)
      VALUES (@subQuestionId, @resultData)
    `);
}

export async function getQueryResult(
  subQuestionId: number
): Promise<any | null> {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("subQuestionId", subQuestionId)
    .query(
      "SELECT TOP 1 resultData FROM rpt.QueryResults WHERE subQuestionId = @subQuestionId ORDER BY executionDate DESC"
    );
  if (result.recordset.length === 0) return null;
  try {
    return JSON.parse(result.recordset[0].resultData);
  } catch {
    return result.recordset[0].resultData;
  }
}

export async function cleanupOldResults(
  olderThanHours: number = 24
): Promise<void> {
  const pool = await getDbPool();
  await pool.request().query(`
    DELETE FROM rpt.QueryResults
    WHERE executionDate < DATEADD(hour, -${olderThanHours}, GETUTCDATE())
  `);
}

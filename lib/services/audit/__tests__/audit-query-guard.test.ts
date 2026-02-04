/**
 * File: lib/services/audit/__tests__/audit-query-guard.test.ts
 * Purpose: Unit tests for audit query guard service (Task P0.3)
 */

import { describe, expect, it } from "vitest";
import {
  assertAuditQueryUsesViews,
  getAllowedAuditViews,
} from "../audit-query-guard";

describe("assertAuditQueryUsesViews", () => {
  it("allows queries using QueryHistoryDaily", () => {
    const query = 'SELECT * FROM "QueryHistoryDaily" WHERE day >= CURRENT_DATE';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows queries using ClarificationMetricsDaily", () => {
    const query =
      'SELECT * FROM "ClarificationMetricsDaily" WHERE day >= CURRENT_DATE';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows queries using SqlValidationDaily", () => {
    const query = 'SELECT * FROM "SqlValidationDaily" WHERE day >= CURRENT_DATE';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows queries using QueryPerformanceDaily", () => {
    const query =
      'SELECT * FROM "QueryPerformanceDaily" WHERE day >= CURRENT_DATE';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows queries using QueryAuditExplorer", () => {
    const query = 'SELECT * FROM "QueryAuditExplorer" WHERE mode = \'template\'';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows queries using QueryAuditDetail", () => {
    const query =
      'SELECT * FROM "QueryAuditDetail" WHERE "queryHistoryId" = 123';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows queries using ConversationQueryHistory", () => {
    const query = 'SELECT * FROM "ConversationQueryHistory" WHERE "conversationThreadId" IS NOT NULL';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows case-insensitive view names", () => {
    const query = 'SELECT * FROM "queryhistorydaily"';
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("allows queries with multiple views", () => {
    const query = `
      SELECT qh.*, qp.*
      FROM "QueryHistoryDaily" qh
      JOIN "QueryPerformanceDaily" qp ON qh.day = qp.day
    `;
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("blocks queries using raw QueryHistory table", () => {
    const query = 'SELECT * FROM "QueryHistory" WHERE id = 1';
    expect(() => assertAuditQueryUsesViews(query)).toThrow(
      'raw table "QueryHistory" referenced'
    );
  });

  it("blocks queries using raw ClarificationAudit table", () => {
    const query = 'SELECT * FROM "ClarificationAudit" WHERE id = 1';
    expect(() => assertAuditQueryUsesViews(query)).toThrow(
      'raw table "ClarificationAudit" referenced'
    );
  });

  it("blocks queries using raw SqlValidationLog table", () => {
    const query = 'SELECT * FROM "SqlValidationLog" WHERE id = 1';
    expect(() => assertAuditQueryUsesViews(query)).toThrow(
      'raw table "SqlValidationLog" referenced'
    );
  });

  it("blocks queries using raw QueryPerformanceMetrics table", () => {
    const query = 'SELECT * FROM "QueryPerformanceMetrics" WHERE id = 1';
    expect(() => assertAuditQueryUsesViews(query)).toThrow(
      'raw table "QueryPerformanceMetrics" referenced'
    );
  });

  it("blocks case-insensitive raw table names", () => {
    const query = 'SELECT * FROM "queryhistory"';
    expect(() => assertAuditQueryUsesViews(query)).toThrow();
  });

  it("blocks queries with no materialized view", () => {
    const query = "SELECT COUNT(*) FROM some_other_table";
    expect(() => assertAuditQueryUsesViews(query)).toThrow(
      "no materialized view referenced"
    );
  });

  it("blocks queries that reference both view and raw table", () => {
    const query = `
      SELECT qh.*, q.*
      FROM "QueryHistoryDaily" qh
      JOIN "QueryHistory" q ON qh.day = DATE(q."createdAt")
    `;
    expect(() => assertAuditQueryUsesViews(query)).toThrow(
      'raw table "QueryHistory" referenced'
    );
  });

  it("handles queries with comments", () => {
    const query = `
      -- This query uses QueryHistoryDaily
      SELECT * FROM "QueryHistoryDaily"
    `;
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("handles multi-line queries", () => {
    const query = `
      SELECT
        day,
        "queryCount"
      FROM "QueryHistoryDaily"
      WHERE day >= CURRENT_DATE - INTERVAL '7 days'
    `;
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });

  it("handles queries with subqueries using views", () => {
    const query = `
      SELECT *
      FROM (
        SELECT * FROM "QueryHistoryDaily"
      ) subq
    `;
    expect(() => assertAuditQueryUsesViews(query)).not.toThrow();
  });
});

describe("getAllowedAuditViews", () => {
  it("returns list of allowed materialized views", () => {
    const views = getAllowedAuditViews();
    expect(views).toContain("QueryHistoryDaily");
    expect(views).toContain("ClarificationMetricsDaily");
    expect(views).toContain("SqlValidationDaily");
    expect(views).toContain("QueryPerformanceDaily");
    expect(views).toContain("QueryAuditExplorer");
    expect(views).toContain("QueryAuditDetail");
    expect(views).toContain("ConversationQueryHistory");
    expect(views.length).toBe(7);
  });

  it("returns readonly array", () => {
    const views = getAllowedAuditViews();
    expect(() => {
      (views as any).push("NewView");
    }).toThrow();
  });
});

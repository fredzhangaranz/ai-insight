import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";
import { getCustomer } from "@/lib/services/customer-service";
import { withErrorHandling } from "@/lib/error-handler";

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: { code: string } }) => {
    const customerCode = params.code;
    const runId = req.nextUrl.searchParams.get("runId");
    const level = req.nextUrl.searchParams.get("level");
    const stage = req.nextUrl.searchParams.get("stage");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);

    if (!customerCode) {
      return NextResponse.json(
        { error: "Customer code is required" },
        { status: 400 }
      );
    }

    const customer = await getCustomer(customerCode);
    if (!customer) {
      return NextResponse.json(
        { error: `Customer ${customerCode} not found` },
        { status: 404 }
      );
    }

    const pool = await getInsightGenDbPool();

    // Build query
    let query = `
      SELECT
        dl.id,
        dl.level,
        dl.stage,
        dl.component,
        dl.message,
        dl.metadata,
        dl.duration_ms,
        dl.logged_at
      FROM "DiscoveryLog" dl
      JOIN "CustomerDiscoveryRun" dr ON dr.id = dl.discovery_run_id
      JOIN "Customer" c ON c.id = dr.customer_id
      WHERE c.code = $1
    `;

    const queryParams: (string | number)[] = [customerCode.toUpperCase()];
    let paramCount = 2;

    // Filter by specific run if provided
    if (runId) {
      query += ` AND dr.id = $${paramCount}`;
      queryParams.push(runId);
      paramCount++;
    }

    // Filter by level if provided
    if (level) {
      query += ` AND dl.level = $${paramCount}`;
      queryParams.push(level);
      paramCount++;
    }

    // Filter by stage if provided
    if (stage) {
      query += ` AND dl.stage = $${paramCount}`;
      queryParams.push(stage);
      paramCount++;
    }

    query += ` ORDER BY dl.logged_at DESC LIMIT $${paramCount}`;
    queryParams.push(limit);

    const result = await pool.query(query, queryParams);

    // Compute summary statistics
    const summary = {
      totalLogs: result.rows.length,
      byLevel: {} as Record<string, number>,
      byStage: {} as Record<string, number>,
      byComponent: {} as Record<string, number>,
      errors: [] as typeof result.rows,
      warnings: [] as typeof result.rows,
    };

    for (const log of result.rows) {
      summary.byLevel[log.level] = (summary.byLevel[log.level] ?? 0) + 1;
      summary.byStage[log.stage] = (summary.byStage[log.stage] ?? 0) + 1;
      summary.byComponent[log.component] =
        (summary.byComponent[log.component] ?? 0) + 1;

      if (log.level === "error") {
        summary.errors.push(log);
      } else if (log.level === "warn") {
        summary.warnings.push(log);
      }
    }

    return NextResponse.json({
      logs: result.rows,
      summary,
    });
  }
);

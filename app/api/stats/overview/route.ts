import { NextRequest, NextResponse } from "next/server";
import { getSilhouetteDbPool, getInsightGenDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return NextResponse.json(
      { message: "Chart Insights API is disabled" },
      { status: 403 }
    );
  }

  try {
    // Forms active: count latest version per assessment type
    const mssql = await getSilhouetteDbPool();
    const formsQuery = `
      WITH LatestVersions AS (
        SELECT id, assessmentTypeId, name, definitionVersion,
               ROW_NUMBER() OVER (PARTITION BY assessmentTypeId ORDER BY definitionVersion DESC) AS rn
        FROM rpt.AssessmentTypeVersion
      )
      SELECT COUNT(*) AS cnt FROM LatestVersions WHERE rn = 1;
    `;
    const formsRes = await mssql.request().query(formsQuery);
    const formsActive = Number(formsRes.recordset?.[0]?.cnt || 0);

    // Insights total: count active saved insights from Postgres
    const pg = await getInsightGenDbPool();
    const insightsRes = await pg.query(
      'SELECT COUNT(*)::int AS cnt FROM "SavedInsights" WHERE "isActive" = TRUE'
    );
    const insightsTotal = insightsRes.rows?.[0]?.cnt || 0;

    return NextResponse.json({ formsActive, insightsTotal });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to load overview stats", error: e?.message || String(e) },
      { status: 500 }
    );
  }
}


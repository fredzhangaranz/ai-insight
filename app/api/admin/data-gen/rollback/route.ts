/**
 * POST /api/admin/data-gen/rollback
 * Reverts the last run:
 * - Update mode: executes rollbackSql to restore previous field values
 * - Insert mode: soft-deletes the patients (and related data) by patientIds
 * Body: { customerId, rollbackSql?: string[], patientIds?: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

function idList(ids: string[]): string {
  return ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { customerId, rollbackSql, patientIds } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);

    if (Array.isArray(rollbackSql) && rollbackSql.length > 0) {
      let executed = 0;
      for (const stmt of rollbackSql) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        const r = await pool.request().query(trimmed);
        executed += r.rowsAffected[0] ?? 0;
      }
      return NextResponse.json({
        success: true,
        message: "Rollback complete. Field changes reverted.",
        executed,
      });
    }

    if (!Array.isArray(patientIds) || patientIds.length === 0) {
      return NextResponse.json(
        { error: "rollbackSql or patientIds is required" },
        { status: 400 }
      );
    }

    const ids = patientIds as string[];
    const list = idList(ids);

    const deletedCounts: Record<string, number> = {};

    // 1. PatientAttribute (references PatientNote)
    const paResult = await pool.request().query(`
      UPDATE dbo.PatientAttribute SET isDeleted = 1
      WHERE patientNoteFk IN (SELECT id FROM dbo.PatientNote WHERE patientFk IN (${list}) AND isDeleted = 0)
      AND isDeleted = 0
    `);
    deletedCounts.patientAttributes = paResult.rowsAffected[0] || 0;

    // 2. PatientNote (references Patient)
    const pnResult = await pool.request().query(`
      UPDATE dbo.PatientNote SET isDeleted = 1
      WHERE patientFk IN (${list}) AND isDeleted = 0
    `);
    deletedCounts.patientNotes = pnResult.rowsAffected[0] || 0;

    // 3. Notes (references Series / Patient)
    const noteResult = await pool.request().query(`
      UPDATE dbo.Note SET isDeleted = 1
      WHERE patientFk IN (${list}) AND isDeleted = 0
    `);
    deletedCounts.notes = noteResult.rowsAffected[0] || 0;

    // 4. Measurements (via Series)
    const measurementResult = await pool.request().query(`
      UPDATE dbo.Measurement SET isDeleted = 1
      WHERE assessmentFk IN (
        SELECT s.id FROM dbo.Series s WHERE s.patientFk IN (${list}) AND s.isDeleted = 0
      )
      AND isDeleted = 0
    `);
    deletedCounts.measurements = measurementResult.rowsAffected[0] || 0;

    // 5. WoundState (via Wound)
    const woundStateResult = await pool.request().query(`
      UPDATE dbo.WoundState SET isDeleted = 1
      WHERE woundFk IN (
        SELECT w.id FROM dbo.Wound w WHERE w.patientFk IN (${list}) AND w.isDeleted = 0
      )
      AND isDeleted = 0
    `);
    deletedCounts.woundStates = woundStateResult.rowsAffected[0] || 0;

    // 6. Series
    const seriesResult = await pool.request().query(`
      UPDATE dbo.Series SET isDeleted = 1
      WHERE patientFk IN (${list}) AND isDeleted = 0
    `);
    deletedCounts.series = seriesResult.rowsAffected[0] || 0;

    // 7. Wounds
    const woundResult = await pool.request().query(`
      UPDATE dbo.Wound SET isDeleted = 1
      WHERE patientFk IN (${list}) AND isDeleted = 0
    `);
    deletedCounts.wounds = woundResult.rowsAffected[0] || 0;

    // 8. Patients
    const patientResult = await pool.request().query(`
      UPDATE dbo.Patient SET isDeleted = 1
      WHERE id IN (${list}) AND isDeleted = 0
    `);
    deletedCounts.patients = patientResult.rowsAffected[0] || 0;

    return NextResponse.json({
      success: true,
      deleted: deletedCounts,
      message: `Rolled back ${deletedCounts.patients} patient(s) and related data`,
    });
  } catch (error: unknown) {
    console.error("Error rolling back:", error);
    return NextResponse.json(
      {
        error: "Failed to rollback",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

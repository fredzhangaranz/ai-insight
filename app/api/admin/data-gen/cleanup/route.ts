/**
 * DELETE /api/admin/data-gen/cleanup
 * Soft-deletes all generated demo data (accessCode LIKE 'IG%')
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customerId = request.nextUrl.searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId query parameter is required" },
        { status: 400 }
      );
    }

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);

    // Soft-delete in dependency order (child → parent)
    const deletedCounts: Record<string, number> = {};

    // 1. Delete Notes (references Series)
    const noteResult = await pool.request().query(`
      UPDATE dbo.Note
      SET isDeleted = 1
      WHERE patientFk IN (
        SELECT id FROM dbo.Patient WHERE accessCode LIKE 'IG%'
      )
      AND isDeleted = 0
    `);
    deletedCounts.notes = noteResult.rowsAffected[0] || 0;

    // 2. Delete Measurements (references Series)
    const measurementResult = await pool.request().query(`
      UPDATE dbo.Measurement
      SET isDeleted = 1
      WHERE assessmentFk IN (
        SELECT s.id FROM dbo.Series s
        INNER JOIN dbo.Patient p ON s.patientFk = p.id
        WHERE p.accessCode LIKE 'IG%'
      )
      AND isDeleted = 0
    `);
    deletedCounts.measurements = measurementResult.rowsAffected[0] || 0;

    // 3. Delete WoundState (references Wound and Series)
    const woundStateResult = await pool.request().query(`
      UPDATE dbo.WoundState
      SET isDeleted = 1
      WHERE woundFk IN (
        SELECT w.id FROM dbo.Wound w
        INNER JOIN dbo.Patient p ON w.patientFk = p.id
        WHERE p.accessCode LIKE 'IG%'
      )
      AND isDeleted = 0
    `);
    deletedCounts.woundStates = woundStateResult.rowsAffected[0] || 0;

    // 4. Delete Series (references Patient and Wound)
    const seriesResult = await pool.request().query(`
      UPDATE dbo.Series
      SET isDeleted = 1
      WHERE patientFk IN (
        SELECT id FROM dbo.Patient WHERE accessCode LIKE 'IG%'
      )
      AND isDeleted = 0
    `);
    deletedCounts.series = seriesResult.rowsAffected[0] || 0;

    // 5. Delete Wounds (references Patient)
    const woundResult = await pool.request().query(`
      UPDATE dbo.Wound
      SET isDeleted = 1
      WHERE patientFk IN (
        SELECT id FROM dbo.Patient WHERE accessCode LIKE 'IG%'
      )
      AND isDeleted = 0
    `);
    deletedCounts.wounds = woundResult.rowsAffected[0] || 0;

    // 6. Delete Patients (root)
    const patientResult = await pool.request().query(`
      UPDATE dbo.Patient
      SET isDeleted = 1
      WHERE accessCode LIKE 'IG%'
      AND isDeleted = 0
    `);
    deletedCounts.patients = patientResult.rowsAffected[0] || 0;

    return NextResponse.json({
      success: true,
      deleted: deletedCounts,
      message: `Cleaned up ${deletedCounts.patients} generated patients and related data`,
    });
  } catch (error: any) {
    console.error("Error cleaning up generated data:", error);
    return NextResponse.json(
      {
        error: "Failed to cleanup generated data",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

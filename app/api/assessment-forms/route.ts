/**
 * File: /app/api/assessment-forms/route.ts
 *
 * Description: This API route fetches a list of all available assessment forms
 * from the database, formats them according to the API specification,
 * and returns them as a JSON response.
 */

import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

/**
 * Handles GET requests to /api/assessment-forms
 * @returns {Promise<NextResponse>} A JSON response containing the list of assessment forms or an error message.
 */
export async function GET() {
  console.log("API call to /api/assessment-forms received.");

  try {
    const pool = await getDbPool(); // Get the shared pool

    // Execute the user-provided query to get all assessment form types
    const query = `
      SELECT id, name, definitionVersion
      FROM SilhouetteAIDashboard.rpt.AssessmentTypeVersion 
      ORDER BY name;
    `;
    console.log("Executing query:", query);
    const result = await pool.request().query(query);
    console.log(`Query executed. Found ${result.recordset.length} records.`);

    // Map the database records to the specified API response format.
    // This is crucial for keeping the frontend consistent.
    const assessmentForms = result.recordset.map((record) => ({
      assessmentFormId: record.id,
      assessmentFormName: record.name,
      definitionVersion: record.definitionVersion,
    }));

    // Return the formatted data with a 200 OK status
    return NextResponse.json(assessmentForms);
  } catch (error: any) {
    console.error("API Error:", error);
    // Return a structured error response with a 500 status code
    return NextResponse.json(
      {
        message: "Failed to fetch AssessmentForms.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

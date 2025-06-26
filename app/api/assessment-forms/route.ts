/**
 * File: /app/api/assessment-forms/route.ts
 *
 * Description: This API route fetches a list of all available assessment forms
 * from the database, formats them according to the API specification,
 * and returns them as a JSON response.
 */

import { NextResponse } from "next/server";
import sql from "mssql";

// Database configuration using the environment variable from .env.local
// Ensure your DATABASE_URL is correctly set up.
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};

/**
 * Handles GET requests to /api/assessment-forms
 * @returns {Promise<NextResponse>} A JSON response containing the list of assessment forms or an error message.
 */
export async function GET() {
  console.log("API call to /api/assessment-forms received.");

  let pool;
  try {
    // Validate that the database connection string is configured
    if (!dbConfig.connectionString) {
      console.error(
        "Database connection string is not defined in environment variables."
      );
      throw new Error("Database connection string is not configured.");
    }

    console.log("Connecting to the database...");
    pool = await sql.connect(dbConfig.connectionString);
    console.log("Database connection successful.");

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
  } finally {
    // This block ensures the database connection is always closed,
    // even if an error occurs.
    if (pool) {
      await pool.close();
      console.log("Database connection closed.");
    }
  }
}

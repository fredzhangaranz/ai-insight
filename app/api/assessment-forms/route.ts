/**
 * File: /app/api/assessment-forms/route.ts
 *
 * V3 Update:
 * - Now returning both version ID and type ID
 * - Version ID used for form definition and insights
 * - Type ID used for patient listing across versions
 *
 * Multi-Customer Update:
 * - Accepts customerId query parameter
 * - Uses customer-specific DB pool instead of global SILHOUETTE_DB_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getCustomerById } from "@/lib/services/customer-service";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";

/**
 * Handles GET requests to /api/assessment-forms
 * @param customerId - Optional customer ID query parameter. If not provided, returns error.
 * @returns {Promise<NextResponse>} A JSON response containing the list of assessment forms or an error message.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  console.log("API call to /api/assessment-forms received.");

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");

  if (!customerId) {
    return createErrorResponse.badRequest(
      "customerId query parameter is required",
    );
  }

  // Get customer and decrypt connection string
  const customer = await getCustomerById(customerId, false, true);
  if (!customer) {
    return createErrorResponse.notFound(`Customer not found: ${customerId}`);
  }

  if (!customer.dbConnectionEncrypted) {
    return createErrorResponse.badRequest(
      `Customer ${customerId} does not have a database connection configured`,
    );
  }

  const { decryptConnectionString } =
    await import("@/lib/services/security/connection-encryption.service");
  const connectionString = decryptConnectionString(
    customer.dbConnectionEncrypted,
  );

  const pool = await getSqlServerPool(connectionString);

  const query = `
    SELECT 
      id,
      assessmentTypeId,
      name,
      definitionVersion
    FROM rpt.AssessmentTypeVersion
    ORDER BY name, definitionVersion DESC;
  `;

  console.log("Executing query:", query);
  const result = await pool.request().query(query);
  console.log(
    `Query executed. Found ${result.recordset.length} assessment types.`,
  );

  const assessmentForms = result.recordset.map((record) => ({
    assessmentFormId: record.id,
    assessmentTypeId: record.assessmentTypeId,
    assessmentFormName: record.name,
    definitionVersion: record.definitionVersion,
  }));

  return NextResponse.json(assessmentForms);
});

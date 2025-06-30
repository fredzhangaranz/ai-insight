/**
 * File: /app/api/assessment-forms/[assessmentFormId]/definition/route.ts
 *
 * Description: This API route fetches the detailed field definition for a specific
 * AssessmentForm. It retrieves all fields and, for dropdown-type fields,
 * fetches their corresponding lookup options.
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

// Database configuration from .env.local
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};

/**
 * Maps the integer dataType from the database to a human-readable string.
 * @param {number} dataType - The integer code for the data type.
 * @returns {string} The string representation of the field type.
 */
function mapDataType(dataType: number): string {
  const typeMap: { [key: number]: string } = {
    1: "File",
    2: "UserList",
    3: "CalculatedValue",
    4: "Information",
    5: "SourceList", // Note: 5 and 56 both exist in the provided mapping
    56: "Integer",
    58: "DateTime",
    61: "Date",
    104: "Boolean",
    106: "Decimal",
    231: "Text",
    1000: "SingleSelectList",
    1001: "MultiSelectList",
    1004: "ImageCapture",
    1005: "Unit",
  };
  return typeMap[dataType] || "Unknown";
}

/**
 * Handles GET requests to /api/assessment-forms/[assessmentFormId]/definition
 * The [assessmentFormId] is a dynamic route parameter.
 * @param {NextRequest} request - The incoming request object.
 * @param {{ params: { assessmentFormId: string } }} context - Contains the dynamic route parameters.
 * @returns {Promise<NextResponse>} A JSON response containing the AssessmentFormDefinition or an error.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  // Extract the assessmentFormId from the URL path
  const { assessmentFormId } = params;
  console.log(
    `API call to fetch definition for assessmentFormId: ${assessmentFormId}`
  );

  if (!assessmentFormId) {
    return NextResponse.json(
      { message: "assessmentFormId is required." },
      { status: 400 }
    );
  }

  let pool;
  try {
    if (!dbConfig.connectionString) {
      throw new Error("Database connection string is not configured.");
    }

    pool = await sql.connect(dbConfig.connectionString);
    console.log("Database connection successful.");

    // First query: Get all the fields for the given assessmentFormId
    const fieldsQuery = `
      SELECT 
        att.name, 
        att.dataType, 
        att.id as AttributeTypeID
      FROM SilhouetteAIDashboard.dbo.AssessmentTypeVersion atv
      INNER JOIN SilhouetteAIDashboard.dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
      INNER JOIN SilhouetteAIDashboard.dbo.AttributeSet ats ON asatv.attributeSetFk = ats.id
      INNER JOIN SilhouetteAIDashboard.dbo.AttributeType att ON ats.id = att.attributeSetFk
      WHERE atv.id = @id AND atv.isDeleted = 0 AND asatv.isDeleted = 0 AND ats.isDeleted = 0 AND att.isDeleted = 0
      ORDER BY asatv.orderIndex, att.orderIndex;
    `;

    const fieldsResult = await pool
      .request()
      .input("id", sql.UniqueIdentifier, assessmentFormId)
      .query(fieldsQuery);

    if (fieldsResult.recordset.length === 0) {
      return NextResponse.json(
        {
          message: `No definition found for assessmentFormId: ${assessmentFormId}`,
        },
        { status: 404 }
      );
    }

    console.log(`Found ${fieldsResult.recordset.length} fields for the form.`);

    // Prepare to build the final definition object
    const assessmentFormDefinition: {
      [key: string]: { fieldtype: string; options: string[] };
    } = {};

    // Loop through each field to fetch its options if it's a select list
    for (const field of fieldsResult.recordset) {
      const fieldName = field.name;
      const fieldType = mapDataType(field.dataType);
      let options: string[] = [];

      // If the field is a Single or Multi-select list, fetch its options
      if (fieldType === "SingleSelectList" || fieldType === "MultiSelectList") {
        console.log(
          `Fetching options for field: '${fieldName}' (ID: ${field.AttributeTypeID})`
        );

        const optionsQuery = `
          SELECT [text] 
          FROM SilhouetteAIDashboard.dbo.AttributeLookup 
          WHERE attributeTypeFk = @attributeTypeFk AND isDeleted = 0
          ORDER BY orderIndex;
        `;

        const optionsResult = await pool
          .request()
          .input("attributeTypeFk", sql.UniqueIdentifier, field.AttributeTypeID)
          .query(optionsQuery);

        // Extract the 'text' from each option record
        options = optionsResult.recordset.map((option) => option.text);
        console.log(`Found ${options.length} options for '${fieldName}'.`);
      }

      // Add the field and its details to our definition object
      assessmentFormDefinition[fieldName] = {
        fieldtype: fieldType,
        options: options,
      };
    }

    // Return the fully constructed definition object
    return NextResponse.json(assessmentFormDefinition);
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        message: "Failed to fetch AssessmentForm Definition.",
        error: error.message,
      },
      { status: 500 }
    );
  } finally {
    if (pool) {
      await pool.close();
      console.log("Database connection closed.");
    }
  }
}

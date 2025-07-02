/**
 * File: /app/api/assessment-forms/[assessmentFormId]/definition/route.ts
 *
 * Description: This API route fetches the detailed field definition for a specific
 * AssessmentForm. It retrieves all fields and, for dropdown-type fields,
 * fetches their corresponding lookup options.
 * V2 Update: Conditionally adds the 'options' key only for select-list fields.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import sql from "mssql";
/**
 * Maps the integer dataType from the database to a human-readable string.
 */
function mapDataType(dataType: number): string {
  const typeMap: { [key: number]: string } = {
    1: "File",
    2: "UserList",
    3: "CalculatedValue",
    4: "Information",
    5: "SourceList",
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

export async function GET(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
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

  try {
    const pool = await getDbPool();

    const fieldsQuery = `
      SELECT att.name, att.dataType, att.id as AttributeTypeID
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

    // Use a more specific type for the definition object
    const assessmentFormDefinition: {
      [key: string]: { fieldtype: string; options?: string[] };
    } = {};

    for (const field of fieldsResult.recordset) {
      const fieldName = field.name;
      const fieldType = mapDataType(field.dataType);

      // Define the base field object, note that 'options' is now optional
      const fieldDefinition: { fieldtype: string; options?: string[] } = {
        fieldtype: fieldType,
      };

      // *** FIX: Only add the 'options' key if the field type is a select list ***
      if (fieldType === "SingleSelectList" || fieldType === "MultiSelectList") {
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

        fieldDefinition.options = optionsResult.recordset.map(
          (option) => option.text
        );
      }

      assessmentFormDefinition[fieldName] = fieldDefinition;
    }
    console.log(JSON.stringify(assessmentFormDefinition, null, 2));
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
  }
}

/**
 * Lookups Service
 * List and manage AttributeLookup options for dropdown fields
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";
import { randomUUID } from "crypto";

export interface LookupFieldInfo {
  attributeTypeId: string;
  fieldName: string;
  formName: string;
  formId: string;
  options: LookupOption[];
}

export interface LookupOption {
  id: string;
  text: string;
  code?: string | null;
  orderIndex: number;
}

/**
 * List all dropdown fields and their options across published forms
 */
export async function listAllLookupFields(
  db: ConnectionPool
): Promise<LookupFieldInfo[]> {
  const query = `
    SELECT 
      att.id as attributeTypeId,
      att.name as fieldName,
      atv.name as formName,
      atv.id as formId
    FROM dbo.AttributeType att
    INNER JOIN dbo.AttributeSet ats ON att.attributeSetFk = ats.id
    INNER JOIN dbo.AttributeSetAssessmentTypeVersion asatv ON ats.id = asatv.attributeSetFk
    INNER JOIN dbo.AssessmentTypeVersion atv ON asatv.assessmentTypeVersionFk = atv.id
    WHERE att.dataType IN (1000, 1001)
      AND att.isDeleted = 0
      AND atv.isDeleted = 0
      AND atv.versionType = 2
    ORDER BY atv.name, att.name
  `;

  const result = await db.request().query(query);
  const fields: LookupFieldInfo[] = [];

  for (const row of result.recordset) {
    const optionsQuery = `
      SELECT id, [text], code, orderIndex
      FROM dbo.AttributeLookup
      WHERE attributeTypeFk = @attributeTypeId AND isDeleted = 0
      ORDER BY orderIndex
    `;
    const optResult = await db
      .request()
      .input("attributeTypeId", sql.UniqueIdentifier, row.attributeTypeId)
      .query(optionsQuery);

    fields.push({
      attributeTypeId: row.attributeTypeId,
      fieldName: row.fieldName,
      formName: row.formName,
      formId: row.formId,
      options: optResult.recordset.map((o) => ({
        id: o.id,
        text: o.text,
        code: o.code,
        orderIndex: o.orderIndex,
      })),
    });
  }

  return fields;
}

/**
 * Add a new lookup option to a field
 */
export async function addLookupOption(
  db: ConnectionPool,
  attributeTypeId: string,
  text: string,
  code?: string | null
): Promise<{ id: string }> {
  const maxOrderQuery = `
    SELECT ISNULL(MAX(orderIndex), -1) + 1 as nextOrder
    FROM dbo.AttributeLookup
    WHERE attributeTypeFk = @attributeTypeId
  `;
  const maxResult = await db
    .request()
    .input("attributeTypeId", sql.UniqueIdentifier, attributeTypeId)
    .query(maxOrderQuery);
  const nextOrder = maxResult.recordset[0]?.nextOrder ?? 0;

  const id = randomUUID();
  const attributeLookupKey = randomUUID();

  const insertQuery = `
    INSERT INTO dbo.AttributeLookup (id, attributeTypeFk, [text], orderIndex, attributeLookupKey)
    VALUES (@id, @attributeTypeFk, @text, @orderIndex, @attributeLookupKey)
  `;

  await db
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("attributeTypeFk", sql.UniqueIdentifier, attributeTypeId)
    .input("text", sql.NVarChar(255), text.trim())
    .input("orderIndex", sql.Int, nextOrder)
    .input("attributeLookupKey", sql.UniqueIdentifier, attributeLookupKey)
    .query(insertQuery);

  return { id };
}

/**
 * Soft-delete a lookup option
 */
export async function deleteLookupOption(
  db: ConnectionPool,
  lookupId: string
): Promise<void> {
  const updateQuery = `
    UPDATE dbo.AttributeLookup
    SET isDeleted = 1, modSyncState = 2, serverChangeDate = GETUTCDATE()
    WHERE id = @id
  `;
  await db
    .request()
    .input("id", sql.UniqueIdentifier, lookupId)
    .query(updateQuery);
}

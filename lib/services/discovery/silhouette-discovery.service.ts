import * as sql from "mssql";

import { getSqlServerPool } from "@/lib/services/sqlserver/client";

export type AttributeSetRecord = {
  id: string;
  attributeSetKey: string;
  name: string;
  description: string | null;
  type: number;
};

/**
 * Fetch published Silhouette attribute sets (forms) for customer discovery.
 * See docs/design/semantic_layer/semantic_layer_design.md §6.3.
 *
 * IMPORTANT: We fetch both 'id' and 'attributeSetKey' because:
 * - AttributeType.attributeSetFk references AttributeSet.id (NOT attributeSetKey)
 * - We must use 'id' for field lookups to find all fields correctly
 */
export async function fetchAttributeSets(
  connectionString: string
): Promise<AttributeSetRecord[]> {
  const pool = await getSqlServerPool(connectionString);

  const result = await pool.request().query<AttributeSetRecord>(
    `SELECT
         id,
         attributeSetKey,
         name,
         description,
         type
       FROM dbo.AttributeSet
       WHERE isDeleted = 0
       ORDER BY name ASC`
  );

  return result.recordset.map((row) => ({
    id: row.id,
    attributeSetKey: row.attributeSetKey,
    name: row.name,
    description: row.description ?? null,
    type: row.type,
  }));
}

export async function fetchAttributeTypeSummary(
  connectionString: string,
  attributeSetId: string
): Promise<
  Array<{
    id: string;
    name: string;
    dataType: number;
    variableName: string | null;
  }>
> {
  const pool = await getSqlServerPool(connectionString);

  const result = await pool
    .request()
    .input("attributeSetId", sql.UniqueIdentifier, attributeSetId)
    .query(
      `SELECT
         at.id,
         at.name,
         at.dataType,
         at.variableName
       FROM dbo.AttributeType at
       WHERE at.isDeleted = 0
         AND at.attributeSetFk = @attributeSetId
       ORDER BY at.orderIndex`
    );

  return result.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    dataType: row.dataType,
    variableName: row.variableName ?? null,
  }));
}

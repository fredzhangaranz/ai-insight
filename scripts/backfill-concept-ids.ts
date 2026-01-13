#!/usr/bin/env ts-node
/**
 * Backfill concept_id columns for SemanticIndex tables (4.S19C)
 *
 * Usage:
 *   pnpm backfill-concept-ids                 # all customers
 *   pnpm backfill-concept-ids DEMO            # by customer code
 *   pnpm backfill-concept-ids <uuid>          # by UUID (auto-detected)
 *   pnpm backfill-concept-ids --customerId <uuid>
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getInsightGenDbPool } from "../lib/db";

async function resolveCustomerIds(filter?: { code?: string; id?: string }) {
  const pool = await getInsightGenDbPool();

  if (filter?.id) {
    // Validate UUID exists in database (moved below to check after code lookup)
    const result = await pool.query(`SELECT id FROM "Customer" WHERE id = $1`, [
      filter.id,
    ]);

    if (result.rows.length === 0) {
      throw new Error(
        `Customer not found for ID "${filter.id}". ` +
          `Please verify the UUID is correct.`
      );
    }

    return [filter.id];
  }

  if (filter?.code) {
    const result = await pool.query(
      `SELECT id FROM "Customer" WHERE code = $1`,
      [filter.code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      throw new Error(
        `Customer not found for code "${filter.code}". ` +
          `If you meant to use a UUID, pass it directly or use --customerId flag.`
      );
    }

    return [result.rows[0].id as string];
  }

  const result = await pool.query(`SELECT id FROM "Customer"`);
  return result.rows.map((row) => row.id as string);
}

async function backfillForCustomer(customerId: string) {
  const pool = await getInsightGenDbPool();

  console.log(`\n🔄 Backfilling concept_id for customer ${customerId}`);

  const nonFormResult = await pool.query(
    `UPDATE "SemanticIndexNonForm" sinf
     SET concept_id = co.id
     FROM "ClinicalOntology" co
     WHERE sinf.customer_id = $1
       AND sinf.concept_id IS NULL
       AND LOWER(sinf.semantic_concept) = LOWER(co.concept_name)`,
    [customerId]
  );

  const fieldResult = await pool.query(
    `UPDATE "SemanticIndexField" sif
     SET concept_id = co.id
     FROM "ClinicalOntology" co, "SemanticIndex" si
     WHERE si.id = sif.semantic_index_id
       AND sif.concept_id IS NULL
       AND si.customer_id = $1
       AND LOWER(sif.semantic_concept) = LOWER(co.concept_name)`,
    [customerId]
  );

  console.log(
    `   SemanticIndexNonForm rows updated: ${nonFormResult.rowCount}`
  );
  console.log(`   SemanticIndexField rows updated  : ${fieldResult.rowCount}`);
}

/**
 * Check if a string is a valid UUID format
 */
function isUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function main() {
  const args = process.argv.slice(2);
  let filter: { code?: string; id?: string } | undefined;

  const customerIdFlagIndex = args.indexOf("--customerId");
  if (customerIdFlagIndex !== -1) {
    filter = { id: args[customerIdFlagIndex + 1] };
  } else if (args[0] && !args[0].startsWith("--")) {
    // Auto-detect: if argument looks like UUID, treat as ID; otherwise as code
    if (isUUID(args[0])) {
      filter = { id: args[0] };
    } else {
      filter = { code: args[0] };
    }
  }

  const customerIds = await resolveCustomerIds(filter);

  for (const id of customerIds) {
    await backfillForCustomer(id);
  }

  console.log("\n✅ Concept ID backfill complete");
}

main().catch((error) => {
  console.error("❌ Backfill failed:", error);
  process.exit(1);
});

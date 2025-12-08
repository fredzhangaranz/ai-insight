#!/usr/bin/env ts-node
/**
 * Diagnostic Script: Check Field Existence in SemanticIndexNonForm
 *
 * Checks which expected fields exist in SemanticIndexNonForm for a customer
 * and what semantic concepts they have.
 *
 * Usage:
 *   npm run check-field-existence -- --customerId <uuid>
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getInsightGenDbPool } from "../lib/db";

const EXPECTED_FIELDS = [
  { table: "rpt.Measurement", column: "areaReduction", concept: "area reduction" },
  { table: "rpt.Measurement", column: "area", concept: "area" },
  { table: "rpt.Measurement", column: "percentChange", concept: "percent change" },
  { table: "rpt.Measurement", column: "measurementDate", concept: "measurement date" },
  { table: "rpt.Measurement", column: "daysFromBaseline", concept: "days from baseline" },
  { table: "rpt.Assessment", column: "assessmentDate", concept: "assessment date" },
  { table: "rpt.Assessment", column: "baselineDate", concept: "baseline date" },
  { table: "rpt.Assessment", column: "startDate", concept: "start date" },
  { table: "rpt.Assessment", column: "endDate", concept: "end date" },
  { table: "rpt.Wound", column: "baselineDate", concept: "baseline date" },
  { table: "rpt.Wound", column: "depth", concept: "wound depth" },
  { table: "rpt.Wound", column: "length", concept: "wound length" },
  { table: "rpt.Wound", column: "width", concept: "wound width" },
  { table: "rpt.Wound", column: "volume", concept: "wound volume" },
  { table: "rpt.Wound", column: "healingStatus", concept: "healing status" },
  { table: "rpt.Wound", column: "woundState", concept: "wound status" },
];

async function main() {
  const args = process.argv.slice(2);
  const idFlagIndex = args.indexOf("--customerId");
  const customerId =
    idFlagIndex !== -1 && args[idFlagIndex + 1]
      ? args[idFlagIndex + 1]
      : null;

  if (!customerId) {
    console.error("❌ --customerId is required");
    console.log("Usage: npm run check-field-existence -- --customerId <uuid>");
    process.exit(1);
  }

  console.log(`🔍 Checking field existence for customer: ${customerId}\n`);

  const pool = await getInsightGenDbPool();

  const existing = new Map<string, any>();
  const missing: typeof EXPECTED_FIELDS = [];

  for (const field of EXPECTED_FIELDS) {
    const result = await pool.query(
      `
      SELECT table_name, column_name, semantic_concept, confidence, data_type
      FROM "SemanticIndexNonForm"
      WHERE customer_id = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1
    `,
      [customerId, field.table, field.column]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      existing.set(`${field.table}.${field.column}`, row);
    } else {
      missing.push(field);
    }
  }

  console.log("✅ Fields Found:");
  console.log("─".repeat(80));
  for (const [key, row] of existing.entries()) {
    const match = row.semantic_concept === EXPECTED_FIELDS.find(
      (f) => `${f.table}.${f.column}` === key
    )?.concept;
    const status = match ? "✅" : "⚠️";
    console.log(
      `${status} ${key.padEnd(40)} concept: "${row.semantic_concept || "NULL"}" (conf: ${row.confidence || "NULL"})`
    );
    if (!match && row.semantic_concept) {
      const expected = EXPECTED_FIELDS.find((f) => `${f.table}.${f.column}` === key)?.concept;
      console.log(`   Expected: "${expected}"`);
    }
  }

  if (missing.length > 0) {
    console.log("\n❌ Fields Missing from SemanticIndexNonForm:");
    console.log("─".repeat(80));
    for (const field of missing) {
      console.log(`   ${field.table}.${field.column} (expected concept: "${field.concept}")`);
    }
    console.log("\n💡 These fields need to be discovered via schema discovery first.");
  }

  // Also check for similar field names that might exist
  console.log("\n🔍 Checking for similar field names...");
  const similarFields = await pool.query(
    `
    SELECT DISTINCT table_name, column_name, semantic_concept
    FROM "SemanticIndexNonForm"
    WHERE customer_id = $1
      AND (
        column_name ILIKE '%area%'
        OR column_name ILIKE '%date%'
        OR column_name ILIKE '%depth%'
        OR column_name ILIKE '%length%'
        OR column_name ILIKE '%width%'
        OR column_name ILIKE '%volume%'
        OR column_name ILIKE '%healing%'
        OR column_name ILIKE '%status%'
        OR column_name ILIKE '%percent%'
        OR column_name ILIKE '%change%'
      )
    ORDER BY table_name, column_name
    LIMIT 50
  `,
    [customerId]
  );

  if (similarFields.rows.length > 0) {
    console.log("Found similar fields:");
    for (const row of similarFields.rows) {
      const key = `${row.table_name}.${row.column_name}`;
      if (!existing.has(key)) {
        console.log(`   ${key.padEnd(40)} concept: "${row.semantic_concept || "NULL"}"`);
      }
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
});


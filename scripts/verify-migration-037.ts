#!/usr/bin/env ts-node
/**
 * Verify Migration 037 Results
 *
 * Checks if migration 037 actually updated the fields for a customer.
 *
 * Usage:
 *   npm run verify-migration-037 -- --customerId <uuid>
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getInsightGenDbPool } from "../lib/db";

const EXPECTED_UPDATES = [
  { table: "rpt.Measurement", column: "areaReduction", concept: "area reduction" },
  { table: "rpt.Measurement", column: "area", concept: "area" },
  { table: "rpt.Wound", column: "baselineDate", concept: "baseline date" },
  { table: "rpt.Measurement", column: "depth", concept: "wound depth" },
  { table: "rpt.Measurement", column: "length", concept: "wound length" },
  { table: "rpt.Measurement", column: "width", concept: "wound width" },
  { table: "rpt.Measurement", column: "volume", concept: "wound volume" },
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
    console.log("Usage: npm run verify-migration-037 -- --customerId <uuid>");
    process.exit(1);
  }

  console.log(`🔍 Verifying migration 037 results for customer: ${customerId}\n`);

  const pool = await getInsightGenDbPool();

  console.log("📋 Checking if fields were updated by migration 037:\n");

  let correctCount = 0;
  let incorrectCount = 0;
  let missingCount = 0;

  for (const expected of EXPECTED_UPDATES) {
    const query = `
      SELECT 
        table_name,
        column_name,
        semantic_concept,
        confidence,
        metadata->>'concept_fixed_by' as fixed_by,
        metadata->>'previous_concept' as previous_concept
      FROM "SemanticIndexNonForm"
      WHERE customer_id = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1
    `;

    const result = await pool.query(query, [
      customerId,
      expected.table,
      expected.column,
    ]);

    if (result.rows.length === 0) {
      console.log(`❌ ${expected.table}.${expected.column} - NOT FOUND`);
      missingCount++;
    } else {
      const row = result.rows[0];
      const isCorrect = row.semantic_concept === expected.concept;
      const status = isCorrect ? "✅" : "⚠️";
      
      console.log(
        `${status} ${expected.table}.${expected.column}`
      );
      console.log(`   Current: "${row.semantic_concept || "NULL"}"`);
      console.log(`   Expected: "${expected.concept}"`);
      
      if (row.fixed_by === "037_force_fix_measurement_field_concepts") {
        console.log(`   ✅ Was fixed by migration 037`);
        if (row.previous_concept) {
          console.log(`   Previous: "${row.previous_concept}"`);
        }
      } else {
        console.log(`   ⚠️  NOT fixed by migration 037 (fixed_by: ${row.fixed_by || "NULL"})`);
      }
      console.log();

      if (isCorrect) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 Summary:");
  console.log(`   ✅ Correct: ${correctCount}`);
  console.log(`   ⚠️  Incorrect: ${incorrectCount}`);
  console.log(`   ❌ Missing: ${missingCount}`);

  if (incorrectCount > 0 || missingCount > 0) {
    console.log("\n💡 Recommendation:");
    if (incorrectCount > 0) {
      console.log("   - Re-run migration 037 to fix incorrect concepts");
      console.log("   - Or manually update the concepts in the database");
    }
    if (missingCount > 0) {
      console.log("   - Run non-form schema discovery to populate missing fields");
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error(`\n❌ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});


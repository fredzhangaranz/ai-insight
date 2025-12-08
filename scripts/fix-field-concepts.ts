#!/usr/bin/env ts-node
/**
 * Direct Field Correction Script
 * 
 * Directly inserts/updates missing measurement fields with correct semantic concepts
 * Bypasses the migration system if it's not working correctly
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getInsightGenDbPool } from "../lib/db";

async function main() {
  const args = process.argv.slice(2);
  const idFlagIndex = args.indexOf("--customerId");
  const customerId =
    idFlagIndex !== -1 && args[idFlagIndex + 1]
      ? args[idFlagIndex + 1]
      : args[0];

  if (!customerId) {
    console.error("❌ Customer ID required");
    console.log("Usage: npm run fix-field-concepts -- --customerId <uuid>");
    process.exit(1);
  }

  const pool = await getInsightGenDbPool();

  try {
    console.log(`\n🔧 Fixing measurement field concepts for customer: ${customerId}\n`);

    // Define all measurement fields that should exist
    const measurementFields = [
      // Area reduction fields
      { table: "rpt.Measurement", column: "areaReduction", concept: "area reduction" },
      { table: "rpt.Measurement", column: "area", concept: "area" },
      { table: "rpt.Measurement", column: "percentChange", concept: "percent change" },
      
      // Date fields
      { table: "rpt.Measurement", column: "measurementDate", concept: "measurement date" },
      { table: "rpt.Measurement", column: "dimDateFk", concept: "measurement date" },
      { table: "rpt.Assessment", column: "assessmentDate", concept: "assessment date" },
      { table: "rpt.Assessment", column: "date", concept: "assessment date" },
      { table: "rpt.Assessment", column: "baselineDate", concept: "baseline date" },
      { table: "rpt.Wound", column: "baselineDate", concept: "baseline date" },
      { table: "rpt.Assessment", column: "startDate", concept: "start date" },
      { table: "rpt.Assessment", column: "endDate", concept: "end date" },
      { table: "rpt.WoundState", column: "startDate", concept: "start date" },
      { table: "rpt.WoundState", column: "endDate", concept: "end date" },
      { table: "rpt.Measurement", column: "daysFromBaseline", concept: "days from baseline" },
      
      // Wound dimension fields
      { table: "rpt.Measurement", column: "depth", concept: "wound depth" },
      { table: "rpt.Measurement", column: "length", concept: "wound length" },
      { table: "rpt.Measurement", column: "width", concept: "wound width" },
      { table: "rpt.Measurement", column: "volume", concept: "wound volume" },
      { table: "rpt.Wound", column: "depth", concept: "wound depth" },
      { table: "rpt.Wound", column: "length", concept: "wound length" },
      { table: "rpt.Wound", column: "width", concept: "wound width" },
      { table: "rpt.Wound", column: "volume", concept: "wound volume" },
      
      // Status fields
      { table: "rpt.Wound", column: "healingStatus", concept: "healing status" },
      { table: "rpt.Wound", column: "woundState", concept: "wound status" },
    ];

    let updated = 0;
    let inserted = 0;

    for (const field of measurementFields) {
      // Check if field exists
      const checkResult = await pool.query(
        `SELECT id FROM "SemanticIndexNonForm" 
         WHERE customer_id = $1 AND table_name = $2 AND column_name = $3`,
        [customerId, field.table, field.column]
      );

      if (checkResult.rows.length > 0) {
        // Update existing field
        await pool.query(
          `UPDATE "SemanticIndexNonForm" 
           SET semantic_concept = $4, confidence = 0.95, is_review_required = false
           WHERE customer_id = $1 AND table_name = $2 AND column_name = $3`,
          [customerId, field.table, field.column, field.concept]
        );
        console.log(`✅ Updated: ${field.table}.${field.column} → "${field.concept}"`);
        updated++;
      } else {
        // Insert new field
        try {
          await pool.query(
            `INSERT INTO "SemanticIndexNonForm" 
             (customer_id, table_name, column_name, semantic_concept, confidence, is_filterable, is_joinable, is_review_required, discovered_at)
             VALUES ($1, $2, $3, $4, $5, true, false, false, NOW())`,
            [customerId, field.table, field.column, field.concept, 0.95]
          );
          console.log(`➕ Inserted: ${field.table}.${field.column} → "${field.concept}"`);
          inserted++;
        } catch (error) {
          console.warn(`⚠️  Could not insert ${field.table}.${field.column}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated} fields`);
    console.log(`   Inserted: ${inserted} fields`);
    console.log(`   Total processed: ${updated + inserted}/${measurementFields.length}`);

    if (updated + inserted > 0) {
      console.log(`\n✅ Field correction completed! Try running discover-field-gaps again:`);
      console.log(`   npm run discover-field-gaps -- --customerId ${customerId} --minConfidence 0.5`);
    }

    await pool.end();
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();


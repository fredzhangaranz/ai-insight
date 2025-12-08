#!/usr/bin/env ts-node
/**
 * Comprehensive diagnostic script for field gap discovery issues
 * 
 * This script checks:
 * 1. Whether SemanticIndexNonForm has any records for the customer
 * 2. Whether specific measurement fields exist
 * 3. Whether the semantic concepts are correctly populated
 * 4. Whether migration 038 has been applied
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getInsightGenDbPool } from "../lib/db";

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments (support both positional and flag-based)
  const idFlagIndex = args.indexOf("--customerId");
  const explicitCustomerId =
    idFlagIndex !== -1 && args[idFlagIndex + 1]
      ? args[idFlagIndex + 1]
      : null;
  const positionalCustomer = args[0] && !args[0].startsWith("--")
    ? args[0]
    : null;

  const customerCodeOrId = explicitCustomerId || positionalCustomer;

  if (!customerCodeOrId) {
    console.error("❌ Customer code or UUID required");
    console.log("Usage:");
    console.log("  npm run diagnose-field-gaps DEMO");
    console.log("  npm run diagnose-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012");
    process.exit(1);
  }

  const pool = await getInsightGenDbPool();

  try {
    // Resolve customer ID
    let customerId: string;
    if (customerCodeOrId.includes("-")) {
      // Assume UUID
      customerId = customerCodeOrId;
    } else {
      // Assume customer code
      const result = await pool.query(
        `SELECT id FROM "Customer" WHERE code = $1`,
        [customerCodeOrId.toUpperCase()]
      );
      if (result.rows.length === 0) {
        console.error(`❌ Customer not found: ${customerCodeOrId}`);
        process.exit(1);
      }
      customerId = result.rows[0].id;
    }

    console.log(`\n🔍 Diagnosing field gaps for customer: ${customerId}\n`);

    // Check 1: Total SemanticIndexNonForm records
    console.log("📊 Check 1: SemanticIndexNonForm Population");
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM "SemanticIndexNonForm" WHERE customer_id = $1`,
      [customerId]
    );
    const total = totalResult.rows[0]?.total || 0;
    console.log(`   Total records: ${total}`);

    if (total === 0) {
      console.warn(`   ⚠️  NO SemanticIndexNonForm records found!`);
      console.log(`   → Non-form discovery may not have been run for this customer`);
    }

    // Check 2: Measurement field records
    console.log(`\n📊 Check 2: Measurement/Time Field Records`);
    const measurementResult = await pool.query(
      `SELECT 
        table_name, 
        column_name, 
        semantic_concept, 
        confidence,
        metadata
      FROM "SemanticIndexNonForm" 
      WHERE customer_id = $1
        AND table_name IN ('rpt.Measurement', 'rpt.Assessment', 'rpt.Wound', 'rpt.WoundState')
      ORDER BY table_name, column_name`,
      [customerId]
    );

    if (measurementResult.rows.length === 0) {
      console.warn(`   ⚠️  NO measurement/time fields indexed!`);
      console.log(`   → Check if non-form discovery has completed`);
      console.log(`\n   Expected fields to find:`);
      console.log(`     - rpt.Measurement: area, areaReduction, percentChange, depth, length, width, volume, measurementDate, daysFromBaseline`);
      console.log(`     - rpt.Assessment: assessmentDate, date, baselineDate, startDate, endDate`);
      console.log(`     - rpt.Wound: baselineDate, healingStatus, woundState, depth, length, width, volume`);
      console.log(`     - rpt.WoundState: startDate, endDate`);
    } else {
      console.log(`   ✅ Found ${measurementResult.rows.length} measurement/time field records:`);
      measurementResult.rows.forEach(row => {
        let concepts = [];
        try {
          if (row.metadata && row.metadata.concepts) {
            concepts = Array.isArray(row.metadata.concepts) ? row.metadata.concepts : [];
          }
        } catch (e) {
          // Ignore parsing errors
        }
        console.log(`     - ${row.table_name}.${row.column_name}: "${row.semantic_concept}" (confidence: ${row.confidence})`);
        if (concepts.length > 0) {
          console.log(`       Additional concepts: [${concepts.join(", ")}]`);
        }
      });
    }

    // Check 3: Specific field existence
    console.log(`\n📊 Check 3: Critical Field Search`);
    const criticalFields = [
      { table: 'rpt.Measurement', column: 'areaReduction' },
      { table: 'rpt.Measurement', column: 'area' },
      { table: 'rpt.Measurement', column: 'depth' },
      { table: 'rpt.Assessment', column: 'assessmentDate' },
      { table: 'rpt.Assessment', column: 'baselineDate' },
      { table: 'rpt.Wound', column: 'healingStatus' },
    ];

    let found = 0;
    for (const field of criticalFields) {
      const result = await pool.query(
        `SELECT semantic_concept, confidence FROM "SemanticIndexNonForm" 
         WHERE customer_id = $1 AND table_name = $2 AND column_name = $3`,
        [customerId, field.table, field.column]
      );

      if (result.rows.length > 0) {
        console.log(`   ✅ ${field.table}.${field.column} → ${result.rows[0].semantic_concept} (${result.rows[0].confidence})`);
        found++;
      } else {
        console.log(`   ❌ ${field.table}.${field.column} → NOT FOUND`);
      }
    }
    console.log(`   Summary: Found ${found}/${criticalFields.length} critical fields`);

    // Check 4: Migration 038 status
    console.log(`\n📊 Check 4: Migration 038 Application Status`);
    const fieldsWithMultipleConcepts = await pool.query(
      `SELECT COUNT(*) as total FROM "SemanticIndexNonForm" 
       WHERE customer_id = $1 AND metadata->'concepts' IS NOT NULL`,
      [customerId]
    );
    console.log(`   Fields with multiple concepts: ${fieldsWithMultipleConcepts.rows[0]?.total || 0}`);

    // Check 5: Migration status in migrations table
    console.log(`\n📊 Check 5: Database Migration History`);
    try {
      const migrationResult = await pool.query(
        `SELECT filename, executed_at FROM migrations 
         WHERE filename IN ('034_audit_measurement_fields.sql', '038_add_multiple_concepts_to_fields.sql')
         ORDER BY filename DESC`
      );
      if (migrationResult.rows.length > 0) {
        console.log(`   ✅ Migrations executed:`);
        migrationResult.rows.forEach(row => {
          console.log(`     - ${row.filename}: ${new Date(row.executed_at).toISOString()}`);
        });
      } else {
        console.warn(`   ⚠️  Migrations not found in history table!`);
        console.log(`   → Migrations may not have been run via migration script`);
      }
    } catch (error) {
      console.warn(`   ⚠️  Could not check migration history: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Final diagnosis
    console.log(`\n🎯 Diagnosis:\n`);
    if (total === 0) {
      console.log(`The root cause is: SemanticIndexNonForm is EMPTY`);
      console.log(`\nThis indicates that the non-form schema discovery has NOT been run.`);
      console.log(`\nTo fix this:`);
      console.log(`  1. Run the full discovery orchestrator:`);
      console.log(`     npm run api -- /api/admin/discovery/run POST --body '{"customerCode":"${customerCodeOrId}"}'`);
      console.log(`  OR manually call the discovery endpoint in the admin UI`);
    } else if (found < criticalFields.length / 2) {
      console.log(`The root cause is: Measurement fields are missing concepts`);
      console.log(`\nThis indicates that migration 038 (add_multiple_concepts_to_fields) may not have`);
      console.log(`been applied to the records inserted by the discovery process.`);
      console.log(`\nTo fix this:`);
      console.log(`  1. Re-run the migration:  npm run migrate -- --rerun 038_add_multiple_concepts_to_fields.sql`);
    } else {
      console.log(`Data looks good! The issue may be with the query or parameter handling.`);
      console.log(`\nRun the discovery test script with verbose logging:`);
      console.log(`  npm run discover-field-gaps ${customerCodeOrId} --minConfidence 0.5`);
    }

    await pool.end();
  } catch (error) {
    console.error(`\n❌ Error during diagnosis: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();


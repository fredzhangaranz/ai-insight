#!/usr/bin/env node
/**
 * Run Enum Detection Script
 *
 * Detects and indexes enum fields (both form and non-form) for a customer
 * without running the full discovery process.
 *
 * This is much faster than running full discovery (seconds vs minutes)
 * and is useful for:
 * - Testing enum detection
 * - Re-running enum detection after data changes
 * - Debugging enum detection issues
 *
 * Requirements:
 * - Form discovery must have been run at least once (to populate SemanticIndexField)
 * - Non-form schema discovery must have been run at least once (to populate SemanticIndexNonForm)
 *
 * Usage:
 *   npm run enum-detection <customerCode>
 *   npm run enum-detection <customerCode> --clear   # Clear existing enum data first
 *
 * Examples:
 *   npm run enum-detection C1
 *   npm run enum-detection C2 --clear
 *
 * Created: 2025-11-26
 * Purpose: Standalone enum field detection without full discovery
 */

// Load environment variables from .env.local
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { createEnumFieldIndexer } from "../lib/services/context-discovery/enum-field-indexer.service";
import { getCustomer, getCustomerConnectionString } from "../lib/services/customer-service";
import { getInsightGenDbPool } from "../lib/db";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("❌ Error: Customer code is required");
    console.log("\nUsage:");
    console.log("  npm run enum-detection <customerCode>");
    console.log("  npm run enum-detection <customerCode> --clear");
    console.log("\nExamples:");
    console.log("  npm run enum-detection C1");
    console.log("  npm run enum-detection C2 --clear");
    process.exit(1);
  }

  const customerCode = args[0];
  const shouldClear = args.includes("--clear");

  console.log(`\n🔍 Starting enum field detection for customer: ${customerCode}`);
  if (shouldClear) {
    console.log("⚠️  Will clear existing enum data first");
  }

  try {
    // Get customer
    const customer = await getCustomer(customerCode);
    if (!customer) {
      console.error(`❌ Customer not found: ${customerCode}`);
      process.exit(1);
    }

    // Get customer ID from database
    const pool = await getInsightGenDbPool();
    const customerResult = await pool.query(
      `SELECT id FROM "Customer" WHERE code = $1`,
      [customerCode.toUpperCase()]
    );

    if (customerResult.rows.length === 0) {
      console.error(`❌ Customer not found in database: ${customerCode}`);
      process.exit(1);
    }

    const customerId = customerResult.rows[0].id;
    console.log(`✅ Found customer: ${customerId}`);

    // Get connection string
    const connectionString = await getCustomerConnectionString(customerCode);
    if (!connectionString) {
      console.error(`❌ Customer connection string not found: ${customerCode}`);
      process.exit(1);
    }

    console.log(`✅ Connection string loaded`);

    // Create indexer
    const indexer = createEnumFieldIndexer(customerId, connectionString);

    // Clear existing data if requested
    if (shouldClear) {
      console.log(`\n🧹 Clearing existing non-form enum data...`);
      const clearResult = await indexer.clearAll();
      console.log(`✅ Cleared ${clearResult} non-form enum fields`);
    }

    // Run enum detection
    console.log(`\n🔍 Running enum field detection...`);
    const startTime = Date.now();

    const result = await indexer.indexAll();

    const endTime = Date.now();
    const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

    // Display results
    console.log(`\n✅ Enum detection completed in ${durationSeconds}s`);
    console.log(`\n📊 Results:`);
    console.log(`   Total fields analyzed: ${result.total}`);
    console.log(`   Enum fields detected:  ${result.detected}`);
    console.log(`   Non-enum fields:       ${result.skipped}`);
    console.log(`\n   Form fields:`);
    console.log(`   - Analyzed: ${result.formFieldsTotal}`);
    console.log(`   - Detected: ${result.formFieldsDetected}`);
    console.log(`\n   Non-form fields:`);
    console.log(`   - Analyzed: ${result.nonFormFieldsTotal}`);
    console.log(`   - Detected: ${result.nonFormFieldsDetected}`);

    if (result.detected > 0) {
      console.log(`\n💾 Database table updated:`);
      console.log(`   - SemanticIndexNonFormEnumValue (non-form fields only)`);
      console.log(`\n📝 Note: Form field dropdowns are stored in SemanticIndexOption`);
    }

    // Show some examples
    if (result.detected > 0) {
      console.log(`\n📋 Sample detected enum fields:`);
      const enumResults = result.results.filter(r => r.isEnum).slice(0, 5);
      for (const r of enumResults) {
        console.log(`   - ${r.fieldName} (${r.tableName}): ${r.cardinality} values`);
      }
      if (result.detected > 5) {
        console.log(`   ... and ${result.detected - 5} more`);
      }
    }

    console.log(`\n✅ Done!\n`);
    process.exit(0);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

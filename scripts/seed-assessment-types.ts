#!/usr/bin/env node
/**
 * Seed Assessment Types Script
 *
 * Discovers and indexes assessment types for a customer using the
 * AssessmentTypeIndexer service. Can run in auto mode (pattern matching)
 * or manual mode (explicit mappings).
 *
 * Usage:
 *   npm run seed-assessment-types <customerId>
 *   npm run seed-assessment-types <customerId> --manual
 *
 * Created: 2025-11-19
 * Purpose: Phase 5A - Assessment-Level Semantic Indexing
 */

import { createAssessmentTypeIndexer } from "../lib/services/context-discovery/assessment-type-indexer.service";
import { getCustomer, getCustomerConnectionString } from "../lib/services/customer-service";

/**
 * Manual seed data for common assessment types
 *
 * Use this to override automatic pattern matching for specific assessment types
 * that need explicit semantic concept assignments.
 *
 * Structure:
 * - key: assessment type name pattern (case-insensitive contains)
 * - value: { concept, confidence }
 */
const MANUAL_SEED_DATA: Record<string, { concept: string; confidence: number }> = {
  // Clinical assessments
  "wound assessment": {
    concept: "clinical_wound_assessment",
    confidence: 0.95,
  },
  "visit details": {
    concept: "clinical_visit_documentation",
    confidence: 0.90,
  },
  "initial assessment": {
    concept: "clinical_initial_assessment",
    confidence: 0.92,
  },
  "discharge summary": {
    concept: "clinical_discharge_assessment",
    confidence: 0.93,
  },
  "progress note": {
    concept: "clinical_progress_note",
    confidence: 0.87,
  },

  // Billing assessments (generic terminology)
  "billing form": {
    concept: "billing_documentation",
    confidence: 0.90,
  },
  "charge capture": {
    concept: "billing_charge_capture",
    confidence: 0.92,
  },
  "claim form": {
    concept: "billing_claim_form",
    confidence: 0.95,
  },

  // Administrative assessments
  "patient intake": {
    concept: "administrative_intake",
    confidence: 0.88,
  },
  "consent form": {
    concept: "administrative_consent",
    confidence: 0.90,
  },
  "demographics": {
    concept: "administrative_demographics",
    confidence: 0.85,
  },

  // Treatment assessments
  "treatment plan": {
    concept: "treatment_plan",
    confidence: 0.90,
  },
  "physician order": {
    concept: "treatment_order",
    confidence: 0.92,
  },
};

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npm run seed-assessment-types <customerId> [--manual]");
    console.error("\nOptions:");
    console.error("  --manual    Apply manual seed data for common assessment types");
    console.error("  --clear     Clear existing assessment types before seeding");
    process.exit(1);
  }

  const customerCode = args[0];
  const manualMode = args.includes("--manual");
  const clearFirst = args.includes("--clear");

  console.log("=".repeat(80));
  console.log("Assessment Type Indexing");
  console.log("=".repeat(80));
  console.log(`Customer Code: ${customerCode}`);
  console.log(`Mode: ${manualMode ? "Manual seed data" : "Automatic pattern matching"}`);
  console.log(`Clear existing: ${clearFirst ? "Yes" : "No"}`);
  console.log("=".repeat(80));
  console.log("");

  // Get customer info
  const customer = await getCustomer(customerCode);
  if (!customer) {
    console.error(`❌ Customer not found: ${customerCode}`);
    process.exit(1);
  }

  // Get customer connection string
  const connectionString = await getCustomerConnectionString(customerCode);
  if (!connectionString) {
    console.error(`❌ Could not get connection string for customer: ${customerCode}`);
    process.exit(1);
  }

  const customerId = customer.id;

  // Create indexer
  const indexer = createAssessmentTypeIndexer(customerId, connectionString);

  try {
    // Clear existing if requested
    if (clearFirst) {
      console.log("Clearing existing assessment types...");
      const cleared = await indexer.clearAll();
      console.log(`✅ Cleared ${cleared} existing assessment types\n`);
    }

    if (manualMode) {
      // Manual mode: Apply manual seed data
      console.log("Discovering assessment types...");
      const discovered = await indexer.discoverAssessmentTypes();
      console.log(`Found ${discovered.length} assessment types\n`);

      console.log("Applying manual seed data...");
      let matched = 0;
      let skipped = 0;

      for (const assessment of discovered) {
        const nameLower = assessment.assessmentName.toLowerCase();

        // Find matching manual seed entry
        let seedEntry: { concept: string; confidence: number } | null = null;
        for (const [pattern, mapping] of Object.entries(MANUAL_SEED_DATA)) {
          if (nameLower.includes(pattern.toLowerCase())) {
            seedEntry = mapping;
            break;
          }
        }

        if (seedEntry) {
          await indexer.seedManualMapping(
            assessment.assessmentTypeId,
            assessment.assessmentName,
            seedEntry.concept,
            seedEntry.confidence
          );
          matched++;
        } else {
          console.log(`⏭️  Skipping: "${assessment.assessmentName}" (no manual mapping)`);
          skipped++;
        }
      }

      console.log("\n" + "=".repeat(80));
      console.log(`Manual Seed Complete`);
      console.log("=".repeat(80));
      console.log(`Matched: ${matched}`);
      console.log(`Skipped: ${skipped}`);
      console.log("=".repeat(80));
    } else {
      // Auto mode: Use pattern matching
      console.log("Running automatic pattern matching...\n");
      const result = await indexer.indexAll();

      console.log("\n" + "=".repeat(80));
      console.log(`Indexing Complete`);
      console.log("=".repeat(80));
      console.log(`Total discovered: ${result.total}`);
      console.log(`Successfully indexed: ${result.indexed}`);
      console.log(`Skipped (no match): ${result.skipped}`);
      console.log("=".repeat(80));

      // Show summary by category
      const byCategory: Record<string, number> = {};
      for (const item of result.results) {
        byCategory[item.semanticCategory] = (byCategory[item.semanticCategory] || 0) + 1;
      }

      console.log("\nBy Category:");
      for (const [category, count] of Object.entries(byCategory)) {
        console.log(`  ${category}: ${count}`);
      }
    }

    // Show all indexed assessment types
    console.log("\n" + "=".repeat(80));
    console.log("Indexed Assessment Types");
    console.log("=".repeat(80));

    const indexed = await indexer.getIndexed();
    for (const item of indexed) {
      console.log(
        `[${item.semanticCategory}] ${item.assessmentName} → ${item.semanticConcept} (${item.confidence.toFixed(2)})`
      );
    }

    console.log("\n✅ Assessment type indexing complete!");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Error during indexing:");
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

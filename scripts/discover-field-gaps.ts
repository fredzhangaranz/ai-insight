#!/usr/bin/env ts-node
/**
 * Discovery Script (4.S19)
 *
 * Runs semantic search with filter phrases (4.S18) against golden measurement/time
 * queries and reports fields that should have surfaced but did not.
 *
 * Usage:
 *   npm run discover-field-gaps <customerCode>
 *   npm run discover-field-gaps --customerId <uuid>
 *   npm run discover-field-gaps <customerCode> --limit 30 --minConfidence 0.6
 *
 * Notes:
 * - Requires SemanticIndexNonForm/SemanticIndexField to be populated.
 * - Uses ExpandedConceptBuilder to keep concept set bounded and deduped.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getSemanticSearcherService } from "../lib/services/context-discovery/semantic-searcher.service";
import { ExpandedConceptBuilder } from "../lib/services/context-discovery/expanded-concept-builder.service";
import type {
  IntentFilter,
  IntentType,
} from "../lib/services/context-discovery/types";

type GapCase = {
  name: string;
  intentType: IntentType;
  metrics: string[];
  filters: IntentFilter[];
  expectedFields: string[];
};

const GOLDEN_CASES: GapCase[] = [
  {
    name: "Area reduction at timepoint",
    intentType: "trend_analysis",
    metrics: ["area reduction"],
    filters: [{ operator: "equals", userPhrase: "52 weeks", value: null }],
    expectedFields: ["areaReduction", "area", "percentChange"],
  },
  {
    name: "Baseline date reference",
    intentType: "trend_analysis",
    metrics: ["baseline date"],
    filters: [{ operator: "equals", userPhrase: "baseline", value: null }],
    expectedFields: ["baselineDate", "assessmentDate", "date"], // date is alternative
  },
  {
    name: "Healing status by measurement date",
    intentType: "outcome_analysis",
    metrics: ["healing status"],
    filters: [{ operator: "equals", userPhrase: "measurement date", value: null }],
    expectedFields: ["healingStatus", "measurementDate", "dimDateFk"], // dimDateFk is alternative
  },
  {
    name: "Wound size dimensions",
    intentType: "outcome_analysis",
    metrics: ["wound size"],
    filters: [{ operator: "equals", userPhrase: "depth", value: null }],
    expectedFields: ["depth", "length", "width", "volume"], // Can be in rpt.Measurement or rpt.Wound
  },
  {
    name: "Days from baseline",
    intentType: "trend_analysis",
    metrics: ["days from baseline"],
    filters: [{ operator: "equals", userPhrase: "start to end", value: null }],
    expectedFields: ["daysFromBaseline", "startDate", "endDate"], // Can be in rpt.Assessment or rpt.WoundState
  },
];

async function main() {
  const args = process.argv.slice(2);
  const idFlagIndex = args.indexOf("--customerId");
  const explicitCustomerId =
    idFlagIndex !== -1 && args[idFlagIndex + 1]
      ? args[idFlagIndex + 1]
      : null;
  const positionalCustomer = args[0] && !args[0].startsWith("--")
    ? args[0]
    : null;

  if (!explicitCustomerId && !positionalCustomer) {
    console.error("❌ Customer code or --customerId is required");
    console.log("Usage:");
    console.log("  npm run discover-field-gaps DEMO");
    console.log("  npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012");
    console.log("  npm run discover-field-gaps DEMO --limit 30 --minConfidence 0.6");
    console.log("  npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012 --minConfidence 0.5");
    process.exit(1);
  }

  const customerCode = explicitCustomerId
    ? null
    : positionalCustomer
    ? positionalCustomer.toUpperCase()
    : null;
  const limitFlagIndex = args.indexOf("--limit");
  const minConfidenceIndex = args.indexOf("--minConfidence");
  const limit =
    limitFlagIndex !== -1 && args[limitFlagIndex + 1]
      ? parseInt(args[limitFlagIndex + 1], 10)
      : 30;
  const minConfidence =
    minConfidenceIndex !== -1 && args[minConfidenceIndex + 1]
      ? parseFloat(args[minConfidenceIndex + 1])
      : 0.6;

  let customerId: string | null = explicitCustomerId;

  if (!customerId && customerCode) {
    const { getInsightGenDbPool } = await import("../lib/db");
    const pool = await getInsightGenDbPool();
    const customerResult = await pool.query(
      `SELECT id FROM "Customer" WHERE code = $1`,
      [customerCode]
    );

    if (customerResult.rows.length === 0) {
      console.error(`❌ Customer not found: ${customerCode}`);
      console.log(`\nValid customer codes can be found in the admin panel.`);
      console.log(`If using UUID directly, use: npm run discover-field-gaps -- --customerId <uuid>`);
      process.exit(1);
    }

    customerId = customerResult.rows[0].id;
  }

  if (!customerId) {
    console.error("❌ Unable to resolve customerId");
    process.exit(1);
  }

  console.log(
    `🔍 Running field gap discovery for customer ${customerCode ?? "(id provided)" } (${customerId})`
  );
  console.log(`   Limit: ${limit}, Min confidence: ${minConfidence}`);

  const semanticSearcher = getSemanticSearcherService();
  const builder = new ExpandedConceptBuilder();
  const gaps: Array<{ caseName: string; missing: string[] }> = [];

  for (const testCase of GOLDEN_CASES) {
    const concepts = builder.build(
      testCase.intentType,
      testCase.metrics,
      testCase.filters
    );

    console.log(`\n➡️  Case: ${testCase.name}`);
    console.log(`   Concepts (${concepts.concepts.length}): ${concepts.concepts.join(", ")}`);

    const results = await semanticSearcher.searchFormFields(
      customerId,
      concepts.concepts,
      {
        includeNonForm: true,
        minConfidence,
        limit,
      }
    );

    const resultFields = results.map((r) => (r.fieldName || "").toLowerCase());
    
    // Map alternative field names to expected fields
    const fieldAliases: Record<string, string[]> = {
      "areareduction": ["areareduction", "area"],
      "area": ["area", "areareduction"],
      "percentchange": ["percentchange"],
      "measurementdate": ["measurementdate", "dimdatefk"],
      "daysfrombaseline": ["daysfrombaseline"],
      "assessmentdate": ["assessmentdate", "date", "dimdatefk"],
      "baselinedate": ["baselinedate", "baselinedimdatefk"],
      "startdate": ["startdate"],
      "enddate": ["enddate"],
      "depth": ["depth"],
      "length": ["length"],
      "width": ["width"],
      "volume": ["volume"],
      "healingstatus": ["healingstatus"],
      "woundstate": ["woundstate"],
    };
    
    const missing = testCase.expectedFields.filter((field) => {
      const fieldLower = field.toLowerCase();
      const aliases = fieldAliases[fieldLower] || [fieldLower];
      // Check if any alias matches any result field
      return !resultFields.some((f) => aliases.includes(f));
    });

    if (missing.length > 0) {
      console.warn(`   ⚠️ Missing expected fields: ${missing.join(", ")}`);
      gaps.push({ caseName: testCase.name, missing });
    } else {
      console.log("   ✅ All expected fields found");
    }

    const sample = results.slice(0, 5).map((r) => `${r.fieldName} (${r.confidence.toFixed(2)})`);
    console.log(`   Top results: ${sample.join(", ") || "none"}`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Cases evaluated: ${GOLDEN_CASES.length}`);
  console.log(`   Cases with gaps: ${gaps.length}`);

  if (gaps.length > 0) {
    console.log(`\n📝 Gap Details:`);
    gaps.forEach((gap) => {
      console.log(` - ${gap.caseName}: missing ${gap.missing.join(", ")}`);
    });
    process.exit(2);
  } else {
    console.log(`\n✅ No gaps detected in golden cases.`);
  }
}

main().catch((error) => {
  console.error(`\n❌ Error during discovery: ${error.message}`);
  process.exit(1);
});

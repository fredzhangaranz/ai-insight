#!/usr/bin/env ts-node
/**
 * Debug Semantic Search
 *
 * Helps debug why semantic search isn't finding fields by:
 * 1. Checking what concepts are being searched
 * 2. Checking what concepts exist in the database
 * 3. Showing the mismatch
 *
 * Usage:
 *   npm run debug-semantic-search -- --customerId <uuid>
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getInsightGenDbPool } from "../lib/db";
import { ExpandedConceptBuilder } from "../lib/services/context-discovery/expanded-concept-builder.service";
import type { IntentFilter, IntentType } from "../lib/services/context-discovery/types";

const TEST_CASES = [
  {
    name: "Area reduction at timepoint",
    intentType: "trend_analysis" as IntentType,
    metrics: ["area reduction"],
    filters: [{ operator: "equals" as const, userPhrase: "52 weeks", value: null }],
  },
  {
    name: "Baseline date reference",
    intentType: "trend_analysis" as IntentType,
    metrics: ["baseline date"],
    filters: [{ operator: "equals" as const, userPhrase: "baseline", value: null }],
  },
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
    console.log("Usage: npm run debug-semantic-search -- --customerId <uuid>");
    process.exit(1);
  }

  console.log(`🔍 Debugging semantic search for customer: ${customerId}\n`);

  const pool = await getInsightGenDbPool();
  const builder = new ExpandedConceptBuilder();

  for (const testCase of TEST_CASES) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Test Case: ${testCase.name}`);
    console.log("=".repeat(80));

    // Generate concepts
    const expandedConcepts = builder.build(
      testCase.intentType,
      testCase.metrics,
      testCase.filters
    );

    console.log(`\n📋 Concepts being searched (${expandedConcepts.concepts.length}):`);
    expandedConcepts.concepts.forEach((c, i) => {
      console.log(`   ${i + 1}. "${c}"`);
    });

    // Check what concepts exist in database
    console.log(`\n🔍 Checking what concepts exist in SemanticIndexNonForm...`);
    const conceptQuery = `
      SELECT DISTINCT semantic_concept, COUNT(*) as field_count
      FROM "SemanticIndexNonForm"
      WHERE customer_id = $1
        AND semantic_concept IS NOT NULL
        AND semantic_concept = ANY($2)
      GROUP BY semantic_concept
      ORDER BY field_count DESC
    `;

    const conceptResult = await pool.query(conceptQuery, [
      customerId,
      expandedConcepts.concepts,
    ]);

    if (conceptResult.rows.length === 0) {
      console.log(`   ❌ No matching concepts found in database`);
      
      // Show what concepts DO exist
      console.log(`\n📊 All concepts in database for this customer:`);
      const allConceptsQuery = `
        SELECT DISTINCT semantic_concept, COUNT(*) as field_count
        FROM "SemanticIndexNonForm"
        WHERE customer_id = $1
          AND semantic_concept IS NOT NULL
        GROUP BY semantic_concept
        ORDER BY field_count DESC
        LIMIT 20
      `;
      const allConcepts = await pool.query(allConceptsQuery, [customerId]);
      
      if (allConcepts.rows.length === 0) {
        console.log(`   ⚠️  No concepts found at all! SemanticIndexNonForm might be empty.`);
      } else {
        console.log(`   Found ${allConcepts.rows.length} unique concepts:`);
        allConcepts.rows.forEach((row) => {
          console.log(`      - "${row.semantic_concept}" (${row.field_count} fields)`);
        });
      }

      // Check for similar concepts
      console.log(`\n🔍 Checking for similar concepts (fuzzy match)...`);
      for (const searchConcept of expandedConcepts.concepts) {
        const similarQuery = `
          SELECT DISTINCT semantic_concept, COUNT(*) as field_count
          FROM "SemanticIndexNonForm"
          WHERE customer_id = $1
            AND semantic_concept IS NOT NULL
            AND (
              semantic_concept ILIKE $2
              OR semantic_concept ILIKE $3
            )
          GROUP BY semantic_concept
          ORDER BY field_count DESC
          LIMIT 5
        `;
        const similar = await pool.query(similarQuery, [
          customerId,
          `%${searchConcept}%`,
          `%${searchConcept.replace(/\s+/g, "_")}%`,
        ]);
        
        if (similar.rows.length > 0) {
          console.log(`   Similar to "${searchConcept}":`);
          similar.rows.forEach((row) => {
            console.log(`      - "${row.semantic_concept}" (${row.field_count} fields)`);
          });
        }
      }
    } else {
      console.log(`   ✅ Found ${conceptResult.rows.length} matching concepts:`);
      conceptResult.rows.forEach((row) => {
        console.log(`      - "${row.semantic_concept}" (${row.field_count} fields)`);
      });

      // Show which fields have these concepts
      console.log(`\n📋 Fields with matching concepts:`);
      const fieldsQuery = `
        SELECT table_name, column_name, semantic_concept, confidence
        FROM "SemanticIndexNonForm"
        WHERE customer_id = $1
          AND semantic_concept = ANY($2)
        ORDER BY semantic_concept, table_name, column_name
        LIMIT 20
      `;
      const fields = await pool.query(fieldsQuery, [
        customerId,
        expandedConcepts.concepts,
      ]);
      
      fields.rows.forEach((row) => {
        console.log(
          `   ${row.table_name}.${row.column_name} → "${row.semantic_concept}" (conf: ${row.confidence})`
        );
      });
    }

    // Check specific expected fields
    console.log(`\n🎯 Checking specific expected fields...`);
    const expectedFields = [
      { table: "rpt.Measurement", column: "areaReduction", concept: "area reduction" },
      { table: "rpt.Measurement", column: "area", concept: "area" },
      { table: "rpt.Wound", column: "baselineDate", concept: "baseline date" },
    ];

    for (const field of expectedFields) {
      const fieldQuery = `
        SELECT table_name, column_name, semantic_concept, confidence
        FROM "SemanticIndexNonForm"
        WHERE customer_id = $1
          AND table_name = $2
          AND column_name = $3
        LIMIT 1
      `;
      const fieldResult = await pool.query(fieldQuery, [
        customerId,
        field.table,
        field.column,
      ]);

      if (fieldResult.rows.length === 0) {
        console.log(`   ❌ ${field.table}.${field.column} - NOT FOUND in SemanticIndexNonForm`);
      } else {
        const row = fieldResult.rows[0];
        const conceptMatch = row.semantic_concept === field.concept;
        const status = conceptMatch ? "✅" : "⚠️";
        console.log(
          `   ${status} ${field.table}.${field.column} - concept: "${row.semantic_concept}" (expected: "${field.concept}")`
        );
      }
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error(`\n❌ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});


/**
 * Semantic Concept Corrector Service
 *
 * Post-processes discovered fields to correct known wrong semantic concept mappings.
 * This runs AFTER the embedding-based discovery to fix known issues where field names
 * mislead the embedding model (e.g., "depth" → "anatomical_location" instead of "wound depth").
 *
 * This approach is safer than modifying discovery logic because:
 * 1. Doesn't change core discovery algorithm
 * 2. Can be disabled/updated independently
 * 3. Provides explicit mapping rules
 * 4. Works for new customers automatically
 */

import { getInsightGenDbPool } from "@/lib/db";

type ConceptCorrection = {
  tableName: string;
  columnName: string;
  wrongConcept?: string; // Optional: if specified, only correct if current concept matches
  correctConcept: string;
  confidence: number;
};

/**
 * Known corrections for fields where embedding-based discovery fails
 */
const KNOWN_CORRECTIONS: ConceptCorrection[] = [
  // Measurement fields - area/reduction
  {
    tableName: "Measurement",
    columnName: "area",
    correctConcept: "area",
    confidence: 0.95,
  },
  {
    tableName: "Measurement",
    columnName: "areaReduction",
    correctConcept: "area reduction",
    confidence: 0.95,
  },
  {
    tableName: "Measurement",
    columnName: "percentChange",
    correctConcept: "percent change",
    confidence: 0.95,
  },

  // Measurement fields - dimensions
  {
    tableName: "Measurement",
    columnName: "depth",
    correctConcept: "wound depth",
    confidence: 0.95,
  },
  {
    tableName: "Measurement",
    columnName: "length",
    correctConcept: "wound length",
    confidence: 0.95,
  },
  {
    tableName: "Measurement",
    columnName: "width",
    correctConcept: "wound width",
    confidence: 0.95,
  },
  {
    tableName: "Measurement",
    columnName: "volume",
    correctConcept: "wound volume",
    confidence: 0.95,
  },

  // Measurement fields - dates
  {
    tableName: "Measurement",
    columnName: "measurementDate",
    correctConcept: "measurement date",
    confidence: 0.95,
  },
  {
    tableName: "Measurement",
    columnName: "dimDateFk",
    correctConcept: "measurement date",
    confidence: 0.95,
  },
  {
    tableName: "Measurement",
    columnName: "daysFromBaseline",
    correctConcept: "days from baseline",
    confidence: 0.95,
  },

  // Assessment fields - dates
  {
    tableName: "Assessment",
    columnName: "date",
    correctConcept: "assessment date",
    confidence: 0.95,
  },
  {
    tableName: "Assessment",
    columnName: "assessmentDate",
    correctConcept: "assessment date",
    confidence: 0.95,
  },
  {
    tableName: "Assessment",
    columnName: "baselineDate",
    correctConcept: "baseline date",
    confidence: 0.95,
  },
  {
    tableName: "Assessment",
    columnName: "startDate",
    correctConcept: "start date",
    confidence: 0.95,
  },
  {
    tableName: "Assessment",
    columnName: "endDate",
    correctConcept: "end date",
    confidence: 0.95,
  },

  // Wound fields
  {
    tableName: "Wound",
    columnName: "baselineDate",
    correctConcept: "baseline date",
    confidence: 0.95,
  },
  {
    tableName: "Wound",
    columnName: "healingStatus",
    correctConcept: "healing status",
    confidence: 0.95,
  },

  // WoundState fields - dates
  {
    tableName: "WoundState",
    columnName: "startDate",
    correctConcept: "start date",
    confidence: 0.95,
  },
  {
    tableName: "WoundState",
    columnName: "endDate",
    correctConcept: "end date",
    confidence: 0.95,
  },
];

/**
 * Apply known corrections to semantic index records
 * Meant to be called after non-form schema discovery completes
 */
export async function correctSemanticConcepts(customerId: string): Promise<{
  corrected: number;
  skipped: number;
  errors: string[];
}> {
  const pool = await getInsightGenDbPool();
  let corrected = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    for (const correction of KNOWN_CORRECTIONS) {
      try {
        const fullTableName = `rpt.${correction.tableName}`;

        // Update the semantic concept for this field
        const result = await pool.query(
          `UPDATE "SemanticIndexNonForm"
           SET semantic_concept = $4,
               confidence = $5,
               is_review_required = false
           WHERE customer_id = $1
             AND table_name = $2
             AND column_name = $3`,
          [
            customerId,
            fullTableName,
            correction.columnName,
            correction.correctConcept,
            correction.confidence,
          ]
        );

        if (result.rowCount && result.rowCount > 0) {
          console.log(
            `✅ Corrected: ${fullTableName}.${correction.columnName} → "${correction.correctConcept}"`
          );
          corrected++;
        } else {
          skipped++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${correction.tableName}.${correction.columnName}: ${msg}`);
      }
    }

    console.log(`\n📊 Semantic Concept Correction Summary:`);
    console.log(`   Corrected: ${corrected}`);
    console.log(`   Skipped (not found): ${skipped}`);
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length}`);
      errors.forEach((err) => console.log(`     - ${err}`));
    }

    await pool.end();
    return { corrected, skipped, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error during semantic concept correction: ${msg}`);
    throw error;
  }
}

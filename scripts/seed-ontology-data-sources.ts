#!/usr/bin/env ts-node
/**
 * Seed Ontology Data Sources (4.S19A0)
 *
 * Populates ClinicalOntology.data_sources for core measurement/time concepts
 * such as percent_area_reduction and measurement_date. This provides a
 * structured mapping from concepts to rpt.* columns for use by discovery.
 *
 * Usage:
 *   npm run ontology:seed-data-sources
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { getInsightGenDbPool } from "../lib/db";

type DataSourceSource = "seed_script" | "ontology_yaml" | "manual" | string;

type DataSourceEntry = {
  table: string;
  column: string;
  confidence?: number;
  measurement_type?: string;
  unit?: string;
  source?: DataSourceSource;
};

type ConceptSeed = {
  conceptName: string;
  conceptType?: string;
  dataSources: DataSourceEntry[];
};

const MEASUREMENT_SEEDS: ConceptSeed[] = [
  {
    conceptName: "percent_area_reduction",
    dataSources: [
      {
        table: "rpt.Measurement",
        column: "area",
        confidence: 0.95,
        measurement_type: "wound_area",
        unit: "cm2",
        source: "seed_script",
      },
      {
        table: "rpt.Measurement",
        column: "areaReduction",
        confidence: 0.95,
        measurement_type: "wound_area_reduction",
        unit: "cm2",
        source: "seed_script",
      },
    ],
  },
  {
    conceptName: "measurement_date",
    dataSources: [
      {
        table: "rpt.Measurement",
        column: "measurementDate",
        confidence: 0.95,
        source: "seed_script",
      },
      {
        table: "rpt.Assessment",
        column: "assessmentDate",
        confidence: 0.95,
        source: "seed_script",
      },
      {
        table: "rpt.Wound",
        column: "baselineDate",
        confidence: 0.95,
        source: "seed_script",
      },
    ],
  },
];

function getSourcePriority(source?: DataSourceSource): number {
  switch (source) {
    case "ontology_yaml":
      return 3;
    case "manual":
      return 2;
    case "seed_script":
      return 1;
    default:
      return 0;
  }
}

function mergeDataSources(
  existing: DataSourceEntry[],
  additions: DataSourceEntry[]
): DataSourceEntry[] {
  if (!Array.isArray(existing)) {
    existing = [];
  }

  const byKey = new Map<string, DataSourceEntry>();

  for (const entry of existing) {
    if (!entry || !entry.table || !entry.column) {
      continue;
    }
    const key = `${entry.table}.${entry.column}`;
    byKey.set(key, entry);
  }

  for (const entry of additions) {
    if (!entry || !entry.table || !entry.column) {
      continue;
    }
    const key = `${entry.table}.${entry.column}`;
    const existingEntry = byKey.get(key);

    if (!existingEntry) {
      byKey.set(key, { ...entry });
      continue;
    }

    const existingPriority = getSourcePriority(existingEntry.source);
    const newPriority = getSourcePriority(entry.source);

    if (newPriority > existingPriority) {
      byKey.set(key, { ...existingEntry, ...entry });
      continue;
    }
    if (newPriority < existingPriority) {
      continue;
    }

    const merged: DataSourceEntry = {
      ...existingEntry,
      ...entry,
    };

    if (
      typeof existingEntry.confidence === "number" &&
      typeof entry.confidence === "number"
    ) {
      merged.confidence = Math.max(
        existingEntry.confidence,
        entry.confidence
      );
    }

    byKey.set(key, merged);
  }

  return Array.from(byKey.values());
}

async function main() {
  const pool = await getInsightGenDbPool();

  console.log("=".repeat(80));
  console.log("Seeding ClinicalOntology.data_sources for measurement concepts");
  console.log("=".repeat(80));

  const missingConcepts: string[] = [];
  let totalConceptRowsChecked = 0;
  let totalUpdatedConcepts = 0;
  let totalUnchangedConcepts = 0;

  for (const seed of MEASUREMENT_SEEDS) {
    const { conceptName, conceptType, dataSources } = seed;

    const params: any[] = [conceptName];
    let where = `concept_name = $1`;

    if (conceptType) {
      params.push(conceptType);
      where += ` AND concept_type = $2`;
    }

    const selectQuery = `
      SELECT id, data_sources
      FROM "ClinicalOntology"
      WHERE ${where}
    `;

    const result = await pool.query(selectQuery, params);

    if (result.rows.length === 0) {
      const identifier = conceptType
        ? `${conceptName} (type=${conceptType})`
        : conceptName;
      missingConcepts.push(identifier);
      continue;
    }

    totalConceptRowsChecked += result.rows.length;

    for (const row of result.rows) {
      const id: string = row.id;
      const existing: DataSourceEntry[] = Array.isArray(row.data_sources)
        ? row.data_sources
        : [];

      const merged = mergeDataSources(existing, dataSources);

      const changed =
        merged.length !== existing.length ||
        JSON.stringify(merged) !== JSON.stringify(existing);

      if (!changed) {
        console.log(
          `ℹ️  No changes for concept ${conceptName} (id=${id}) - data_sources already up to date`
        );
        totalUnchangedConcepts++;
        continue;
      }

      await pool.query(
        `UPDATE "ClinicalOntology" 
         SET data_sources = $1::jsonb
         WHERE id = $2`,
        [JSON.stringify(merged), id]
      );

      totalUpdatedConcepts++;

      console.log(
        `✅ Updated data_sources for concept ${conceptName} (id=${id}) with ${merged.length} entries`
      );
    }
  }

  if (missingConcepts.length > 0) {
    console.error(
      "\n❌ Missing ClinicalOntology concepts — aborting seed script:"
    );
    missingConcepts.forEach((name) => console.error(`   - ${name}`));
    console.error(
      "Make sure the ontology loader has populated these concepts before running the seed script."
    );
    process.exit(1);
  }

  console.log("=".repeat(80));
  console.log("Seed complete.");
  console.log(
    `   Concept rows evaluated: ${totalConceptRowsChecked.toString()}`
  );
  console.log(`   Concepts updated : ${totalUpdatedConcepts.toString()}`);
  console.log(`   Concepts unchanged: ${totalUnchangedConcepts.toString()}`);
  console.log("=".repeat(80));
}

main().catch((error) => {
  console.error("❌ Error seeding ontology data_sources:", error);
  process.exit(1);
});

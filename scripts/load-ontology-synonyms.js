#!/usr/bin/env node

/**
 * Ontology Synonym Loader Script
 *
 * Loads synonym and abbreviation data from YAML file into ClinicalOntology table.
 * Updates existing entries (matched by preferred_term) with synonym data.
 *
 * Usage:
 *   npm run ontology:load-synonyms
 *   node scripts/load-ontology-synonyms.js
 *
 * Requirements:
 * - ClinicalOntology table must exist (migration 015)
 * - Synonym schema extension must exist (migration 029)
 * - YAML data file: data/ontology/wound-care-terminology.yaml
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { Pool } = require("pg");

// Database configuration
const connectionString =
  process.env.INSIGHT_GEN_DB_URL ||
  process.env.DATABASE_URL ||
  "postgresql://user:password@localhost:5432/insight_gen_db";

async function loadOntologySynonyms() {
  const pool = new Pool({ connectionString });

  try {
    console.log("🔌 Connecting to database...");
    await pool.query("SELECT 1");
    console.log("✅ Connected successfully");

    // Load YAML file
    const yamlPath = path.join(
      __dirname,
      "..",
      "data",
      "ontology",
      "wound-care-terminology.yaml"
    );

    console.log(`📖 Reading ontology data from: ${yamlPath}`);

    if (!fs.existsSync(yamlPath)) {
      throw new Error(`Ontology data file not found: ${yamlPath}`);
    }

    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const data = yaml.load(yamlContent);

    if (!data || !data.ontology || !Array.isArray(data.ontology)) {
      throw new Error("Invalid YAML structure: expected { ontology: [...] }");
    }

    console.log(`📚 Loaded ${data.ontology.length} ontology entries from YAML`);

    let updatedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;

    for (const entry of data.ontology) {
      const {
        preferred_term,
        category,
        description,
        synonyms,
        abbreviations,
        related_terms,
      } = entry;

      // Validate required fields
      if (!preferred_term || !category) {
        console.warn(
          `⚠️  Skipping entry: missing preferred_term or category`
        );
        skippedCount++;
        continue;
      }

      try {
        // Check if entry exists (by preferred_term match)
        const existingQuery = `
          SELECT id, concept_name
          FROM "ClinicalOntology"
          WHERE LOWER(preferred_term) = LOWER($1)
             OR LOWER(concept_name) = LOWER($1)
          LIMIT 1
        `;

        const existingResult = await pool.query(existingQuery, [
          preferred_term,
        ]);

        if (existingResult.rows.length > 0) {
          // UPDATE existing entry with synonym data
          const updateQuery = `
            UPDATE "ClinicalOntology"
            SET
              preferred_term = $1,
              category = $2,
              description = $3,
              synonyms = $4::jsonb,
              abbreviations = $5::jsonb,
              related_terms = $6::jsonb,
              updated_at = NOW()
            WHERE id = $7
          `;

          await pool.query(updateQuery, [
            preferred_term,
            category,
            description || null,
            JSON.stringify(synonyms || []),
            JSON.stringify(abbreviations || []),
            JSON.stringify(related_terms || []),
            existingResult.rows[0].id,
          ]);

          console.log(
            `✅ Updated: "${preferred_term}" (${synonyms?.length || 0} synonyms, ${abbreviations?.length || 0} abbreviations)`
          );
          updatedCount++;
        } else {
          // Entry doesn't exist - skip (we only update existing entries)
          // To create new entries, they must first be added via ontology loader with embeddings
          console.log(
            `⏭️  Skipped (not in database): "${preferred_term}" - add to clinical_ontology.yaml first`
          );
          skippedCount++;
        }
      } catch (error) {
        console.error(
          `❌ Error processing entry "${preferred_term}":`,
          error instanceof Error ? error.message : error
        );
        skippedCount++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Ontology synonym loading complete!");
    console.log("=".repeat(60));
    console.log(`✅ Updated:  ${updatedCount} entries`);
    console.log(`➕ Created:  ${createdCount} entries`);
    console.log(`⏭️  Skipped:  ${skippedCount} entries`);
    console.log(`📊 Total:    ${data.ontology.length} entries in YAML`);
    console.log("=".repeat(60));

    // Display sample queries for verification
    console.log("\n📝 Sample verification queries:");
    console.log(
      '  SELECT preferred_term, category, jsonb_array_length(synonyms) as synonym_count FROM "ClinicalOntology" WHERE synonyms IS NOT NULL AND synonyms != \'[]\'::jsonb;'
    );
    console.log(
      "  SELECT preferred_term, abbreviations FROM \"ClinicalOntology\" WHERE abbreviations @> '[{\"value\": \"DFU\"}]'::jsonb;"
    );

    process.exit(0);
  } catch (error) {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  loadOntologySynonyms();
}

module.exports = { loadOntologySynonyms };

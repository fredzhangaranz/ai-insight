import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { Pool } from "pg";
import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";

/**
 * Type definitions for ontology concepts
 */
interface ConceptCategory {
  canonical_name: string;
  description: string;
  aliases?: string[];
  [key: string]: any;
}

interface ConceptType {
  type: string;
  description: string;
  categories?: Record<string, ConceptCategory>;
  [key: string]: any;
}

interface OntologyYAML {
  version: string;
  domain: string;
  description: string;
  concepts?: Record<string, ConceptType>;
}

interface FlatConcept {
  concept_name: string;
  canonical_name: string;
  concept_type: string;
  description: string;
  aliases: string[];
  metadata: Record<string, any>;
}

interface OntologyLoaderResult {
  conceptsLoaded: number;
  conceptsNew: number;
  conceptsUpdated: number;
  conceptsSkipped: number;
  embeddingsGenerated: number;
  errors: string[];
  duration_ms: number;
}

/**
 * Parse YAML ontology file into flat concept list
 */
function parseOntologyYAML(filePath: string): FlatConcept[] {
  console.log(`📖 Reading ontology file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Ontology file not found: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  const ontologyData = yaml.load(fileContent) as OntologyYAML;

  if (!ontologyData || !ontologyData.concepts) {
    throw new Error(
      "Invalid ontology YAML structure: missing 'concepts' field"
    );
  }

  const concepts: FlatConcept[] = [];

  // Flatten the nested ontology structure
  for (const [conceptTypeKey, conceptTypeData] of Object.entries(
    ontologyData.concepts
  )) {
    const conceptType = conceptTypeData.type;
    const description = conceptTypeData.description || "";

    // Handle concepts with categories (nested structure)
    if (conceptTypeData.categories) {
      for (const [categoryKey, categoryData] of Object.entries(
        conceptTypeData.categories
      )) {
        const category = categoryData as ConceptCategory;
        const aliases = category.aliases || [];

        concepts.push({
          concept_name: categoryKey,
          canonical_name: category.canonical_name,
          concept_type: conceptType,
          description: category.description,
          aliases,
          metadata: {
            category_key: categoryKey,
            concept_type_key: conceptTypeKey,
            icd_codes: category.icd_codes || [],
            prevalence: category.prevalence || null,
          },
        });
      }
    } else {
      // Handle flat concept entries (without categories)
      concepts.push({
        concept_name: conceptTypeKey,
        canonical_name: conceptTypeData.canonical_name || conceptTypeKey,
        concept_type: conceptType,
        description,
        aliases: conceptTypeData.aliases || [],
        metadata: {
          concept_type_key: conceptTypeKey,
        },
      });
    }
  }

  console.log(`✅ Parsed ${concepts.length} concepts from YAML`);
  return concepts;
}

/**
 * Prepare text for embedding by combining concept metadata
 */
function prepareEmbeddingText(concept: FlatConcept): string {
  const parts = [
    concept.canonical_name,
    `(${concept.concept_type})`,
    concept.description || "",
    concept.aliases.length > 0 ? `Aliases: ${concept.aliases.join(", ")}` : "",
  ];

  return parts.filter((p) => p && p.length > 0).join(". ");
}

/**
 * Get existing concepts to avoid re-embedding
 */
async function getExistingConcepts(
  pool: Pool
): Promise<Map<string, { id: string; embedding: number[] }>> {
  const query = `
    SELECT id, concept_name, concept_type, embedding
    FROM "ClinicalOntology"
    WHERE is_deprecated = false
  `;

  const result = await pool.query(query);
  const existing = new Map<string, { id: string; embedding: number[] }>();

  result.rows.forEach((row) => {
    const key = `${row.concept_name}::${row.concept_type}`;
    existing.set(key, {
      id: row.id,
      embedding: row.embedding,
    });
  });

  return existing;
}

/**
 * Upsert concepts with embeddings into the database
 */
async function upsertConcepts(
  pool: Pool,
  concepts: FlatConcept[],
  embeddings: number[][]
): Promise<{ new: number; updated: number }> {
  const query = `
    INSERT INTO "ClinicalOntology" (
      concept_name, canonical_name, concept_type, description, 
      metadata, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (concept_name, concept_type)
    DO UPDATE SET
      embedding = EXCLUDED.embedding,
      description = EXCLUDED.description,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING xmax = 0 as is_new
  `;

  let newCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    const embedding = embeddings[i];

    try {
      const result = await pool.query(query, [
        concept.concept_name,
        concept.canonical_name,
        concept.concept_type,
        concept.description,
        JSON.stringify(concept.metadata),
        `[${embedding.join(",")}]`,
      ]);

      if (result.rows[0].is_new) {
        newCount++;
      } else {
        updatedCount++;
      }
    } catch (error) {
      console.error(`Error upserting concept ${concept.concept_name}:`, error);
      throw error;
    }
  }

  return { new: newCount, updated: updatedCount };
}

/**
 * Save loader run metadata for auditing and monitoring
 */
async function saveLoaderRunMetadata(
  pool: Pool,
  result: OntologyLoaderResult & { status: string; error_message?: string }
): Promise<void> {
  try {
    // First, ensure the table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "OntologyLoaderRun" (
        id SERIAL PRIMARY KEY,
        status VARCHAR(20),
        concepts_loaded INT,
        concepts_new INT,
        concepts_updated INT,
        concepts_skipped INT,
        embeddings_generated INT,
        duration_ms INT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Then, insert the run metadata
    await pool.query(
      `INSERT INTO "OntologyLoaderRun" (
        status, concepts_loaded, concepts_new, concepts_updated,
        concepts_skipped, embeddings_generated, duration_ms, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        result.status,
        result.conceptsLoaded,
        result.conceptsNew,
        result.conceptsUpdated,
        result.conceptsSkipped,
        result.embeddingsGenerated,
        result.duration_ms,
        result.error_message || null,
      ]
    );
  } catch (error) {
    console.warn("Could not save loader run metadata:", error);
    // Non-blocking error - loader still succeeded
  }
}

/**
 * Main ontology loader function
 */
export async function loadOntologyFromYAML(options?: {
  yamlPath?: string;
  batchSize?: number;
}): Promise<OntologyLoaderResult> {
  const startTime = Date.now();
  const yamlPath =
    options?.yamlPath ||
    path.join(
      process.cwd(),
      "docs/design/semantic_layer/clinical_ontology.yaml"
    );
  const batchSize = options?.batchSize || 5;

  const result: OntologyLoaderResult = {
    conceptsLoaded: 0,
    conceptsNew: 0,
    conceptsUpdated: 0,
    conceptsSkipped: 0,
    embeddingsGenerated: 0,
    errors: [],
    duration_ms: 0,
  };

  let pool: Pool | null = null;

  try {
    console.log("🚀 Starting ontology loader job");
    console.log(`   YAML path: ${yamlPath}`);
    console.log(`   Batch size: ${batchSize}`);

    // Connect to database
    pool = await getInsightGenDbPool();

    // Parse YAML
    const concepts = parseOntologyYAML(yamlPath);
    result.conceptsLoaded = concepts.length;

    console.log(`📊 Concepts to process: ${concepts.length}`);

    // Get existing concepts to filter duplicates
    const existingQuery = `
      SELECT concept_name, concept_type
      FROM "ClinicalOntology"
    `;
    const existingResult = await pool.query(existingQuery);
    const existingSet = new Set(
      existingResult.rows.map((r) => `${r.concept_name}::${r.concept_type}`)
    );

    // Filter new concepts
    const newConcepts = concepts.filter(
      (c) => !existingSet.has(`${c.concept_name}::${c.concept_type}`)
    );
    result.conceptsSkipped = concepts.length - newConcepts.length;

    console.log(
      `✅ Filtered: ${newConcepts.length} new, ${result.conceptsSkipped} existing`
    );

    if (newConcepts.length === 0) {
      console.log(
        "ℹ️  No new concepts to process. All concepts already exist."
      );
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    // Generate embeddings
    console.log("🔄 Generating embeddings via Google Gemini...");
    const embeddingService = getEmbeddingService();
    const embeddingTexts = newConcepts.map(prepareEmbeddingText);
    const embeddings = await embeddingService.generateEmbeddingsBatch(
      embeddingTexts,
      batchSize
    );
    result.embeddingsGenerated = embeddings.length;

    console.log(`✅ Generated ${embeddings.length} embeddings`);

    // Upsert to database
    console.log("💾 Upserting concepts to database...");
    const { new: newCount, updated: updatedCount } = await upsertConcepts(
      pool,
      newConcepts,
      embeddings
    );
    result.conceptsNew = newCount;
    result.conceptsUpdated = updatedCount;

    console.log(
      `✅ Upserted ${newCount} new concepts, ${updatedCount} updated`
    );

    result.duration_ms = Date.now() - startTime;

    // Save metadata
    await saveLoaderRunMetadata(pool, {
      ...result,
      status: "success",
    });

    console.log("🎉 Ontology loader completed successfully!");
    console.log(`   Total time: ${result.duration_ms}ms`);
    console.log(`   Concepts loaded: ${result.conceptsLoaded}`);
    console.log(`   New concepts: ${result.conceptsNew}`);
    console.log(`   Embeddings generated: ${result.embeddingsGenerated}`);

    return result;
  } catch (error) {
    result.duration_ms = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMsg);

    console.error("❌ Ontology loader failed:", error);

    if (pool) {
      try {
        await saveLoaderRunMetadata(pool, {
          ...result,
          status: "failed",
          error_message: errorMsg,
        });
      } catch {
        // Silently fail metadata save if it fails
      }
    }

    throw error;
  }
}

/**
 * Export loader result for CLI usage
 */
export type { OntologyLoaderResult };

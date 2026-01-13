#!/usr/bin/env node

/**
 * CLI Script: Ontology Loader
 * Loads clinical ontology from YAML and generates embeddings via Google Gemini
 *
 * Usage:
 *   npm run ontology:load
 *   npm run ontology:load -- --yaml-path /custom/path/ontology.yaml
 *   npm run ontology:load -- --batch-size 10
 */

const path = require("path");

// Load environment variables from .env.local first, then fall back to .env
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
require("dotenv").config();

async function main() {
  try {
    console.log("🚀 Loading clinical ontology...");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

    // Parse command-line arguments
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--yaml-path" && args[i + 1]) {
        options.yamlPath = args[i + 1];
        i++;
      } else if (args[i] === "--batch-size" && args[i + 1]) {
        options.batchSize = parseInt(args[i + 1], 10);
        i++;
      }
    }

    // Validate environment
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      throw new Error(
        "Missing GOOGLE_CLOUD_PROJECT environment variable. " +
          "Please set it before running this script."
      );
    }

    // Try to load the TypeScript module using esbuild-register
    let loadOntologyFromYAML;
    try {
      // esbuild-register only needs to be required, not called
      require("esbuild-register");
      const ontologyLoader = require(path.join(
        __dirname,
        "../lib/jobs/ontology_loader"
      ));
      loadOntologyFromYAML = ontologyLoader.loadOntologyFromYAML;
    } catch (error) {
      throw new Error(
        "Could not load TypeScript modules. Please ensure esbuild-register is installed:\n" +
          "  npm install esbuild-register\n\n" +
          "Error: " +
          error.message
      );
    }

    const result = await loadOntologyFromYAML(options);

    console.log("\n✅ Ontology loader completed successfully!");
    console.log("📊 Results:");
    console.log(`   Concepts loaded from YAML: ${result.conceptsLoaded}`);
    console.log(`   New concepts: ${result.conceptsNew}`);
    console.log(`   Updated concepts: ${result.conceptsUpdated}`);
    console.log(`   Skipped (existing): ${result.conceptsSkipped}`);
    console.log(`   Embeddings generated: ${result.embeddingsGenerated}`);
    console.log(`   Total time: ${result.duration_ms}ms`);

    if (result.errors.length > 0) {
      console.log("\n⚠️  Errors encountered:");
      result.errors.forEach((err) => console.log(`   - ${err}`));
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Ontology loader failed:");
    console.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    process.exit(1);
  }
}

main();

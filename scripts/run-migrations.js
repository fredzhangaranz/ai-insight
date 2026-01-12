#!/usr/bin/env node

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
// Load local env if present (helpful when running outside docker)
try {
  const dotenvPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(dotenvPath)) {
    require("dotenv").config({ path: dotenvPath });
  }
} catch (_) {}

// Database connection configuration
let connectionString =
  process.env.INSIGHT_GEN_DB_URL ||
  process.env.DATABASE_URL ||
  "postgresql://user:password@localhost:5432/insight_gen_db";

const dbConfig = {
  connectionString,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Migration files in order
const migrations = [
  "000_create_ai_insight_table.sql",
  "001_create_ai_analysis_plan_cache.sql",
  "002_create_metrics_tables.sql",
  "003_create_funnel_tables.sql",
  "004_add_sql_metadata_columns.sql",
  "005_create_custom_questions_table.sql",
  "006_add_original_question_id_to_custom_questions.sql",
  "007_create_ai_config_table.sql",
  "008_create_saved_insights.sql",
  "009_create_dashboards.sql",
  "010_rename_formid_in_saved_insights.sql",
  "011_create_template_catalog.sql",
  "012_create_users_table.sql",
  "013_add_user_ownership.sql",
  "014_semantic_foundation.sql",
  "015_clinical_ontology_schema.sql",
  "016_ontology_audit_log.sql",
  "017_semantic_nonform_metadata.sql",
  "018_semantic_field_unique_constraint.sql",
  "019_discovery_logging.sql",
  "020_semantic_index_option_unique_constraint.sql",
  "021_context_discovery_audit.sql",
  "022_add_customer_to_saved_insights.sql",
  "023_create_query_history.sql",
  "024_fix_ai_config_audit_delete.sql",
  "025_remove_nonform_value_table.sql",
  "026_add_error_mode_to_query_history.sql",
  "027_update_ai_config_dual_models.sql",
  "028_create_query_performance_metrics.sql",
  "029_ontology_synonyms_schema.sql",
  "030_semantic_assessment_type_index.sql",
  "031_extend_nonform_enum_support.sql",
  "033_intent_classification_logging.sql",
  "034_audit_measurement_fields.sql",
  "035_seed_measurement_field_concepts.sql",
  "036_fix_measurement_field_concepts.sql",
  "037_force_fix_measurement_field_concepts.sql",
  "038_add_multiple_concepts_to_fields.sql",
  "039_correct_measurement_field_concepts.sql",
  "040_ontology_data_sources.sql",
  "041_remove_faulty_data_sources_index.sql",
  "042_semantic_index_concept_id.sql",
  "043_create_clarification_audit.sql",
  "044_create_sql_validation_log.sql",
];

/**
 * Remove migration record (for development only)
 */
async function removeMigrationRecord(pool, filename) {
  try {
    await pool.query("DELETE FROM migrations WHERE filename = $1", [filename]);
    console.log(`🗑️  Removed migration record: ${filename}`);
  } catch (error) {
    console.warn(`⚠️  Could not remove migration record: ${error.message}`);
  }
}

/**
 * Run migrations with options
 */
async function runMigrations(options = {}) {
  const {
    force = false, // Force re-run even if already executed
    from = null, // Start from this migration (inclusive)
    rerun = null, // Re-run specific migration(s) - comma-separated
    remove = null, // Remove migration record(s) - comma-separated
  } = options;
  // Build connection candidates to mitigate common host issues
  const url = new URL(connectionString);
  const candidates = new Set([connectionString]);
  if (url.hostname === "localhost") {
    const u = new URL(connectionString);
    u.hostname = "127.0.0.1";
    candidates.add(u.toString());
  }
  if (url.hostname !== "db") {
    const u = new URL(connectionString);
    u.hostname = "db";
    candidates.add(u.toString());
  }

  let pool = null;
  let connected = false;

  try {
    let lastErr;
    for (const candidate of candidates) {
      const cUrl = new URL(candidate);
      console.log(
        `🔌 Connecting to database... (${cUrl.host}${cUrl.pathname})`
      );
      pool = new Pool({ ...dbConfig, connectionString: candidate });
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          // Use pool.query directly - it handles client acquisition and release automatically
          await pool.query("SELECT 1");
          lastErr = null;
          connected = true;
          connectionString = candidate; // record working connection
          break;
        } catch (err) {
          lastErr = err;
          console.warn(
            `⏳ Attempt ${attempt} failed for ${cUrl.host}: ${
              err?.message || err
            }`
          );
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
      if (connected) break;
    }
    if (!connected) throw lastErr || new Error("Failed to connect to DB");
    console.log("✅ Connected to database successfully");

    // Check if migrations table exists
    const migrationsTableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'migrations'
      );
    `);

    if (!migrationsTableExists.rows[0].exists) {
      console.log("📋 Creating migrations table...");
      await pool.query(`
        CREATE TABLE migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      console.log("✅ Migrations table created");
    }

    // Handle remove option (development only)
    if (remove) {
      const filesToRemove = remove.split(",").map((f) => f.trim());
      console.log(
        `🗑️  Removing migration records: ${filesToRemove.join(", ")}`
      );
      for (const filename of filesToRemove) {
        await removeMigrationRecord(pool, filename);
      }
      console.log("✅ Migration records removed");
      return;
    }

    // Get list of executed migrations
    const executedMigrations = await pool.query(
      "SELECT filename FROM migrations"
    );
    const executedFiles = new Set(
      executedMigrations.rows.map((row) => row.filename)
    );

    // Determine which migrations to re-run
    const migrationsToRerun = rerun
      ? new Set(rerun.split(",").map((f) => f.trim()))
      : new Set();

    // Find starting point
    let startIndex = 0;
    if (from) {
      const fromIndex = migrations.indexOf(from);
      if (fromIndex === -1) {
        throw new Error(`Migration "${from}" not found in migrations list`);
      }
      startIndex = fromIndex;
      console.log(`📍 Starting from migration: ${from}`);
    }

    console.log("🚀 Starting migrations...");

    for (let i = startIndex; i < migrations.length; i++) {
      const migration = migrations[i];

      // Skip if already executed (unless force or in rerun list)
      const shouldRerun = force || migrationsToRerun.has(migration);
      if (executedFiles.has(migration) && !shouldRerun) {
        console.log(`⏭️  Skipping ${migration} (already executed)`);
        continue;
      }

      if (shouldRerun && executedFiles.has(migration)) {
        console.log(`🔄 Re-running ${migration}...`);
        // Remove old record before re-running
        await removeMigrationRecord(pool, migration);
      }

      console.log(`📝 Running ${migration}...`);

      try {
        const migrationPath = path.join(
          __dirname,
          "..",
          "database",
          "migration",
          migration
        );
        const sql = fs.readFileSync(migrationPath, "utf8");

        // Run the migration
        await pool.query(sql);

        // Record the migration as executed
        await pool.query("INSERT INTO migrations (filename) VALUES ($1)", [
          migration,
        ]);

        console.log(`✅ ${migration} completed successfully`);
      } catch (error) {
        // Check if it's a "table already exists" error
        if (
          error.code === "42P07" &&
          error.message.includes("already exists")
        ) {
          console.log(`⚠️  ${migration} skipped - table already exists`);
          // Still record it as executed since the table exists
          try {
            await pool.query("INSERT INTO migrations (filename) VALUES ($1)", [
              migration,
            ]);
          } catch (insertError) {
            // Ignore duplicate key errors
            if (insertError.code !== "23505") {
              console.warn(
                `Warning: Could not record migration: ${insertError.message}`
              );
            }
          }
        } else {
          console.error(`❌ Failed to run ${migration}:`, error.message);
          throw error;
        }
      }
    }

    console.log("🎉 All migrations completed successfully!");
  } catch (error) {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    force: args.includes("--force") || args.includes("-f"),
    from:
      args.find((arg) => arg.startsWith("--from="))?.split("=")[1] ||
      args.find((arg) => arg.startsWith("--from:"))?.split(":")[1] ||
      null,
    rerun:
      args.find((arg) => arg.startsWith("--rerun="))?.split("=")[1] ||
      args.find((arg) => arg.startsWith("--rerun:"))?.split(":")[1] ||
      null,
    remove:
      args.find((arg) => arg.startsWith("--remove="))?.split("=")[1] ||
      args.find((arg) => arg.startsWith("--remove:"))?.split(":")[1] ||
      null,
  };
  return options;
}

// Run migrations if this script is executed directly
if (require.main === module) {
  const options = parseArgs();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Migration Script Usage:

  npm run migrate                    # Run all pending migrations
  npm run migrate -- --force         # Re-run all migrations (development only)
  npm run migrate -- --from=035      # Start from migration 035_seed_measurement_field_concepts.sql
  npm run migrate -- --rerun=035,036 # Re-run specific migrations
  npm run migrate -- --remove=035    # Remove migration record (allows re-run)

Options:
  --force, -f          Force re-run all migrations (development only)
  --from=<filename>    Start from specific migration (inclusive)
  --rerun=<files>      Re-run specific migrations (comma-separated)
  --remove=<files>     Remove migration records (comma-separated)
  --help, -h           Show this help message

Examples:
  # Re-run migration 035
  npm run migrate -- --rerun=035_seed_measurement_field_concepts.sql

  # Remove migration record to allow re-run
  npm run migrate -- --remove=035_seed_measurement_field_concepts.sql
  npm run migrate

  # Start from migration 034
  npm run migrate -- --from=034_audit_measurement_fields.sql
`);
    process.exit(0);
  }

  runMigrations(options).catch((error) => {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  });
}

module.exports = { runMigrations };

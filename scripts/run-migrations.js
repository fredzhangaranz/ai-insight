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
];

async function runMigrations() {
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

    // Get list of executed migrations
    const executedMigrations = await pool.query(
      "SELECT filename FROM migrations"
    );
    const executedFiles = executedMigrations.rows.map((row) => row.filename);

    console.log("🚀 Starting migrations...");

    for (const migration of migrations) {
      if (executedFiles.includes(migration)) {
        console.log(`⏭️  Skipping ${migration} (already executed)`);
        continue;
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

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };

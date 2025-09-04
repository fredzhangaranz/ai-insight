#!/usr/bin/env node

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Database connection configuration
const dbConfig = {
  connectionString:
    process.env.INSIGHT_GEN_DB_URL ||
    "postgresql://user:password@localhost:5432/insight_gen_db",
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
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
];

async function runMigrations() {
  const pool = new Pool(dbConfig);

  try {
    console.log("🔌 Connecting to database...");
    await pool.connect();
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

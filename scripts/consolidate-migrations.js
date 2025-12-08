#!/usr/bin/env node
/**
 * Consolidate Migration Scripts
 *
 * This script helps consolidate multiple development migrations into a single
 * migration before production deployment. It creates a new consolidated migration
 * that combines the SQL from multiple migrations.
 *
 * Usage:
 *   node scripts/consolidate-migrations.js --from=034 --to=037 --output=038_consolidated_measurement_fields.sql
 */

const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "..", "database", "migration");

function findMigrationIndex(migrations, filename) {
  return migrations.findIndex((m) => m.startsWith(filename));
}

function consolidateMigrations(from, to, output) {
  // Read migrations list from run-migrations.js
  const migrationsScript = fs.readFileSync(
    path.join(__dirname, "run-migrations.js"),
    "utf8"
  );
  
  // Extract migrations array (simple regex match)
  const migrationsMatch = migrationsScript.match(/const migrations = \[([\s\S]*?)\];/);
  if (!migrationsMatch) {
    throw new Error("Could not parse migrations list from run-migrations.js");
  }
  
  const migrations = migrationsMatch[1]
    .split("\n")
    .map((line) => line.trim().replace(/["',]/g, ""))
    .filter((line) => line && !line.startsWith("//"));

  const fromIndex = findMigrationIndex(migrations, from);
  const toIndex = findMigrationIndex(migrations, to);

  if (fromIndex === -1) {
    throw new Error(`Migration starting with "${from}" not found`);
  }
  if (toIndex === -1) {
    throw new Error(`Migration starting with "${to}" not found`);
  }
  if (fromIndex > toIndex) {
    throw new Error(`From migration (${from}) must come before to migration (${to})`);
  }

  console.log(`📦 Consolidating migrations ${fromIndex} to ${toIndex}...`);

  const migrationsToConsolidate = migrations.slice(fromIndex, toIndex + 1);
  console.log(`   Migrations to consolidate: ${migrationsToConsolidate.join(", ")}`);

  let consolidatedSQL = `/**
 * Consolidated Migration: ${output}
 *
 * This migration consolidates the following migrations:
${migrationsToConsolidate.map((m) => ` * - ${m}`).join("\n")}
 *
 * Generated: ${new Date().toISOString()}
 * 
 * NOTE: This consolidated migration should replace the individual migrations
 * listed above when deploying to production. Remove the individual migrations
 * from the migrations list in run-migrations.js after consolidation.
 */

`;

  for (const migration of migrationsToConsolidate) {
    const migrationPath = path.join(migrationsDir, migration);
    if (!fs.existsSync(migrationPath)) {
      console.warn(`⚠️  Migration file not found: ${migration}`);
      continue;
    }

    const sql = fs.readFileSync(migrationPath, "utf8");
    consolidatedSQL += `-- ============================================================================
-- Migration: ${migration}
-- ============================================================================

${sql}

`;
  }

  const outputPath = path.join(migrationsDir, output);
  fs.writeFileSync(outputPath, consolidatedSQL);
  console.log(`✅ Consolidated migration written to: ${outputPath}`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Review the consolidated migration: ${outputPath}`);
  console.log(`   2. Test it on a development database`);
  console.log(`   3. Remove individual migrations from run-migrations.js:`);
  console.log(`      - Remove: ${migrationsToConsolidate.join(", ")}`);
  console.log(`   4. Add consolidated migration to run-migrations.js`);
  console.log(`   5. Delete individual migration files (optional, keep for history)`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const fromArg = args.find((arg) => arg.startsWith("--from="))?.split("=")[1];
const toArg = args.find((arg) => arg.startsWith("--to="))?.split("=")[1];
const outputArg = args.find((arg) => arg.startsWith("--output="))?.split("=")[1];

if (!fromArg || !toArg || !outputArg) {
  console.error(`
Usage: node scripts/consolidate-migrations.js --from=<prefix> --to=<prefix> --output=<filename>

Example:
  node scripts/consolidate-migrations.js --from=034 --to=037 --output=038_consolidated_measurement_fields.sql

This will consolidate migrations 034, 035, 036, 037 into a single migration file.
`);
  process.exit(1);
}

try {
  consolidateMigrations(fromArg, toArg, outputArg);
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
}


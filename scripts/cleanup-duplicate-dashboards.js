#!/usr/bin/env node

/**
 * Cleanup script to remove duplicate default dashboards
 *
 * This script:
 * 1. Finds all users with multiple "default" dashboards
 * 2. Keeps the oldest one (by createdAt)
 * 3. Deletes the duplicates
 *
 * Run with --dry-run to preview changes without applying them
 */

const path = require("path");
const { Client } = require("pg");

const appRoot = path.resolve(__dirname, "..");

try {
  require("dotenv").config({ path: path.join(appRoot, ".env.local") });
} catch (_) {
  console.error("❌ Failed to load .env.local");
  process.exit(1);
}

const isDryRun = process.argv.includes("--dry-run");
const connectionString = process.env.INSIGHT_GEN_DB_URL;

if (!connectionString) {
  console.error("❌ INSIGHT_GEN_DB_URL environment variable is required");
  process.exit(1);
}

async function cleanupDuplicateDashboards() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log("🧹 Dashboard Duplicate Cleanup Script\n");
    console.log("=".repeat(60));

    if (isDryRun) {
      console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
    }

    // Find all users with duplicate default dashboards
    const duplicatesQuery = `
      SELECT "userId", COUNT(*)::int as count
      FROM "Dashboards"
      WHERE name = 'default'
      GROUP BY "userId"
      HAVING COUNT(*) > 1
    `;

    const duplicates = await client.query(duplicatesQuery);

    if (duplicates.rows.length === 0) {
      console.log("\n✅ No duplicate default dashboards found!");
      return;
    }

    console.log(
      `\n📊 Found ${duplicates.rows.length} user(s) with duplicate default dashboards:\n`
    );

    let totalDeleted = 0;

    for (const { userId, count } of duplicates.rows) {
      // Get user info
      const userInfo = await client.query(
        'SELECT username FROM "Users" WHERE id = $1',
        [userId]
      );
      const username = userInfo.rows[0]?.username || `User ${userId}`;

      console.log(`\n👤 ${username} (ID: ${userId}) - ${count} dashboards:`);

      // Get all default dashboards for this user, ordered by creation date
      const dashboards = await client.query(
        `SELECT id, "createdAt", "updatedAt" 
         FROM "Dashboards" 
         WHERE name = 'default' AND "userId" = $1 
         ORDER BY "createdAt" ASC`,
        [userId]
      );

      // Keep the first (oldest), delete the rest
      const toKeep = dashboards.rows[0];
      const toDelete = dashboards.rows.slice(1);

      console.log(
        `   ✅ KEEP: Dashboard ID ${toKeep.id} (created ${toKeep.createdAt})`
      );

      for (const dashboard of toDelete) {
        console.log(
          `   🗑️  DELETE: Dashboard ID ${dashboard.id} (created ${dashboard.createdAt})`
        );

        if (!isDryRun) {
          await client.query('DELETE FROM "Dashboards" WHERE id = $1', [
            dashboard.id,
          ]);
        }
        totalDeleted++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`\n📈 Summary:`);
    console.log(`   • Users with duplicates: ${duplicates.rows.length}`);
    console.log(
      `   • Dashboards ${
        isDryRun ? "to be deleted" : "deleted"
      }: ${totalDeleted}`
    );

    if (isDryRun) {
      console.log("\n💡 Run without --dry-run to apply these changes");
    } else {
      console.log("\n✅ Cleanup complete!");
    }
  } catch (error) {
    console.error("\n❌ Error during cleanup:", error.message);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  cleanupDuplicateDashboards()
    .catch((error) => {
      console.error("❌ Unexpected error:", error.message);
      process.exit(1);
    })
    .then(() => {
      if (process.exitCode === undefined) {
        process.exit(0);
      }
    });
}

module.exports = { cleanupDuplicateDashboards };

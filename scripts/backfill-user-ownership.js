#!/usr/bin/env node

const path = require("path");
const { Client } = require("pg");

const appRoot = path.resolve(__dirname, "..");

try {
  require("dotenv").config({ path: path.join(appRoot, ".env.local") });
} catch (_) {
  // optional during production deployments
}

requireEnv("INSIGHT_GEN_DB_URL");

const connectionString = process.env.INSIGHT_GEN_DB_URL;
const preferredUsername = process.env.BACKFILL_OWNER_USERNAME || null;

const OWNERSHIP_TABLES = [
  { table: '"SavedInsights"', label: "SavedInsights" },
  { table: '"Dashboards"', label: "Dashboards" },
  { table: '"QueryFunnel"', label: "QueryFunnel" },
];

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const admin = await resolveAdminUser(client);
    console.log(
      `➡️  Using admin user "${admin.username}" (id=${admin.id}) as fallback owner`
    );

    await client.query("BEGIN");
    const updates = [];

    for (const { table, label } of OWNERSHIP_TABLES) {
      const { rowCount } = await client.query(
        `UPDATE ${table}
         SET "userId" = $1
         WHERE "userId" IS NULL`,
        [admin.id]
      );

      updates.push({ label, updated: rowCount });
      console.log(
        rowCount > 0
          ? `✅ ${label}: backfilled ${rowCount} record(s)`
          : `ℹ️  ${label}: no orphaned records found`
      );
    }

    await client.query("COMMIT");

    const residuals = [];
    for (const { table, label } of OWNERSHIP_TABLES) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM ${table}
         WHERE "userId" IS NULL`
      );
      if (rows[0].count > 0) {
        residuals.push({ label, count: rows[0].count });
      }
    }

    if (residuals.length > 0) {
      console.error("❌ Null userId values remain after backfill:");
      for (const { label, count } of residuals) {
        console.error(`   • ${label}: ${count} record(s)`);
      }
      process.exitCode = 1;
    } else {
      console.log("🎉 Ownership backfill complete. No null userId values remain.");
    }

    console.log("\nSummary:");
    updates.forEach(({ label, updated }) => {
      console.log(`   • ${label}: ${updated} updated`);
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // ignore rollback errors
    });
    console.error(
      "❌ Failed to backfill user ownership:",
      error?.message || error
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

async function resolveAdminUser(client) {
  if (preferredUsername) {
    const { rows } = await client.query(
      `SELECT id, username, role FROM "Users" WHERE username = $1 LIMIT 1`,
      [preferredUsername]
    );
    if (rows.length === 0) {
      throw new Error(
        `Specified BACKFILL_OWNER_USERNAME "${preferredUsername}" was not found`
      );
    }
    if (rows[0].role !== "admin") {
      throw new Error(
        `User "${preferredUsername}" is not an admin. Option A requires an admin owner.`
      );
    }
    return rows[0];
  }

  const { rows } = await client.query(
    `SELECT id, username
     FROM "Users"
     WHERE role = 'admin'
     ORDER BY "createdAt" ASC
     LIMIT 1`
  );

  if (rows.length === 0) {
    throw new Error(
      "No admin users found. Seed an admin before running the backfill."
    );
  }

  return rows[0];
}

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(
      `❌ ${name} environment variable is required to run the backfill`
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "❌ Unexpected error while running ownership backfill:",
        error?.message || error
      );
      process.exit(1);
    })
    .then(() => {
      if (process.exitCode === undefined) {
        process.exit(0);
      }
    });
}

module.exports = { main };

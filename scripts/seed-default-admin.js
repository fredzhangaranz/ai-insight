#!/usr/bin/env node

const path = require("path");
const { Client } = require("pg");
const bcrypt = require("bcrypt");

const appRoot = path.resolve(__dirname, "..");

// Load local env if present so INSIGHT_GEN_DB_URL/ADMIN_* are available
try {
  require("dotenv").config({ path: path.join(appRoot, ".env.local") });
} catch (_) {
  // dotenv optional; ignore if not present
}

typeCheckEnv("INSIGHT_GEN_DB_URL");

function typeCheckEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} environment variable is required for seeding`);
  }
}

function getEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} environment variable must be set`);
  }
  return value;
}

async function seedDefaultAdmin() {
  const connectionString = process.env.INSIGHT_GEN_DB_URL;
  const client = new Client({ connectionString });

  await client.connect();

  try {
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM "Users"');
    if (rows[0].count > 0) {
      console.log("✅ Users already exist. Skipping default admin seed.");
      return;
    }

    const username = getEnv("ADMIN_USERNAME");
    const password = getEnv("ADMIN_PASSWORD");
    const email = getEnv("ADMIN_EMAIL");
    const fullName = process.env.ADMIN_FULL_NAME || "System Administrator";

    if (password.length < 8) {
      throw new Error("ADMIN_PASSWORD must be at least 8 characters long");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO "Users" (username, email, "passwordHash", "fullName", role, "isActive", "mustChangePassword")
       VALUES ($1, $2, $3, $4, 'admin', TRUE, FALSE)`
      , [username, email, passwordHash, fullName]
    );

    console.log(`✅ Default admin user created (username: ${username})`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seedDefaultAdmin()
    .catch((err) => {
      console.error("❌ Failed to seed default admin:", err?.message || err);
      process.exit(1);
    })
    .then(() => {
      process.exit(0);
    });
}

module.exports = { seedDefaultAdmin };

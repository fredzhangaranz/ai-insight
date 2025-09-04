#!/usr/bin/env node

/**
 * Database seeding script for AI configuration in production
 * This script seeds the AIConfiguration table with values from environment variables
 * Should be run during Docker container startup in production
 */

const { getInsightGenDbPool } = require("../lib/db");

async function seedAIConfig() {
  const pool = getInsightGenDbPool();

  try {
    console.log("🌱 Starting AI configuration seeding...");

    // Check if configurations already exist
    const existing = await pool.query(
      'SELECT COUNT(*) as count FROM "AIConfiguration"'
    );
    if (existing.rows[0].count > 0) {
      console.log("✅ AI configurations already exist, skipping seed");
      return;
    }

    const configurations = [];

    // Seed Anthropic configuration
    if (process.env.ANTHROPIC_API_KEY) {
      configurations.push({
        providerType: "anthropic",
        providerName: "Claude 3.5 Sonnet",
        isEnabled: true,
        isDefault: true,
        configData: {
          apiKey: process.env.ANTHROPIC_API_KEY,
          modelId: process.env.AI_MODEL_NAME || "claude-3-5-sonnet-latest",
          baseUrl: "https://api.anthropic.com",
        },
      });
      console.log("📝 Added Anthropic configuration");
    }

    // Seed Google configuration
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      configurations.push({
        providerType: "google",
        providerName: "Gemini 2.5 Pro",
        isEnabled: true,
        isDefault: configurations.length === 0, // Default if no Anthropic
        configData: {
          projectId: process.env.GOOGLE_CLOUD_PROJECT,
          location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
          modelId: "gemini-2.5-pro",
        },
      });
      console.log("📝 Added Google configuration");
    }

    // Seed OpenWebUI configuration
    if (process.env.OPENWEBUI_BASE_URL) {
      configurations.push({
        providerType: "openwebui",
        providerName: "Local LLM (Open WebUI)",
        isEnabled: true,
        isDefault: configurations.length === 0, // Default if no other providers
        configData: {
          baseUrl: process.env.OPENWEBUI_BASE_URL,
          apiKey: process.env.OPENWEBUI_API_KEY,
          modelId: process.env.OPENWEBUI_MODEL_ID || "local-model",
          timeout: parseInt(process.env.OPENWEBUI_TIMEOUT || "30000"),
        },
      });
      console.log("📝 Added OpenWebUI configuration");
    }

    if (configurations.length === 0) {
      console.log("⚠️  No AI configurations found in environment variables");
      console.log(
        "   Set ANTHROPIC_API_KEY, GOOGLE_CLOUD_PROJECT, or OPENWEBUI_BASE_URL"
      );
      return;
    }

    // Insert configurations
    for (const config of configurations) {
      await pool.query(
        `
        INSERT INTO "AIConfiguration" (
          "providerType", "providerName", "isEnabled", "isDefault",
          "configData", "createdBy", "validationStatus"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          config.providerType,
          config.providerName,
          config.isEnabled,
          config.isDefault,
          JSON.stringify(config.configData),
          "system-seed",
          "pending",
        ]
      );
    }

    console.log(
      `✅ Successfully seeded ${configurations.length} AI configuration(s)`
    );
  } catch (error) {
    console.error("❌ Error seeding AI configuration:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedAIConfig();
}

module.exports = { seedAIConfig };

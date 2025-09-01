#!/usr/bin/env node

/**
 * Test script to verify the new AI configuration system
 */

const { AIConfigLoader } = require("./lib/config/ai-config-loader");

async function testConfig() {
  console.log("🧪 Testing AI Configuration System...\n");

  try {
    const configLoader = AIConfigLoader.getInstance();
    const { providers, source } = await configLoader.getConfiguration();

    console.log(`📍 Configuration Source: ${source}`);
    console.log(`🔢 Number of providers found: ${providers.length}\n`);

    if (providers.length === 0) {
      console.log(
        "⚠️  No AI providers configured. Check your .env.local file for:"
      );
      console.log("   - ANTHROPIC_API_KEY");
      console.log("   - GOOGLE_CLOUD_PROJECT");
      console.log("   - OPENWEBUI_BASE_URL");
      return;
    }

    console.log("📋 Configured Providers:");
    providers.forEach((provider, index) => {
      console.log(
        `   ${index + 1}. ${provider.providerName} (${provider.providerType})`
      );
      console.log(
        `      - Status: ${provider.isEnabled ? "✅ Enabled" : "❌ Disabled"}`
      );
      console.log(`      - Default: ${provider.isDefault ? "⭐ Yes" : "No"}`);

      // Show config keys (without sensitive data)
      const configKeys = Object.keys(provider.configData).filter(
        (key) =>
          !key.toLowerCase().includes("key") &&
          !key.toLowerCase().includes("secret")
      );
      if (configKeys.length > 0) {
        console.log(`      - Config: ${configKeys.join(", ")}`);
      }
      console.log("");
    });

    console.log("✅ Configuration test completed successfully!");
  } catch (error) {
    console.error("❌ Configuration test failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testConfig();
}

module.exports = { testConfig };

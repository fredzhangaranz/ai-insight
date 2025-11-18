#!/usr/bin/env node

/**
 * Test script to verify ontology synonym lookup
 *
 * Usage: node scripts/test-ontology-lookup.js "tissue removal"
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

// Use esbuild-register to load TypeScript
require("esbuild-register");

const { getOntologyLookupService } = require("../lib/services/ontology/ontology-lookup.service");

async function main() {
  const term = process.argv[2] || "tissue removal";
  const customerId = "test-customer";

  console.log(`\n🔍 Testing ontology lookup for: "${term}"\n`);

  const service = getOntologyLookupService();

  try {
    const synonyms = await service.lookupOntologySynonyms(term, customerId);

    console.log(`✅ Found ${synonyms.length} synonym(s):`);
    synonyms.forEach((syn, idx) => {
      console.log(`   ${idx + 1}. "${syn}"`);
    });

    // Test cache
    console.log(`\n📊 Cache stats:`);
    const stats = service.getCacheStats();
    console.log(`   Size: ${stats.size}/${stats.maxSize}`);
    console.log(`   TTL: ${stats.ttlMs}ms`);

    // Test a few more terms
    const testTerms = ["debridement", "DEBRIDEMENT", "wound cleaning"];

    console.log(`\n🧪 Testing additional terms:`);
    for (const testTerm of testTerms) {
      const results = await service.lookupOntologySynonyms(testTerm, customerId);
      console.log(`   "${testTerm}" → ${results.length} synonym(s)`);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

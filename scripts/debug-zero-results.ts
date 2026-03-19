#!/usr/bin/env ts-node
/**
 * Diagnostic script to debug zero results issue
 * 
 * Usage:
 *   ts-node scripts/debug-zero-results.ts <customerId> <question>
 * 
 * Example:
 *   ts-node scripts/debug-zero-results.ts customer-1 "How many wound assessments in last 6 months?"
 */

import { ThreeModeOrchestrator } from "@/lib/services/semantic/three-mode-orchestrator.service";

async function debugZeroResults() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: ts-node debug-zero-results.ts <customerId> <question>");
    console.error("Example: ts-node debug-zero-results.ts customer-1 'How many assessments?'");
    process.exit(1);
  }

  const customerId = args[0];
  const question = args[1];

  console.log("[DEBUG] Starting zero-results diagnostic");
  console.log("[DEBUG] Customer ID:", customerId);
  console.log("[DEBUG] Question:", question);
  console.log("[DEBUG] -----------------------------------");

  try {
    const orchestrator = new ThreeModeOrchestrator();
    
    // Enable verbose logging
    process.env.NODE_ENV = "development";

    const result = await orchestrator.ask(question, customerId);

    console.log("[DEBUG] -----------------------------------");
    console.log("[DEBUG] ORCHESTRATION RESULT:");
    console.log("[DEBUG] Mode:", result.mode);
    console.log("[DEBUG] SQL:", result.sql?.slice(0, 200) + "...");
    console.log("[DEBUG] Rows returned:", result.results?.rows?.length || 0);
    console.log("[DEBUG] Columns:", result.results?.columns?.slice(0, 5));
    console.log("[DEBUG] Error:", result.error?.message);

    if (result.results?.rows && result.results.rows.length === 0) {
      console.log("\n[DIAGNOSIS] ⚠️ ZERO ROWS RETURNED");
      console.log("The query was accepted but returned no results.");
      console.log("\nPossible causes:");
      console.log("1. WHERE clause conditions are too restrictive");
      console.log("2. Date ranges don't match your data");
      console.log("3. Filter values don't exist in the database");
      console.log("4. Wrong schema/table names being used");
      console.log("\nNext steps:");
      console.log("1. Copy the SQL above and run it in DBeaver");
      console.log("2. Check terminal output for the FULL query (not truncated)");
      console.log("3. Compare generated query with manual query that works");
    } else if (result.results?.rows && result.results.rows.length > 0) {
      console.log("\n[SUCCESS] ✅ Query returned results!");
      console.log("First row:", JSON.stringify(result.results.rows[0], null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error("[ERROR]", error);
    process.exit(1);
  }
}

debugZeroResults();

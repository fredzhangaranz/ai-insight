/**
 * Database schema context loader.
 * Introspects rpt schema dynamically and appends static query guidelines.
 */

import fs from "fs";
import path from "path";
import { getSilhouetteDbPool } from "@/lib/db";
import { withCustomerPool } from "@/lib/services/semantic/customer-query.service";
import { introspectSchema } from "@/lib/services/schema-introspection.service";
import { toCompactMarkdown } from "@/lib/services/schema-formatter";

const SCHEMA_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const schemaCache = new Map<
  string,
  { schema: string; timestamp: number }
>();

function loadGuidelines(): string {
  const guidelinesPath = path.join(
    process.cwd(),
    "lib",
    "ai",
    "rpt-query-guidelines.md"
  );
  return fs.readFileSync(guidelinesPath, "utf-8");
}

/**
 * Load database schema context for LLM prompts.
 * Introspects rpt schema (all tables) and appends static query guidelines.
 * @param customerId - When provided, introspects the customer's DB. Otherwise uses app-level Silhouette DB.
 */
export async function loadDatabaseSchemaContext(
  customerId?: string
): Promise<string> {
  const cacheKey = customerId ?? "default";
  const cached = schemaCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL_MS) {
    return cached.schema;
  }

  let tables;
  if (customerId) {
    tables = await withCustomerPool(customerId, (pool) =>
      introspectSchema(pool, "rpt")
    );
  } else {
    const pool = await getSilhouetteDbPool();
    tables = await introspectSchema(pool, "rpt");
  }

  const compactSchema = toCompactMarkdown(tables);
  const guidelines = loadGuidelines();
  const full = `${compactSchema}\n\n---\n\n${guidelines}`;

  schemaCache.set(cacheKey, { schema: full, timestamp: Date.now() });
  return full;
}

/** Clear schema cache. Used in tests. */
export function clearSchemaCache(): void {
  schemaCache.clear();
}

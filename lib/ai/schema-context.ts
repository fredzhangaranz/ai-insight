import fs from "fs";
import path from "path";

let cachedSchemaContext: string | null = null;

export function loadDatabaseSchemaContext(): string {
  if (cachedSchemaContext) return cachedSchemaContext;
  const schemaContextPath = path.join(
    process.cwd(),
    "lib",
    "database-schema-context.md"
  );
  cachedSchemaContext = fs.readFileSync(schemaContextPath, "utf-8");
  return cachedSchemaContext;
}

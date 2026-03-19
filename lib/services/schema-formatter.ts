/**
 * Compact markdown formatter for schema metadata.
 * One line per column, inline FK refs, optimized for LLM token efficiency.
 */

import type { TableSchema } from "./schema-introspection.service";

export function toCompactMarkdown(tables: TableSchema[]): string {
  const lines: string[] = [];

  for (const t of tables) {
    const prefix = `${t.schema}.${t.table}`;
    lines.push(`### ${prefix}`);

    for (const c of t.columns) {
      const typeStr = c.dataType + (c.isNullable ? "?" : "");
      const pkStr = c.isPrimaryKey ? " PK" : "";
      const fkStr = c.fkRef
        ? ` -> ${c.fkRef.schema}.${c.fkRef.table}(${c.fkRef.column})`
        : "";
      lines.push(`- ${c.name}: ${typeStr}${pkStr}${fkStr}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

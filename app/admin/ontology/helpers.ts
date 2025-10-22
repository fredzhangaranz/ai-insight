export interface OntologyFilterParams {
  search?: string;
  conceptType?: string | null;
  includeDeprecated?: boolean;
}

export function parseAliases(input: string): string[] {
  if (!input) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .split(/[\n,]/)
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0)
    )
  );
}

export function stringifyAliases(aliases: string[]): string {
  if (!Array.isArray(aliases) || aliases.length === 0) {
    return "";
  }
  return aliases.join("\n");
}

export function parseMetadata(input: string): Record<string, unknown> {
  const trimmed = input?.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Metadata must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid metadata JSON: ${error.message}`);
    }
    throw new Error("Invalid metadata JSON");
  }
}

export function buildQueryParams(filters: OntologyFilterParams): string {
  const params = new URLSearchParams();

  if (filters.search && filters.search.trim().length > 0) {
    params.set("search", filters.search.trim());
  }

  if (filters.conceptType && filters.conceptType.trim().length > 0) {
    params.set("conceptType", filters.conceptType.trim());
  }

  if (filters.includeDeprecated) {
    params.set("includeDeprecated", "true");
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

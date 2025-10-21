import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import {
  type OntologySearchOptions,
  searchOntologyConcepts,
} from "@/lib/services/ontology-search.service";

type SearchPayload = {
  query?: unknown;
  limit?: unknown;
  conceptType?: unknown;
  includeDeprecated?: unknown;
  minScore?: unknown;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalised)) {
      return true;
    }
    if (["false", "0", "no"].includes(normalised)) {
      return false;
    }
  }

  return undefined;
}

function parseConceptType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parsePayload(payload: SearchPayload):
  | { query: string; options: OntologySearchOptions }
  | { error: NextResponse } {
  const rawQuery = payload.query;
  if (typeof rawQuery !== "string") {
    return {
      error: createErrorResponse.badRequest(
        "Missing required field 'query' in request"
      ),
    };
  }

  const trimmed = rawQuery.trim();
  if (trimmed.length === 0) {
    return {
      error: createErrorResponse.badRequest(
        "Query must be a non-empty string"
      ),
    };
  }

  const query = trimmed.replace(/\s+/g, " ");

  const options: OntologySearchOptions = {};

  const limit = parseNumber(payload.limit);
  if (limit !== undefined) {
    options.limit = clamp(Math.floor(limit), 1, 50);
  }

  const conceptType = parseConceptType(payload.conceptType);
  if (conceptType !== undefined) {
    options.conceptType = conceptType;
  }

  const includeDeprecated = parseBoolean(payload.includeDeprecated);
  if (includeDeprecated !== undefined) {
    options.includeDeprecated = includeDeprecated;
  }

  const minScore = parseNumber(payload.minScore);
  if (minScore !== undefined) {
    options.minScore = clamp(minScore, 0, 1);
  }

  return { query, options };
}

async function executeSearch(
  req: NextRequest,
  payload: SearchPayload
): Promise<NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const parsed = parsePayload(payload);
  if ("error" in parsed) {
    return parsed.error;
  }

  const startedAt = Date.now();
  const results = await searchOntologyConcepts(parsed.query, parsed.options);
  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    query: parsed.query,
    options: parsed.options,
    count: results.length,
    elapsedMs,
    results,
  });
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const payload: SearchPayload = {
    query: params.get("query") ?? params.get("q") ?? undefined,
    limit: params.get("limit") ?? undefined,
    conceptType:
      params.get("conceptType") ?? params.get("type") ?? undefined,
    includeDeprecated:
      params.get("includeDeprecated") ?? params.get("deprecated") ?? undefined,
    minScore: params.get("minScore") ?? undefined,
  };

  return executeSearch(req, payload);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  let body: SearchPayload = {};
  if (req.headers.get("content-type")?.includes("application/json")) {
    try {
      body = (await req.json()) as SearchPayload;
    } catch {
      return createErrorResponse.badRequest(
        "Invalid JSON payload. Expected application/json body."
      );
    }
  } else {
    return createErrorResponse.badRequest(
      "Unsupported content type. Use application/json."
    );
  }

  return executeSearch(req, body);
});

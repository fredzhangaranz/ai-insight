import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import {
  listOntologyConcepts,
  createOntologyConcept,
  type OntologyConceptFilters,
  type CreateConceptPayload,
} from "@/lib/services/ontology-concepts.service";

function parseFilters(searchParams: URLSearchParams): OntologyConceptFilters {
  const search = searchParams.get("search");
  const conceptType = searchParams.get("conceptType");
  const includeDeprecated = searchParams.get("includeDeprecated");

  return {
    search: search || undefined,
    conceptType: conceptType || null,
    includeDeprecated: includeDeprecated === "true",
  };
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  // Check if user is admin
  if (authResult.user.role !== "admin") {
    return createErrorResponse.forbidden("Admin access required");
  }

  const filters = parseFilters(req.nextUrl.searchParams);
  const result = await listOntologyConcepts(filters);

  return NextResponse.json(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  // Check if user is admin
  if (authResult.user.role !== "admin") {
    return createErrorResponse.forbidden("Admin access required");
  }

  let payload: CreateConceptPayload;
  try {
    payload = await req.json();
  } catch {
    return createErrorResponse.badRequest("Invalid JSON payload");
  }

  // Validate required fields
  if (!payload.conceptName || !payload.canonicalName || !payload.conceptType) {
    return createErrorResponse.badRequest(
      "Missing required fields: conceptName, canonicalName, conceptType"
    );
  }

  try {
    const performedBy =
      authResult.user.email || authResult.user.username || "unknown";
    const concept = await createOntologyConcept(payload, performedBy);
    return NextResponse.json(concept, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create concept";
    return createErrorResponse.internalError(message);
  }
});

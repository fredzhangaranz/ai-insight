import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import {
  getOntologyConcept,
  updateOntologyConcept,
  deleteOntologyConcept,
  type UpdateConceptPayload,
} from "@/lib/services/ontology-concepts.service";

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Check if user is admin
    if (authResult.user.role !== "admin") {
      return createErrorResponse.forbidden("Admin access required");
    }

    const concept = await getOntologyConcept(params.id);
    if (!concept) {
      return createErrorResponse.notFound("Concept not found");
    }

    return NextResponse.json(concept);
  }
);

export const PATCH = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Check if user is admin
    if (authResult.user.role !== "admin") {
      return createErrorResponse.forbidden("Admin access required");
    }

    let payload: UpdateConceptPayload;
    try {
      payload = await req.json();
    } catch {
      return createErrorResponse.badRequest("Invalid JSON payload");
    }

    try {
      const performedBy =
        authResult.user.email || authResult.user.username || "unknown";
      const concept = await updateOntologyConcept(
        params.id,
        payload,
        performedBy
      );
      return NextResponse.json(concept);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update concept";
      if (message.includes("not found")) {
        return createErrorResponse.notFound(message);
      }
      return createErrorResponse.internalError(message);
    }
  }
);

export const DELETE = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Check if user is admin
    if (authResult.user.role !== "admin") {
      return createErrorResponse.forbidden("Admin access required");
    }

    try {
      const performedBy =
        authResult.user.email || authResult.user.username || "unknown";
      await deleteOntologyConcept(params.id, performedBy);
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete concept";
      if (message.includes("not found")) {
        return createErrorResponse.notFound(message);
      }
      return createErrorResponse.internalError(message);
    }
  }
);

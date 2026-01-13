import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import {
  listOntologyConcepts,
  type OntologyConceptFilters,
} from "@/lib/services/ontology-concepts.service";

function parseFilters(searchParams: URLSearchParams): OntologyConceptFilters {
  const search = searchParams.get("search");
  const conceptType = searchParams.get("conceptType");
  const includeDeprecated = searchParams.get("includeDeprecated");
  const ids = searchParams.get("ids");

  const filters: OntologyConceptFilters = {
    search: search || undefined,
    conceptType: conceptType || null,
    includeDeprecated: includeDeprecated === "true",
  };

  // If specific IDs are provided, we'll filter in memory
  if (ids) {
    const conceptIds = ids
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    // We'll handle this in the service or here
    (filters as any).conceptIds = conceptIds;
  }

  return filters;
}

function conceptsToYaml(concepts: any[]): string {
  const yamlContent = concepts
    .map((concept, index) => {
      const yaml = `concept_${index + 1}:
  id: "${concept.id}"
  concept_name: "${concept.conceptName}"
  canonical_name: "${concept.canonicalName}"
  concept_type: "${concept.conceptType}"
  description: ${concept.description ? `"${concept.description}"` : "null"}
  aliases: [${concept.aliases.map((alias: string) => `"${alias}"`).join(", ")}]
  metadata: ${JSON.stringify(concept.metadata, null, 4).replace(/^/gm, "    ")}
  is_deprecated: ${concept.isDeprecated}
  created_at: "${concept.createdAt}"
  updated_at: "${concept.updatedAt}"`;

      return yaml;
    })
    .join("\n\n");

  return `# Clinical Ontology Export
# Generated on ${new Date().toISOString()}
# Total concepts: ${concepts.length}

${yamlContent}`;
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
  const format = req.nextUrl.searchParams.get("format") || "yaml";

  try {
    const result = await listOntologyConcepts(filters);

    // If specific IDs are requested, filter the results
    if ((filters as any).conceptIds) {
      const requestedIds = (filters as any).conceptIds;
      result.concepts = result.concepts.filter((concept) =>
        requestedIds.includes(concept.id)
      );
    }

    if (format === "yaml") {
      const yamlContent = conceptsToYaml(result.concepts);
      return new NextResponse(yamlContent, {
        headers: {
          "Content-Type": "text/yaml",
          "Content-Disposition":
            'attachment; filename="clinical-ontology-export.yaml"',
        },
      });
    }

    // Default to JSON
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return createErrorResponse.internalError(message);
  }
});

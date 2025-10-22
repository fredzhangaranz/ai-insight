import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";

export interface OntologyConcept {
  id: string;
  conceptName: string;
  canonicalName: string;
  conceptType: string;
  description: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
  isDeprecated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OntologyConceptFilters {
  search?: string;
  conceptType?: string | null;
  includeDeprecated?: boolean;
}

export interface CreateConceptPayload {
  conceptName: string;
  canonicalName: string;
  conceptType: string;
  description?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateConceptPayload {
  conceptName?: string;
  canonicalName?: string;
  conceptType?: string;
  description?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
  isDeprecated?: boolean;
}

export interface OntologyListResponse {
  concepts: OntologyConcept[];
  total: number;
}

/**
 * List ontology concepts with optional filtering
 */
export async function listOntologyConcepts(
  filters: OntologyConceptFilters = {}
): Promise<OntologyListResponse> {
  const pool = await getInsightGenDbPool();

  let whereConditions: string[] = [];
  let queryParams: any[] = [];
  let paramIndex = 1;

  // Search filter
  if (filters.search && filters.search.trim()) {
    const searchTerm = `%${filters.search.trim()}%`;
    whereConditions.push(
      `(concept_name ILIKE $${paramIndex} OR canonical_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR $${paramIndex} = ANY(aliases))`
    );
    queryParams.push(searchTerm);
    paramIndex++;
  }

  // Concept type filter
  if (filters.conceptType) {
    whereConditions.push(`concept_type = $${paramIndex}`);
    queryParams.push(filters.conceptType);
    paramIndex++;
  }

  // Deprecated filter
  if (!filters.includeDeprecated) {
    whereConditions.push(`is_deprecated = false`);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM "ClinicalOntology" ${whereClause}`;
  const countResult = await pool.query(countQuery, queryParams);
  const total = parseInt(countResult.rows[0].total);

  // Get concepts
  const conceptsQuery = `
    SELECT 
      id,
      concept_name,
      canonical_name,
      concept_type,
      description,
      aliases,
      metadata,
      is_deprecated,
      created_at,
      updated_at
    FROM "ClinicalOntology"
    ${whereClause}
    ORDER BY created_at DESC
  `;

  const result = await pool.query(conceptsQuery, queryParams);

  const concepts: OntologyConcept[] = result.rows.map((row) => ({
    id: row.id,
    conceptName: row.concept_name,
    canonicalName: row.canonical_name,
    conceptType: row.concept_type,
    description: row.description,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    metadata: row.metadata || {},
    isDeprecated: Boolean(row.is_deprecated),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  }));

  return { concepts, total };
}

/**
 * Get a single ontology concept by ID
 */
export async function getOntologyConcept(
  id: string
): Promise<OntologyConcept | null> {
  const pool = await getInsightGenDbPool();

  const result = await pool.query(
    `SELECT 
      id,
      concept_name,
      canonical_name,
      concept_type,
      description,
      aliases,
      metadata,
      is_deprecated,
      created_at,
      updated_at
    FROM "ClinicalOntology" 
    WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    conceptName: row.concept_name,
    canonicalName: row.canonical_name,
    conceptType: row.concept_type,
    description: row.description,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    metadata: row.metadata || {},
    isDeprecated: Boolean(row.is_deprecated),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };
}

/**
 * Create a new ontology concept
 */
export async function createOntologyConcept(
  payload: CreateConceptPayload,
  performedBy?: string
): Promise<OntologyConcept> {
  const pool = await getInsightGenDbPool();

  // Generate embedding for the concept
  const embeddingService = getEmbeddingService();
  const embedding = await embeddingService.generateEmbedding(
    `${payload.conceptName} ${payload.canonicalName} ${
      payload.description || ""
    }`
  );

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Failed to generate embedding for concept");
  }

  const embeddingLiteral = `[${embedding.join(",")}]`;

  const result = await pool.query(
    `INSERT INTO "ClinicalOntology" (
      concept_name,
      canonical_name,
      concept_type,
      description,
      aliases,
      metadata,
      embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING 
      id,
      concept_name,
      canonical_name,
      concept_type,
      description,
      aliases,
      metadata,
      is_deprecated,
      created_at,
      updated_at`,
    [
      payload.conceptName,
      payload.canonicalName,
      payload.conceptType,
      payload.description || null,
      payload.aliases || [],
      JSON.stringify(payload.metadata || {}),
      embeddingLiteral,
    ]
  );

  const row = result.rows[0];
  const concept = {
    id: row.id,
    conceptName: row.concept_name,
    canonicalName: row.canonical_name,
    conceptType: row.concept_type,
    description: row.description,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    metadata: row.metadata || {},
    isDeprecated: Boolean(row.is_deprecated),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };

  // Log mutation
  if (performedBy) {
    await logOntologyMutation(row.id, "created", performedBy, {
      conceptName: payload.conceptName,
      conceptType: payload.conceptType,
    });
  }

  return concept;
}

/**
 * Update an ontology concept
 */
export async function updateOntologyConcept(
  id: string,
  payload: UpdateConceptPayload,
  performedBy?: string
): Promise<OntologyConcept> {
  const pool = await getInsightGenDbPool();

  // Get existing concept to generate new embedding if needed
  const existing = await getOntologyConcept(id);
  if (!existing) {
    throw new Error("Concept not found");
  }

  // Generate new embedding if concept name or description changed
  let embeddingLiteral: string | undefined;
  if (
    payload.conceptName ||
    payload.canonicalName ||
    payload.description !== undefined
  ) {
    const embeddingService = getEmbeddingService();
    const newConceptName = payload.conceptName || existing.conceptName;
    const newCanonicalName = payload.canonicalName || existing.canonicalName;
    const newDescription =
      payload.description !== undefined
        ? payload.description
        : existing.description;

    const embedding = await embeddingService.generateEmbedding(
      `${newConceptName} ${newCanonicalName} ${newDescription || ""}`
    );

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Failed to generate embedding for concept");
    }

    embeddingLiteral = `[${embedding.join(",")}]`;
  }

  const updateFields: string[] = [];
  const updateValues: any[] = [];
  let paramIndex = 1;

  if (payload.conceptName !== undefined) {
    updateFields.push(`concept_name = $${paramIndex}`);
    updateValues.push(payload.conceptName);
    paramIndex++;
  }

  if (payload.canonicalName !== undefined) {
    updateFields.push(`canonical_name = $${paramIndex}`);
    updateValues.push(payload.canonicalName);
    paramIndex++;
  }

  if (payload.conceptType !== undefined) {
    updateFields.push(`concept_type = $${paramIndex}`);
    updateValues.push(payload.conceptType);
    paramIndex++;
  }

  if (payload.description !== undefined) {
    updateFields.push(`description = $${paramIndex}`);
    updateValues.push(payload.description);
    paramIndex++;
  }

  if (payload.aliases !== undefined) {
    updateFields.push(`aliases = $${paramIndex}`);
    updateValues.push(payload.aliases);
    paramIndex++;
  }

  if (payload.metadata !== undefined) {
    updateFields.push(`metadata = $${paramIndex}`);
    updateValues.push(JSON.stringify(payload.metadata));
    paramIndex++;
  }

  if (payload.isDeprecated !== undefined) {
    updateFields.push(`is_deprecated = $${paramIndex}`);
    updateValues.push(payload.isDeprecated);
    paramIndex++;
  }

  if (embeddingLiteral) {
    updateFields.push(`embedding = $${paramIndex}`);
    updateValues.push(embeddingLiteral);
    paramIndex++;
  }

  if (updateFields.length === 0) {
    return existing;
  }

  updateFields.push(`updated_at = NOW()`);
  updateValues.push(id);

  const result = await pool.query(
    `UPDATE "ClinicalOntology" 
    SET ${updateFields.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING 
      id,
      concept_name,
      canonical_name,
      concept_type,
      description,
      aliases,
      metadata,
      is_deprecated,
      created_at,
      updated_at`,
    [...updateValues]
  );

  const row = result.rows[0];
  const concept = {
    id: row.id,
    conceptName: row.concept_name,
    canonicalName: row.canonical_name,
    conceptType: row.concept_type,
    description: row.description,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    metadata: row.metadata || {},
    isDeprecated: Boolean(row.is_deprecated),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };

  // Log mutation
  if (performedBy) {
    await logOntologyMutation(id, "updated", performedBy, {
      changes: payload,
    });
  }

  return concept;
}

/**
 * Delete an ontology concept (soft delete by marking as deprecated)
 */
export async function deleteOntologyConcept(
  id: string,
  performedBy?: string
): Promise<void> {
  const pool = await getInsightGenDbPool();

  const result = await pool.query(
    `UPDATE "ClinicalOntology" 
    SET is_deprecated = true, updated_at = NOW()
    WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new Error("Concept not found");
  }

  // Log mutation
  if (performedBy) {
    await logOntologyMutation(id, "deleted", performedBy, {
      action: "soft_delete",
    });
  }
}

/**
 * Bulk deprecate concepts
 */
export async function bulkDeprecateConcepts(
  conceptIds: string[]
): Promise<void> {
  const pool = await getInsightGenDbPool();

  await pool.query(
    `UPDATE "ClinicalOntology" 
    SET is_deprecated = true, updated_at = NOW()
    WHERE id = ANY($1)`,
    [conceptIds]
  );
}

/**
 * Log ontology concept mutations for audit trail
 */
async function logOntologyMutation(
  conceptId: string,
  action: string,
  performedBy: string,
  details: Record<string, unknown>
): Promise<void> {
  const pool = await getInsightGenDbPool();

  await pool
    .query(
      `INSERT INTO "OntologyAuditLog" (concept_id, action, performed_by, details, performed_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT DO NOTHING`,
      [conceptId, action, performedBy, JSON.stringify(details)]
    )
    .catch(() => {
      // Silently ignore if audit table doesn't exist yet
    });
}

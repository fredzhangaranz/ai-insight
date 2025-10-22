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
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface OntologyFilters {
  search: string;
  conceptType: string | null;
  includeDeprecated: boolean;
}

export interface ConceptMutationPayload {
  conceptName: string;
  canonicalName: string;
  conceptType: string;
  description?: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
  isDeprecated?: boolean;
}

export interface ConceptFormSubmitPayload extends ConceptMutationPayload {
  id?: string;
}

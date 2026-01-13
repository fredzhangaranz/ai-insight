// Shared types for semantic SQL generation services

export interface FieldAssumption {
  intent: string; // Description of the user intent (e.g., desired metric)
  assumed: string; // What the system assumed to satisfy the intent
  actual: string | null; // The actual field/column that was used
  confidence: number; // Confidence (0-1) in the assumption
}

export interface SQLGenerationResult {
  sql: string;
  executionPlan: {
    tables: string[];
    fields: string[];
    filters: string[];
    joins: string[];
    aggregations: string[];
  };
  confidence: number;
  assumptions: FieldAssumption[];
}

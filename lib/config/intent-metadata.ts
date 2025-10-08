/**
 * Intent Metadata Configuration
 *
 * Defines user-friendly metadata for each template intent type.
 * Used across template authoring UIs to provide consistent, helpful guidance.
 */

export interface IntentMetadata {
  value: string;
  label: string;
  icon: string;
  description: string;
  category: string;
  examples: string[];
  sqlHint: string;
}

export const INTENT_METADATA: Record<string, IntentMetadata> = {
  aggregation_by_category: {
    value: "aggregation_by_category",
    label: "Aggregation by Category",
    icon: "📊",
    description: "Count, sum, or average values grouped by categorical columns",
    category: "Basic Analysis",
    examples: [
      "How many wounds does each patient have?",
      "What is the average healing time by etiology type?",
      "Count assessments by wound location",
    ],
    sqlHint: "Uses GROUP BY with aggregate functions (COUNT, SUM, AVG)",
  },
  time_series_trend: {
    value: "time_series_trend",
    label: "Time Series Trend",
    icon: "📈",
    description:
      "Track metrics over time with date-based grouping and ordering",
    category: "Time-Based",
    examples: [
      "Show weekly assessment counts for the past 3 months",
      "How has average wound area changed over time?",
      "Monthly patient admission trends",
    ],
    sqlHint:
      "Uses date grouping (DAY, WEEK, MONTH) with ORDER BY date ascending",
  },
  top_k: {
    value: "top_k",
    label: "Top K Ranking",
    icon: "🏆",
    description: "Find top N or bottom N records ranked by a metric",
    category: "Ranking",
    examples: [
      "Top 10 patients with the most wounds",
      "5 largest wounds by area",
      "Bottom 20 healers by time to closure",
    ],
    sqlHint: "Uses TOP N or ROW_NUMBER() with ORDER BY metric DESC/ASC",
  },
  latest_per_entity: {
    value: "latest_per_entity",
    label: "Latest Per Entity",
    icon: "🔄",
    description:
      "Get the most recent record for each entity using window functions",
    category: "Time-Based",
    examples: [
      "Latest assessment for each patient",
      "Current state of each wound",
      "Most recent measurement per wound type",
    ],
    sqlHint:
      "Uses ROW_NUMBER() OVER (PARTITION BY entity ORDER BY date DESC) WHERE rn = 1",
  },
  as_of_state: {
    value: "as_of_state",
    label: "As-Of State Snapshot",
    icon: "📅",
    description: "Point-in-time snapshot using date range validity checks",
    category: "Time-Based",
    examples: [
      "Active wounds as of January 1st",
      "Patient status on a specific date",
      "Open assessments at month-end",
    ],
    sqlHint:
      "Uses WHERE startDate <= {asOfDate} AND (endDate IS NULL OR endDate > {asOfDate})",
  },
  pivot: {
    value: "pivot",
    label: "Pivot (Rows to Columns)",
    icon: "↔️",
    description: "Transform row values into columns (one column per category)",
    category: "Data Transformation",
    examples: [
      "Show measurement types as separate columns",
      "Create one column per wound state",
      "Pivot attributes into columns",
    ],
    sqlHint: "Uses MAX(CASE WHEN category = 'X' THEN value END) AS columnX",
  },
  unpivot: {
    value: "unpivot",
    label: "Unpivot (Columns to Rows)",
    icon: "↕️",
    description: "Transform columns into rows (normalize wide data)",
    category: "Data Transformation",
    examples: [
      "Convert column-per-metric into row-per-metric",
      "Normalize wide measurement tables",
      "Stack multiple metric columns into rows",
    ],
    sqlHint: "Uses UNPIVOT operator or UNION ALL pattern",
  },
  note_collection: {
    value: "note_collection",
    label: "Note Collection",
    icon: "📝",
    description: "Gather clinical notes or attributes filtered by type",
    category: "Basic Analysis",
    examples: [
      "Get all pain scores for a patient",
      "Collect wound classification notes",
      "Fetch specific attribute types",
    ],
    sqlHint:
      "Joins rpt.Note with rpt.AttributeType WHERE variableName IN (...)",
  },
  join_analysis: {
    value: "join_analysis",
    label: "Join Analysis",
    icon: "🔗",
    description: "Combine data from multiple related tables with joins",
    category: "Basic Analysis",
    examples: [
      "Patients with their assessment history",
      "Wounds with measurement details",
      "Combine patient demographics with wound outcomes",
    ],
    sqlHint:
      "Multiple JOINs across tables (rpt.Patient, rpt.Wound, rpt.Assessment)",
  },
};

/**
 * Get intent metadata by value, with fallback for unknown intents
 */
export function getIntentMetadata(intentValue: string): IntentMetadata | null {
  return INTENT_METADATA[intentValue] || null;
}

/**
 * Get all intent values (for iteration)
 */
export function getAllIntentValues(): string[] {
  return Object.keys(INTENT_METADATA);
}

/**
 * Group intents by category
 */
export function getIntentsByCategory(): Record<string, IntentMetadata[]> {
  return Object.values(INTENT_METADATA).reduce((acc, metadata) => {
    const category = metadata.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(metadata);
    return acc;
  }, {} as Record<string, IntentMetadata[]>);
}

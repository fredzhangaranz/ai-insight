# Template Duplicate Check API

## Endpoint

`POST /api/ai/templates/check-duplicates`

## Purpose

Checks if a draft template is similar to existing templates in the catalog to prevent duplicate template creation.

## Feature Flag

This endpoint is gated by the `AI_TEMPLATES_ENABLED` feature flag. Returns 404 when disabled.

## Request

### Required Fields

- `name` (string): Template name
- `intent` (string): Query pattern intent (e.g., "aggregation_by_category")

### Optional Fields

- `description` (string): Template description
- `keywords` (string[]): Keywords for matching
- `tags` (string[]): Template tags

### Example Request

```json
{
  "name": "Patient Count by Wound Type",
  "intent": "aggregation_by_category",
  "description": "Count patients grouped by wound type",
  "keywords": ["patient", "count", "wound", "type"],
  "tags": ["analysis", "dashboard"]
}
```

## Response

### Success (200)

Returns an array of similar templates with similarity scores and metadata:

```json
{
  "similar": [
    {
      "templateId": 42,
      "name": "Patient Count by Wound Category",
      "intent": "aggregation_by_category",
      "similarity": 0.85,
      "successRate": 0.75,
      "usageCount": 20,
      "message": "Template 'Patient Count by Wound Category' is 85% similar (75% success rate) with 20 uses. Consider reviewing before creating a duplicate."
    }
  ]
}
```

### Empty Result (200)

When no similar templates are found:

```json
{
  "similar": []
}
```

### Error Responses

- `400`: Missing or invalid required fields
- `404`: Feature flag disabled
- `500`: Internal server error

## Similarity Algorithm

- Uses Jaccard similarity coefficient on tokenized metadata (name + description + keywords + tags)
- Only compares templates within the same intent
- Excludes deprecated templates
- Threshold: 70% similarity (configurable via `SIMILARITY_THRESHOLD` in `template-similarity.service.ts`)
- Results sorted by similarity descending, then success rate descending

## Usage Example (TypeScript)

```typescript
async function checkForDuplicates(draft: {
  name: string;
  intent: string;
  description?: string;
  keywords?: string[];
  tags?: string[];
}) {
  const response = await fetch("/api/ai/templates/check-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    throw new Error("Failed to check for duplicates");
  }

  const { similar } = await response.json();
  return similar;
}

// Usage
const duplicates = await checkForDuplicates({
  name: "Patient Count by Wound Type",
  intent: "aggregation_by_category",
  description: "Count patients grouped by wound type",
  keywords: ["patient", "count", "wound", "type"],
});

if (duplicates.length > 0) {
  console.warn(`Found ${duplicates.length} similar templates:`);
  duplicates.forEach((dup) => {
    console.log(`- ${dup.name} (${Math.round(dup.similarity * 100)}% similar)`);
  });
}
```

## Integration Points

This endpoint is intended to be called:

1. **Before saving a new template** - in the Template Review Modal after AI extraction
2. **During manual template creation** - in the template editor before submission
3. **In template governance workflows** - to identify consolidation opportunities

## Testing

See `route.test.ts` for comprehensive API contract tests covering:

- Feature flag gating
- Input validation (required/optional fields)
- Empty and populated result sets
- Error handling
- Edge cases (empty arrays, whitespace, non-string values)

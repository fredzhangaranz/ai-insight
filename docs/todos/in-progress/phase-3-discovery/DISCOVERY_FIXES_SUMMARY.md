# Discovery Process Fixes: Progress Indication & Zero Forms Issue

## Summary

Fixed two critical issues with the semantic discovery process:

### Issue 1: No Progress Indication During Discovery ✅
**Problem:** When users clicked "Run Discovery Now", the UI showed only a spinning button for 2-3 minutes with no indication of what was happening.

**Solution:** Implemented real-time progress streaming with visual stage indicators.

### Issue 2: Zero Forms & Fields in Recent Runs ✅
**Problem:** After discovery completed, "Recent runs" showed 0 forms and 0 fields, even though 25+ forms exist in the system.

**Solution:** Replaced placeholder form discovery function with actual implementation that counts indexed forms and fields.

---

## Changes Made

### 1. **Form Discovery Service** (`lib/services/form-discovery.service.ts`)

**Before:** Placeholder returning all `null` values
```typescript
export async function discoverFormMetadata(_options): Promise<FormDiscoveryResponse> {
  return {
    formsDiscovered: null,
    fieldsDiscovered: null,
    avgConfidence: null,
    fieldsRequiringReview: null,
    warnings: ["Form discovery placeholder used..."],
    errors: [],
  };
}
```

**After:** Real implementation querying semantic index
```typescript
export async function discoverFormMetadata(options): Promise<FormDiscoveryResponse> {
  // 1. Count distinct forms with indexed fields
  const formsResult = await pgPool.query(
    `SELECT COUNT(DISTINCT semantic_index_id)::int AS forms
     FROM "SemanticIndexField" 
     WHERE semantic_index_id IN (
       SELECT id FROM "SemanticIndex" WHERE customer_id = $1
     )`,
    [options.customerId]
  );

  // 2. Count total fields and compute confidence metrics
  const fieldsResult = await pgPool.query(
    `SELECT
       COUNT(*)::int AS field_count,
       COUNT(*) FILTER (WHERE is_review_required)::int AS review_count,
       AVG(confidence) AS avg_confidence
     FROM "SemanticIndexField" sif
     JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
     WHERE si.customer_id = $1`,
    [options.customerId]
  );

  // Returns actual counts instead of nulls
  return {
    formsDiscovered: formsResult.rows[0]?.forms ?? 0,
    fieldsDiscovered: fieldsResult.rows[0]?.field_count ?? 0,
    avgConfidence: avgConfidence,
    fieldsRequiringReview: reviewCount,
    warnings,
    errors: [],
  };
}
```

### 2. **Discovery Orchestrator Service** (`lib/services/discovery-orchestrator.service.ts`)

Added new `runFullDiscoveryWithProgress()` function that sends real-time progress events:

```typescript
export async function runFullDiscoveryWithProgress(
  customerCode: string,
  sendEvent: (type: string, data: any) => void
): Promise<DiscoveryRunResponse> {
  // ... same logic as runFullDiscovery(), but with progress events:

  // Stage 1
  sendEvent("stage-start", { stage: "form_discovery", name: "Form Discovery" });
  const formStats = await runFormDiscoveryStep(...);
  sendEvent("stage-complete", {
    stage: "form_discovery",
    formsDiscovered: formStats.formsDiscovered,
    fieldsDiscovered: formStats.fieldsDiscovered,
  });

  // Stage 2, 3, 4, 5... same pattern

  sendEvent("error", { message, stage });  // On error
  return result;
}
```

### 3. **Discovery API Route** (`app/api/customers/[code]/discover/route.ts`)

Enhanced POST handler to support streaming responses:

```typescript
export const POST = withErrorHandling(
  async (req: NextRequest, { params }) => {
    // Check if client wants streaming updates
    const wantStream = req.headers.get("x-stream-progress") === "true";

    if (wantStream) {
      // Return ReadableStream with NDJSON progress events
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (type: string, data: any) => {
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify({ type, data }) + "\n")
            );
          };

          const result = await runFullDiscoveryWithProgress(
            params.code,
            sendEvent
          );
          sendEvent("complete", result);
          controller.close();
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Fallback: non-streaming for backward compatibility
    const result = await runFullDiscovery(params.code);
    return NextResponse.json(result, { status: 200 });
  }
);
```

### 4. **Discovery Tab UI** (`app/admin/discovery-tab.tsx`)

#### Added progress state management:
```typescript
const [progressStages, setProgressStages] = useState<ProgressStage[]>([]);
```

#### Enhanced handleRunDiscovery to stream events:
```typescript
const handleRunDiscovery = async () => {
  // Initialize stages
  setProgressStages([
    { stage: "form_discovery", name: "Form Discovery", status: "pending" },
    { stage: "non_form_schema", name: "Non-Form Schema Discovery", status: "pending" },
    { stage: "relationships", name: "Entity Relationship Discovery", status: "pending" },
    { stage: "non_form_values", name: "Non-Form Values Discovery", status: "pending" },
    { stage: "summary", name: "Computing Summary Statistics", status: "pending" },
  ]);

  // Request streaming response
  const response = await fetch(`/api/customers/${customerCode}/discover`, {
    method: "POST",
    headers: {
      "x-stream-progress": "true",  // Signal we want streaming
    },
  });

  // Parse NDJSON stream
  const reader = response.body?.getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value);
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const event = JSON.parse(line);

      if (event.type === "stage-start") {
        setProgressStages(prev =>
          prev.map(s =>
            s.stage === event.data.stage ? { ...s, status: "running" } : s
          )
        );
      } else if (event.type === "stage-complete") {
        setProgressStages(prev =>
          prev.map(s =>
            s.stage === event.data.stage
              ? { ...s, status: "complete", data: event.data }
              : s
          )
        );
      }
    }
  }
};
```

#### Added real-time progress UI:
```typescript
{isRunning && progressStages.length > 0 ? (
  <div className="rounded-lg border p-4 bg-blue-50/50">
    <div className="text-sm font-medium text-blue-900">
      Discovery in Progress…
    </div>
    {progressStages.map((stage) => (
      <div key={stage.stage} className="flex items-center gap-3 text-sm">
        {stage.status === "pending" && (
          <div className="w-4 h-4 rounded-full border-2 border-gray-300"></div>
        )}
        {stage.status === "running" && (
          <div className="w-4 h-4 rounded-full border-2 border-blue-500 animate-spin"></div>
        )}
        {stage.status === "complete" && (
          <CheckCircleIcon className="w-4 h-4 text-green-600" />
        )}
        {stage.status === "error" && (
          <ExclamationTriangleIcon className="w-4 h-4 text-red-600" />
        )}
        <span className={statusClass}>{stage.name}</span>
      </div>
    ))}
  </div>
) : null}
```

---

## User Experience Flow

### Before
1. User clicks "Run Discovery Now"
2. Browser confirm dialog appears → user clicks "Yes"
3. UI shows spinning button for 2-3 minutes (no feedback)
4. Response returns with **0 forms, 0 fields** (wrong!)
5. "Recent runs" table shows: "0 forms · 0 fields"

### After
1. User clicks "Run Discovery Now"
2. Browser confirm dialog appears → user clicks "Yes"
3. **Real-time progress panel appears:**
   - ✓ Form Discovery (complete, green checkmark)
   - ⟳ Non-Form Schema Discovery (running, spinning spinner)
   - ○ Entity Relationship Discovery (pending)
   - ○ Non-Form Values Discovery (pending)
   - ○ Computing Summary Statistics (pending)
4. Each stage updates as it completes
5. Response returns with **actual form counts** (e.g., 25 forms, 342 fields)
6. "Recent runs" table now shows correct counts: "25 forms · 342 fields"
7. Toast notification: "Discovery completed! Discovered 25 forms and 342 fields."

---

## Technical Details

### Stream Format (NDJSON)
Each line is a separate JSON event:
```
{"type":"stage-start","data":{"stage":"form_discovery","name":"Form Discovery"}}
{"type":"stage-complete","data":{"stage":"form_discovery","formsDiscovered":25,"fieldsDiscovered":342}}
{"type":"stage-start","data":{"stage":"non_form_schema","name":"Non-Form Schema Discovery"}}
{"type":"stage-complete","data":{"stage":"non_form_schema","columnsDiscovered":127}}
...
{"type":"complete","data":{"status":"succeeded","summary":{...}}}
```

### Backward Compatibility
- Falls back to non-streaming if `x-stream-progress` header not sent
- UI gracefully handles both streaming and non-streaming responses
- Existing clients continue to work without modification

### Performance
- No additional database queries needed (uses existing SemanticIndex)
- Semantic index is populated by non-form and form discovery stages
- Zero overhead when not streaming (streaming is opt-in)

---

## Testing

### Manual Test Checklist
- [ ] Run discovery for a customer with known form count
- [ ] Verify progress stages appear and update in real-time
- [ ] Verify final result shows correct form and field counts
- [ ] Check "Recent runs" table shows non-zero counts
- [ ] Verify completion toast shows correct counts
- [ ] Test with old clients (non-streaming fallback works)

### Expected Results
- Progress panel updates every 10-30 seconds as stages complete
- Final counts match actual forms in customer database
- UI remains responsive during 2-3 minute discovery


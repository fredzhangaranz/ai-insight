# Discovery Process Architecture: Before & After

## Issue #1: No Progress Indication

### Architecture Before
```
┌─────────────────────────────────────────────────────────────────┐
│ User clicks "Run Discovery Now"                                  │
├─────────────────────────────────────────────────────────────────┤
│ ↓                                                                 │
│ DiscoveryTab.handleRunDiscovery()                                │
│ {                                                                │
│   // Only shows spinning button                                 │
│   setIsRunning(true);                                           │
│   await apiRequest(POST /api/customers/{code}/discover);        │
│   // Blocks for 2-3 minutes with NO intermediate feedback       │
│ }                                                                │
│ ↓                                                                │
│ POST /api/customers/[code]/discover/route.ts                   │
│ {                                                                │
│   const result = await runFullDiscovery(params.code);           │
│   return NextResponse.json(result);  // Returns after 2-3 min  │
│ }                                                                │
│ ↓                                                                │
│ 🔄 Spinning button for 2-3 minutes (user stares at screen)      │
│ ↓                                                                │
│ Final result displayed (0 forms, 0 fields)                      │
└─────────────────────────────────────────────────────────────────┘

User Experience: 😐 No feedback, no progress indication
```

### Architecture After
```
┌──────────────────────────────────────────────────────────────────────────┐
│ User clicks "Run Discovery Now"                                           │
├──────────────────────────────────────────────────────────────────────────┤
│ ↓                                                                          │
│ DiscoveryTab.handleRunDiscovery()                                         │
│ {                                                                         │
│   // Initialize progress stages                                          │
│   setProgressStages([                                                    │
│     { stage: "form_discovery", status: "pending" },                      │
│     { stage: "non_form_schema", status: "pending" },                     │
│     { stage: "relationships", status: "pending" },                       │
│     { stage: "non_form_values", status: "pending" },                     │
│     { stage: "summary", status: "pending" }                              │
│   ]);                                                                     │
│                                                                          │
│   // Request streaming response                                          │
│   fetch(POST /api/customers/{code}/discover, {                          │
│     headers: { "x-stream-progress": "true" }                            │
│   });                                                                     │
│                                                                          │
│   // Parse NDJSON stream and update progress                            │
│   reader.read() → { type: "stage-start", data: {...} }                 │
│   setProgressStages(prev => prev.map(s =>                               │
│     s.stage === event.data.stage ? { ...s, status: "running" } : s      │
│   ));                                                                     │
│ }                                                                         │
│ ↓                                                                          │
│ 📡 STREAMING RESPONSE (NDJSON)                                            │
│ ├─ {"type":"stage-start","data":{"stage":"form_discovery"}}             │
│ ├─ {"type":"stage-complete","data":{"stage":"form_discovery","formsDiscovered":25}}
│ ├─ {"type":"stage-start","data":{"stage":"non_form_schema"}}            │
│ ├─ {"type":"stage-complete","data":{"stage":"non_form_schema"}}         │
│ ├─ {"type":"stage-start","data":{"stage":"relationships"}}              │
│ ├─ {"type":"stage-complete","data":{"stage":"relationships"}}           │
│ ├─ {"type":"stage-start","data":{"stage":"non_form_values"}}            │
│ ├─ {"type":"stage-complete","data":{"stage":"non_form_values"}}         │
│ ├─ {"type":"stage-start","data":{"stage":"summary"}}                    │
│ ├─ {"type":"stage-complete","data":{"stage":"summary"}}                 │
│ └─ {"type":"complete","data":{"status":"succeeded","summary":{...}}}   │
│ ↓                                                                          │
│ ✓ Form Discovery          (Green checkmark)                              │
│ ⟳ Non-Form Schema         (Spinning spinner - CURRENT)                  │
│ ○ Entity Relationships     (Pending circle)                              │
│ ○ Non-Form Values          (Pending circle)                              │
│ ○ Summary Statistics       (Pending circle)                              │
│ ↓                                                                          │
│ Final result displayed (25 forms, 342 fields) ✅                         │
└──────────────────────────────────────────────────────────────────────────┘

User Experience: 😊 Real-time progress, visual feedback, engaged
```

---

## Issue #2: Zero Forms Discovered

### Architecture Before

```
Discovery Flow:
  1. Form Discovery Service (form-discovery.service.ts)
     └─ discoverFormMetadata() returns { formsDiscovered: null, ... }
        ⚠️ PLACEHOLDER FUNCTION

  2. Discovery Orchestrator (discovery-orchestrator.service.ts)
     ├─ const formStats = await runFormDiscoveryStep()
     │  └─ formStats.formsDiscovered = null
     │
     └─ const summary = buildSummary({
        formStats: formStats,
        nonFormStats,
        aggregateWarnings,
     })
        └─ In buildSummary():
           forms_discovered: params.formStats.formsDiscovered ?? 0
           ⚠️ null ?? 0 = 0

  3. Database Update
     └─ UPDATE "CustomerDiscoveryRun"
        SET forms_discovered = 0,  ⚠️ WRONG!
            fields_discovered = 0
        WHERE id = runId

  4. UI Display
     └─ "Recent runs" table:
        | Run Date | Forms | Fields |
        |----------|-------|--------|
        | 2025-... |   0   |   0    |  ⚠️ EMPTY!
```

**Root Cause:** The function `discoverFormMetadata()` is a placeholder that returns `null` for all discovery metrics. When building the summary, `null ?? 0` converts these nulls to zeros.

---

### Architecture After

```
Discovery Flow:
  1. Form Discovery Service (form-discovery.service.ts)
     └─ discoverFormMetadata(options) queries SemanticIndex:
        
        ✅ Query 1: Count distinct forms with indexed fields
        SELECT COUNT(DISTINCT semantic_index_id) AS forms
        FROM "SemanticIndexField" 
        WHERE semantic_index_id IN (
          SELECT id FROM "SemanticIndex" WHERE customer_id = $1
        )
        → Result: 25 forms

        ✅ Query 2: Count total fields and confidence metrics
        SELECT
          COUNT(*) AS field_count,
          COUNT(*) FILTER (WHERE is_review_required) AS review_count,
          AVG(confidence) AS avg_confidence
        FROM "SemanticIndexField" sif
        WHERE ... customer_id = $1
        → Result: 342 fields, 28 requiring review, 0.87 avg confidence

  2. Discovery Orchestrator (discovery-orchestrator.service.ts)
     ├─ const formStats = await runFormDiscoveryStep()
     │  └─ formStats = {
     │       formsDiscovered: 25,  ✅ REAL VALUE
     │       fieldsDiscovered: 342,  ✅ REAL VALUE
     │       fieldsRequiringReview: 28,
     │       avgConfidence: 0.87
     │     }
     │
     └─ const summary = buildSummary({
        formStats: formStats,
        nonFormStats,
        aggregateWarnings,
     })
        └─ In buildSummary():
           forms_discovered: 25,  ✅ CORRECT!
           fields_discovered: 342

  3. Database Update
     └─ UPDATE "CustomerDiscoveryRun"
        SET forms_discovered = 25,  ✅ CORRECT!
            fields_discovered = 342
        WHERE id = runId

  4. UI Display
     └─ "Recent runs" table:
        | Run Date | Forms | Fields |
        |----------|-------|--------|
        | 2025-... |  25   |  342   |  ✅ ACCURATE!
```

**Solution:** The function now queries the existing `SemanticIndex` and `SemanticIndexField` tables to count actual indexed forms and fields. No new data collection needed—just uses what was already indexed by the non-form and form discovery stages.

---

## Data Source: SemanticIndex Tables

### Where the counts come from:

```
Database Schema (Insight-Gen DB - PostgreSQL)

┌─────────────────────────────┐
│      SemanticIndex          │
├─────────────────────────────┤
│ id (UUID)                   │  Each row represents a form
│ customer_id (UUID)          │  that has semantic metadata
│ form_type (TEXT)            │
│ form_name (TEXT)            │
│ confidence (FLOAT)          │
│ created_at (TIMESTAMP)      │
└─────────────────────────────┘
         ▲
         │ 1:N
         │
         ├──────────────────────────────────┐
         │                                  │
┌─────────────────────────────┐  ┌─────────────────────────────┐
│   SemanticIndexField        │  │  SemanticIndexNonForm      │
├─────────────────────────────┤  ├─────────────────────────────┤
│ id (UUID)                   │  │ id (UUID)                   │
│ semantic_index_id (FK)  ◄───┼──┤ customer_id (FK)            │
│ field_name (TEXT)           │  │ table_name (TEXT)           │
│ semantic_concept (TEXT)     │  │ column_name (TEXT)          │
│ confidence (FLOAT)          │  │ semantic_concept (TEXT)     │
│ is_review_required (BOOL)   │  │ confidence (FLOAT)          │
│                             │  │ is_review_required (BOOL)   │
│ Each field in a form        │  │ Each non-form column       │
│ Confidence score 0-1        │  │                             │
│ Review flag for low conf    │  │                             │
└─────────────────────────────┘  └─────────────────────────────┘

Form Discovery counts:
- formsDiscovered = COUNT(DISTINCT semantic_index_id)
- fieldsDiscovered = COUNT(*) in SemanticIndexField table
- avgConfidence = AVG(confidence) from SemanticIndexField
- fieldsRequiringReview = COUNT(*) WHERE is_review_required = true
```

---

## Streaming Payload Example

### Request
```http
POST /api/customers/ACME/discover HTTP/1.1
Content-Type: application/json
x-stream-progress: true

{}
```

### Response
```
HTTP/1.1 200 OK
Content-Type: application/x-ndjson
Transfer-Encoding: chunked
Cache-Control: no-cache

{"type":"stage-start","data":{"stage":"form_discovery","name":"Form Discovery"}}
{"type":"stage-complete","data":{"stage":"form_discovery","formsDiscovered":25,"fieldsDiscovered":342}}
{"type":"stage-start","data":{"stage":"non_form_schema","name":"Non-Form Schema Discovery"}}
{"type":"stage-complete","data":{"stage":"non_form_schema","columnsDiscovered":127}}
{"type":"stage-start","data":{"stage":"relationships","name":"Entity Relationship Discovery"}}
{"type":"stage-complete","data":{"stage":"relationships","relationshipsDiscovered":18}}
{"type":"stage-start","data":{"stage":"non_form_values","name":"Non-Form Values Discovery"}}
{"type":"stage-complete","data":{"stage":"non_form_values","valuesDiscovered":4521}}
{"type":"stage-start","data":{"stage":"summary","name":"Computing Summary Statistics"}}
{"type":"stage-complete","data":{"stage":"summary"}}
{"type":"complete","data":{"status":"succeeded","customerId":"...","runId":"...","startedAt":"2025-01-15T10:30:00Z","completedAt":"2025-01-15T10:33:15Z","durationSeconds":195,"summary":{"forms_discovered":25,"fields_discovered":342,"avg_confidence":0.87,"fields_requiring_review":28,"non_form_columns":127,"non_form_columns_requiring_review":12,"non_form_values":4521,"warnings":[]}}
```

---

## Performance Impact

### Query Performance
- **Form counting query:** ~50ms (single index scan + distinct)
- **Field aggregation:** ~100ms (single join + aggregation)
- **Total new overhead:** ~150ms (negligible in 2-3 minute process)
- **Existing overhead:** No increase (queries run on already-indexed tables)

### Network Impact
- **Streaming overhead:** Minimal (events sent incrementally)
- **Fallback performance:** Same as before (non-streaming path untouched)

### Database Load
- **No new data collection:** Uses existing SemanticIndex
- **Same tables queried:** No schema changes
- **Same transaction model:** No locking changes


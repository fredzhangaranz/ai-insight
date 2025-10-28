# Discovery Execution: No Hangfire Required

**Decision:** Keep it simple - no Hangfire dependency needed

---

## Why NOT Hangfire?

| Reason | Impact |
|--------|--------|
| Discovery is rare (maybe 1x per customer per month) | No need for persistent job queue |
| 2-3 minute processing is acceptable for admin operation | User can wait |
| If server restarts during discovery, user can re-run | Not a blocker |
| Adds complexity & another dependency | Overkill for simple use case |
| Migration/setup overhead | Not worth it |

---

## Two Options

### Option A: SYNCHRONOUS (Recommended MVP)

**How it works:**
```
Admin clicks "Run Discovery Now" → Dialog: "This takes 2-3 minutes. Continue?"
                     ↓
User clicks "Start"
                     ↓
Request: POST /api/customers/{code}/discover (no response until done)
                     ↓
Backend: Runs all 4 parts sequentially (synchronous)
  • Part 1: Form discovery (30s)
  • Part 2: Non-form schema (45s)
  • Part 3: Relationships (20s)
  • Part 4: Values (60s)
                     ↓
Response (after 2-3 minutes):
{
  "status": "succeeded",
  "forms_discovered": 14,
  "fields_discovered": 327,
  "avg_confidence": 0.87,
  "duration_seconds": 195
}
                     ↓
UI: "✅ Discovery Complete!" + Stats
```

**Pros:**
- ✅ Simplest possible implementation
- ✅ No dependencies
- ✅ No job queue to manage
- ✅ No persistence needed
- ✅ User gets immediate feedback (success/failure)

**Cons:**
- ⚠️ User waits 2-3 minutes (but that's okay - they asked for this)
- ⚠️ If connection drops, discovery stops (user can retry)

---

### Option B: Async WITHOUT Hangfire

**How it works:**
```
Admin clicks "Run Discovery Now"
                     ↓
Backend:
1. Create discovery_run record (status: 'running')
2. Start async operation in background (NOT Hangfire)
3. Return immediately: { discovery_run_id, status: 'running' }
                     ↓
UI polls: GET /api/customers/{code}/discover/{run_id}
                     ↓
Backend processes in background thread/worker:
  [Discovery runs in background]
                     ↓
When done, update discovery_run record (status: 'succeeded', add stats)
                     ↓
UI detects completion, shows results
```

**Implementation:**
```typescript
// lib/services/discovery-orchestrator.service.ts

async function startDiscovery(customerId: string) {
  // Create record upfront
  const runId = await db.insert('CustomerDiscoveryRun', {
    customer_id: customerId,
    status: 'running',
    started_at: NOW(),
  });

  // Start background operation (NO Hangfire)
  // Use Node.js built-in async handling
  runDiscoveryInBackground(runId, customerId);

  // Return immediately
  return { discovery_run_id: runId, status: 'running' };
}

// Runs in background (no await, no blocking)
function runDiscoveryInBackground(runId: string, customerId: string) {
  // Use Promise.resolve().then() to execute async without waiting
  Promise.resolve().then(async () => {
    try {
      // Part 1: Form Discovery
      const formStats = await FormDiscoveryService.discover(customerId);
      
      // Part 2: Non-Form Schema
      const nonformStats = await NonFormDiscoveryService.discover(customerId);
      
      // Part 3: Relationships
      const relationshipStats = await RelationshipDiscoveryService.discover(customerId);
      
      // Part 4: Values
      const valueStats = await ValueDiscoveryService.discover(customerId);

      // Update record with success
      await db.update('CustomerDiscoveryRun', runId, {
        status: 'succeeded',
        completed_at: NOW(),
        forms_discovered: formStats.count,
        // ... other stats
      });
    } catch (error) {
      // Update record with failure
      await db.update('CustomerDiscoveryRun', runId, {
        status: 'failed',
        completed_at: NOW(),
        error_message: error.message,
      });
    }
  });
}

// UI polls this endpoint
async function getDiscoveryStatus(runId: string) {
  return await db.query(
    'SELECT * FROM CustomerDiscoveryRun WHERE id = $1',
    [runId]
  );
}
```

**Pros:**
- ✅ No Hangfire dependency
- ✅ User gets immediate response
- ✅ UI polls for updates
- ✅ Simple to implement

**Cons:**
- ⚠️ If server restarts during discovery, job is lost (user re-runs)
- ⚠️ Need polling logic in UI (5-10 second intervals)
- ⚠️ Slightly more complex than synchronous

---

## My Recommendation: Option A (Synchronous)

**Why:**
1. Simplest possible implementation
2. No polling logic needed
3. User gets immediate success/failure feedback
4. 2-3 minute wait is fine for an admin operation
5. Zero dependencies
6. Zero risk of job loss

**UX:**
```
Admin: "Run Discovery Now"
  ↓
Dialog: "Discovery takes 2-3 minutes. Continue?"
  ↓
Admin: "Start"
  ↓
[Page shows: "Running... Please wait."]
  ↓
[After 2-3 minutes]
  ↓
Page: "✅ Discovery Complete! 14 forms, 327 fields, 0.87 confidence"
```

**API:**
```http
POST /api/customers/{code}/discover

Request body: {}

Response (after 2-3 minutes):
{
  "status": "succeeded",
  "started_at": "2025-10-23T10:15:00Z",
  "completed_at": "2025-10-23T10:18:30Z",
  "duration_seconds": 210,
  "summary": {
    "forms_discovered": 14,
    "fields_discovered": 327,
    "avg_confidence": 0.87,
    "fields_requiring_review": 3,
    "warnings": []
  }
}
```

---

## Implementation (Synchronous - No Hangfire)

```typescript
// lib/services/discovery-orchestrator.service.ts

async function runFullDiscovery(customerId: string) {
  // Get customer + connection
  const customer = await db.query(
    'SELECT * FROM Customer WHERE id = $1',
    [customerId]
  );

  try {
    // Part 1: Form Discovery (30s)
    const formStats = await FormDiscoveryService.discover(customerId);
    
    // Part 2: Non-Form Schema (45s)
    const nonformStats = await NonFormDiscoveryService.discover(customerId);
    
    // Part 3: Relationships (20s)
    const relationshipStats = await RelationshipDiscoveryService.discover(customerId);
    
    // Part 4: Values (60s)
    const valueStats = await ValueDiscoveryService.discover(customerId);

    // Calculate overall stats
    const avgConfidence = await calculateAverageConfidence(customerId);
    const warnings = collectWarnings([
      formStats.warnings,
      nonformStats.warnings,
      relationshipStats.warnings,
      valueStats.warnings,
    ]);

    return {
      status: 'succeeded',
      summary: {
        forms_discovered: formStats.count,
        fields_discovered: formStats.fields,
        avg_confidence: avgConfidence,
        fields_requiring_review: warnings.filter(w => w.type === 'low_confidence').length,
        warnings: warnings,
      },
    };

  } catch (error) {
    return {
      status: 'failed',
      error: error.message,
    };
  }
}
```

**API Endpoint:**
```typescript
// app/api/customers/[code]/discover/route.ts

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  const customerId = await getCustomerIdFromCode(params.code);

  try {
    // This blocks for 2-3 minutes - that's okay
    const result = await DiscoveryOrchestrator.runFullDiscovery(customerId);

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { status: 'failed', error: error.message },
      { status: 500 }
    );
  }
}
```

**Admin UI:**
```tsx
// components/admin/CustomerDiscoveryTab.tsx

export function DiscoveryTab({ customerId }) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);

  async function handleRunDiscovery() {
    if (!window.confirm('Discovery takes ~2-3 minutes. Continue?')) return;

    setIsRunning(true);
    try {
      const response = await fetch(`/api/customers/${code}/discover`, {
        method: 'POST',
      });
      
      const data = await response.json();
      setResult(data);
      
      // Show success/failure
      if (data.status === 'succeeded') {
        toast.success('✅ Discovery completed!');
      } else {
        toast.error(`❌ Discovery failed: ${data.error}`);
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div>
      <button 
        onClick={handleRunDiscovery}
        disabled={isRunning}
      >
        {isRunning ? 'Running...' : 'Run Discovery Now'}
      </button>

      {result && (
        <div>
          <h3>{result.status === 'succeeded' ? '✅ Success' : '❌ Failed'}</h3>
          {result.summary && (
            <div>
              <p>Forms: {result.summary.forms_discovered}</p>
              <p>Fields: {result.summary.fields_discovered}</p>
              <p>Avg Confidence: {result.summary.avg_confidence}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Task 10 (Simplified Further)

**What to build:**
1. `DiscoveryOrchestrator.runFullDiscovery()` - single function, synchronous
2. `POST /api/customers/{code}/discover` - single endpoint
3. Admin UI: button + result display

**That's it!** No job queue, no polling, no Hangfire.

---

## Comparison: With vs Without Hangfire

| Aspect | With Hangfire | Without (Sync) |
|--------|---------------|----------------|
| **Implementation** | Complex | Simple |
| **Dependencies** | +1 (Hangfire) | 0 |
| **User waits?** | No (async) | Yes (2-3 min) |
| **Job persistence** | Yes | No |
| **If server restarts** | Job survives | Job lost (user re-runs) |
| **Suitable for** | Production jobs | Rare admin operations |

---

## My Strong Recommendation

**Use synchronous (Option A):**

✅ Simpler  
✅ Zero dependencies  
✅ Acceptable wait time (it's an admin operation)  
✅ No job queue to manage  
✅ Immediate feedback  
✅ Can always add Hangfire later if discovery becomes frequent  

This is pragmatic and gets you there faster. 🚀


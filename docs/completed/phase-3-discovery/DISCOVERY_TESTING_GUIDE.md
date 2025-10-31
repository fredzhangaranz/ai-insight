# Discovery Process Testing Guide

## Quick Start: Manual Testing

### Test Scenario 1: Run Discovery & Verify Progress Indication

**Steps:**
1. Navigate to `/admin/customers`
2. Find a customer with known data
3. Click the customer name to open details
4. Scroll to "Discovery" section
5. Click "Run Discovery Now" button
6. Confirm in the dialog

**Expected Behavior:**
```
✅ Progress panel appears with 5 stages:
   ○ Form Discovery (pending)
   ○ Non-Form Schema Discovery (pending)
   ○ Entity Relationship Discovery (pending)
   ○ Non-Form Values Discovery (pending)
   ○ Computing Summary Statistics (pending)

✅ Each stage transitions as it completes:
   Stage 1 (0-30s):
   ✓ Form Discovery (complete)
   ⟳ Non-Form Schema Discovery (running)
   ○ Entity Relationship Discovery (pending)
   ...

   Stage 2 (30-75s):
   ✓ Form Discovery (complete)
   ✓ Non-Form Schema Discovery (complete)
   ⟳ Entity Relationship Discovery (running)
   ...

   Final (2-3 min):
   ✓ Form Discovery (complete)
   ✓ Non-Form Schema Discovery (complete)
   ✓ Entity Relationship Discovery (complete)
   ✓ Non-Form Values Discovery (complete)
   ✓ Computing Summary Statistics (complete)

✅ Toast notification shows actual counts:
   "Discovery completed! Discovered 25 forms and 342 fields."

✅ Latest Result card shows summary:
   - Forms: 25
   - Non-form Coverage: 127 columns
   - Average Confidence: 0.87
   - Warnings: (if any)
```

**Success Criteria:**
- [ ] Progress stages appear and update in real-time
- [ ] At least 3-4 updates during the 2-3 minute process
- [ ] No errors in browser console
- [ ] Toast notification shows non-zero form count
- [ ] Latest Result displays properly

**Failure Signs:**
- ❌ Progress panel doesn't appear
- ❌ Spinning button only, no stages shown
- ❌ Toast shows "0 forms 0 fields"
- ❌ Console errors about streaming

---

### Test Scenario 2: Verify Form Count Accuracy

**Steps:**
1. Complete Test Scenario 1 successfully
2. Check the "Recent Runs" table below
3. Find the latest run

**Expected Behavior:**
```
Recent Runs table shows:
| Started | Status | Forms | Fields | Warnings |
|---------|--------|-------|--------|----------|
| 1/15... | Success| 25    | 342    | None     |
```

**Success Criteria:**
- [ ] Forms column shows non-zero count (should be 25)
- [ ] Fields column shows non-zero count (should be 342)
- [ ] Run status is "Succeeded" (green badge)
- [ ] Counts match the toast notification from Step 1

**Failure Signs:**
- ❌ Forms column shows "0"
- ❌ Fields column shows "0"
- ❌ Run status is "Failed"
- ❌ Counts don't match toast notification

---

### Test Scenario 3: Verify Database Updates

**Steps (For developers):**

1. Before running discovery, check database:
   ```sql
   SELECT id, forms_discovered, fields_discovered, status
   FROM "CustomerDiscoveryRun"
   WHERE customer_id = 'YOUR_CUSTOMER_ID'
   ORDER BY started_at DESC
   LIMIT 5;
   ```

2. Run discovery via UI (Test Scenario 1)

3. After completion, check database again:
   ```sql
   SELECT id, forms_discovered, fields_discovered, status, completed_at
   FROM "CustomerDiscoveryRun"
   WHERE customer_id = 'YOUR_CUSTOMER_ID'
   ORDER BY started_at DESC
   LIMIT 1;
   ```

**Expected Results:**
```
Before:
 id | forms_discovered | fields_discovered | status
----|------------------|-------------------|----------
 ... | NULL             | NULL              | running

After:
 id | forms_discovered | fields_discovered | status    | completed_at
----|------------------|-------------------|-----------|------------------
 ... | 25               | 342               | succeeded | 2025-01-15 10:33
```

**Success Criteria:**
- [ ] `forms_discovered` changes from NULL to actual count (25)
- [ ] `fields_discovered` changes from NULL to actual count (342)
- [ ] `status` changes from "running" to "succeeded"
- [ ] `completed_at` is populated with completion timestamp

**Failure Signs:**
- ❌ Values remain NULL or 0
- ❌ Status stays "running" or becomes "failed"
- ❌ No `completed_at` timestamp

---

### Test Scenario 4: Verify SemanticIndex Data Alignment

**Steps (For developers):**

After successful discovery, run these queries:

```sql
-- Count forms in semantic index
SELECT COUNT(DISTINCT semantic_index_id) as forms_in_index
FROM "SemanticIndexField"
WHERE semantic_index_id IN (
  SELECT id FROM "SemanticIndex" WHERE customer_id = 'YOUR_CUSTOMER_ID'
);
-- Expected: Same as forms_discovered in discovery run

-- Count fields in semantic index
SELECT COUNT(*) as fields_in_index
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = 'YOUR_CUSTOMER_ID';
-- Expected: Same as fields_discovered in discovery run

-- Average confidence
SELECT AVG(confidence) as avg_confidence
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = 'YOUR_CUSTOMER_ID';
-- Expected: Matches avg_confidence in discovery run
```

**Success Criteria:**
- [ ] forms_in_index = discovery run's forms_discovered
- [ ] fields_in_index = discovery run's fields_discovered
- [ ] avg_confidence matches (within 0.01 rounding)

**Failure Signs:**
- ❌ Counts don't match
- ❌ Queries return empty results
- ❌ Confidence values misaligned

---

### Test Scenario 5: Backward Compatibility (Non-Streaming Client)

**Steps (For developers):**

1. Make a POST request WITHOUT the `x-stream-progress` header:
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     -H "Cookie: your_auth_cookie" \
     "http://localhost:3000/api/customers/ACME/discover"
   ```

2. Or in JavaScript:
   ```typescript
   const response = await fetch(
     "/api/customers/ACME/discover",
     {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       credentials: "include"
     }
   );
   const result = await response.json();
   ```

**Expected Behavior:**
```
✅ Response is non-streaming JSON (not NDJSON)
✅ Response status: 200 (for succeeded) or 500 (for failed)
✅ Response body:
{
  "status": "succeeded",
  "customerId": "...",
  "runId": "...",
  "summary": {
    "forms_discovered": 25,
    "fields_discovered": 342,
    "avg_confidence": 0.87,
    ...
  }
}
```

**Success Criteria:**
- [ ] Response is valid JSON (not streaming)
- [ ] Response contains forms_discovered (non-zero)
- [ ] Response contains fields_discovered (non-zero)
- [ ] No `x-stream-progress` header required

**Failure Signs:**
- ❌ Response is NDJSON (contains newlines with JSON)
- ❌ Response status is not 200
- ❌ Summary contains zeros or nulls

---

## Network Debugging

### Check Streaming Response in Browser DevTools

1. Open DevTools (F12)
2. Go to Network tab
3. Click "Run Discovery Now"
4. Find the POST request to `/api/customers/*/discover`
5. Click on it and go to "Response" tab

**Expected (Streaming):**
```
{"type":"stage-start","data":{"stage":"form_discovery","name":"Form Discovery"}}
{"type":"stage-complete","data":{"stage":"form_discovery","formsDiscovered":25,"fieldsDiscovered":342}}
{"type":"stage-start","data":{"stage":"non_form_schema","name":"Non-Form Schema Discovery"}}
...
```

**Alternative (Non-Streaming):**
```json
{
  "status": "succeeded",
  "customerId": "...",
  "runId": "...",
  "summary": {...}
}
```

### Check Headers

**Request headers should include:**
```
x-stream-progress: true
Content-Type: application/json
```

**Response headers should include (for streaming):**
```
Content-Type: application/x-ndjson
Transfer-Encoding: chunked
Cache-Control: no-cache
```

---

## Troubleshooting

### Issue: Progress panel doesn't appear

**Possible causes:**
1. Streaming not supported by browser
2. Network error preventing streaming
3. API route not sending correct headers

**Debug steps:**
1. Check browser console for errors
2. Check Network tab for response headers
3. Verify `x-stream-progress: true` header is sent
4. Check API route handler for stream logic

**Fix:**
- UI should fallback to non-streaming automatically
- If not, check error handling in `handleRunDiscovery()`

### Issue: Forms count shows 0

**Possible causes:**
1. SemanticIndex is empty (forms not indexed yet)
2. Query error in form discovery service
3. Customer ID mismatch

**Debug steps:**
```sql
-- Check if SemanticIndex has any data
SELECT COUNT(*) FROM "SemanticIndex"
WHERE customer_id = 'YOUR_CUSTOMER_ID';

-- Check if SemanticIndexField has any data
SELECT COUNT(*) FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = 'YOUR_CUSTOMER_ID';
```

**Fix:**
- Run form/non-form discovery steps first to populate SemanticIndex
- Check customer ID is correct
- Check database connection is working

### Issue: Discovery times out (>5 minutes)

**Possible causes:**
1. Database is slow
2. Large dataset (100+ forms)
3. Network latency

**Debug steps:**
1. Check database performance
2. Check customer has reasonable data size
3. Monitor server resource usage

**Fix:**
- Optimize database queries
- Increase timeout if necessary
- Run discovery during off-peak hours for large customers

---

## Success Checklist

After completing all tests:

- [ ] Progress stages appear and update in real-time
- [ ] Toast notification shows non-zero form counts
- [ ] "Recent Runs" table shows correct counts
- [ ] Database records show actual (not null) values
- [ ] SemanticIndex data aligns with discovery results
- [ ] Non-streaming clients still work
- [ ] Browser DevTools shows correct headers/response
- [ ] No console errors
- [ ] Backward compatibility maintained


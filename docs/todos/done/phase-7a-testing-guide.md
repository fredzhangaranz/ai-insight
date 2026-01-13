# Phase 7A Testing Guide

**Status Change:** 2025-01-16 - Moved to `docs/todos/done/`
**Reason:** Phase 7A implementation complete. This testing guide served its purpose. Phase 7A has been completed as indicated in the phase-7-semantic_layer_ui_redesign_todos.md document.

**Date:** 2025-11-02  
**Status:** Ready for Testing (Phase 7A Complete)  
**Implementation:** Option A (Auto-save on ask)

---

## What Was Implemented

### 1. POST /api/insights/save
**File:** `app/api/insights/save/route.ts`

Saves semantic layer insights with:
- Question text and SQL
- Customer ID (multi-tenant support)
- Auto-generated name from question
- Semantic context for debugging
- Tags for categorization

### 2. Enhanced useInsights Hook
**File:** `lib/hooks/useInsights.ts`

Auto-saves questions after successful ask:
- Non-blocking (failures don't stop main flow)
- Tagged with "auto-saved" for identification
- Creates descriptive names from questions

### 3. Fixed Recent Questions API
**File:** `app/api/insights/recent/route.ts`

Now properly filters by:
- User ID (current session user)
- Customer ID (from query parameter)
- Returns up to 10 most recent questions

---

## Prerequisites

Before testing, ensure:

1. **Database migration 022 is applied:**
   ```bash
   npm run migrate
   ```
   This adds `customerId` and `semanticContext` columns to SavedInsights.

2. **Application is running:**
   ```bash
   npm run dev
   ```

3. **You have test customers:**
   - At least one active customer in the database
   - You're logged in as a user

---

## Test Scenarios

### Test 1: Basic Ask Flow ✅

**Goal:** Verify question can be asked and results display

**Steps:**
1. Navigate to `/insights/new`
2. Select a customer from dropdown
3. Type a question: "Show all patients"
4. Press "Ask →" or Ctrl+Enter
5. Wait for results

**Expected Results:**
- ✅ Loading spinner appears
- ✅ "Analyzing..." message shows
- ✅ Thinking stream displays with steps
- ✅ Results table appears with mock data
- ✅ No errors in browser console

**Browser Console Check:**
```
POST /api/insights/ask → 200 OK
POST /api/insights/save → 200 OK (or warning if fails)
```

---

### Test 2: Recent Questions Display ✅

**Goal:** Verify auto-saved questions appear in Recent Questions section

**Steps:**
1. After Test 1, scroll down on the same page
2. Look for "Recent Questions" section at the bottom
3. Should see the question you just asked

**Expected Results:**
- ✅ "Recent Questions" section visible
- ✅ Shows question: "Show all patients"
- ✅ Shows timestamp: "Just now"
- ✅ Shows mode indicator: "semantic"

**If nothing shows:**
- Check browser Network tab: GET `/api/insights/recent?customerId=xxx`
- Should return JSON array with at least 1 item
- Check browser console for errors

---

### Test 3: Ask Multiple Questions ✅

**Goal:** Verify multiple questions are saved and displayed

**Steps:**
1. Ask question #1: "What is the average healing rate?"
2. Wait for results
3. Clear question input (or refresh page)
4. Select same customer
5. Ask question #2: "Show infection trends"
6. Wait for results
7. Scroll to Recent Questions

**Expected Results:**
- ✅ Both questions appear in Recent Questions
- ✅ Most recent question at the top
- ✅ Each has timestamp (e.g., "Just now", "1 min ago")
- ✅ Up to 10 recent questions displayed

---

### Test 4: Click Recent Question to Re-run ✅

**Goal:** Verify clicking a recent question populates the input

**Steps:**
1. Scroll to Recent Questions section
2. Click on any question
3. Check question input box at the top

**Expected Results:**
- ✅ Question input populated with clicked question
- ✅ Cursor in input box
- ✅ Can immediately press "Ask →" to re-run
- ✅ No page reload

---

### Test 5: Customer-Specific Filtering ✅

**Goal:** Verify recent questions filter by customer

**Steps:**
1. Select Customer A
2. Ask: "How many patients?"
3. Wait for results, confirm it appears in Recent Questions
4. Change to Customer B (different customer)
5. Check Recent Questions section

**Expected Results:**
- ✅ Recent Questions section is empty (or shows only Customer B questions)
- ✅ Customer A's questions don't show
- ✅ Ask a question for Customer B
- ✅ Customer B's question appears in Recent Questions

**Technical Check:**
```
GET /api/insights/recent?customerId={Customer-A-UUID}
→ Returns only Customer A questions

GET /api/insights/recent?customerId={Customer-B-UUID}  
→ Returns only Customer B questions
```

---

### Test 6: Auto-Save Tag Verification ✅

**Goal:** Verify insights are tagged correctly

**Steps:**
1. Ask any question
2. Open browser DevTools → Network tab
3. Find: POST `/api/insights/save`
4. Check Request Payload

**Expected Payload:**
```json
{
  "name": "Auto-saved: Show all patients",
  "question": "Show all patients",
  "customerId": "uuid-here",
  "sql": "SELECT * FROM Patient LIMIT 10",
  "chartType": "table",
  "chartMapping": {},
  "scope": "semantic",
  "tags": ["auto-saved"],
  "semanticContext": { ... },
  "description": "Automatically saved from ask: direct mode"
}
```

**Expected Response:**
```json
{
  "id": 123,
  "name": "Auto-saved: Show all patients",
  "question": "Show all patients",
  "createdAt": "2025-11-02T...",
  "message": "Insight saved successfully"
}
```

---

### Test 7: Database Persistence Check ✅

**Goal:** Verify insights are saved to database

**Steps:**
1. Ask 2-3 questions through the UI
2. Connect to PostgreSQL database
3. Run query:
   ```sql
   SELECT 
     id,
     name,
     question,
     scope,
     "customerId",
     "userId",
     tags,
     "createdAt"
   FROM "SavedInsights"
   WHERE scope = 'semantic'
   ORDER BY "createdAt" DESC
   LIMIT 10;
   ```

**Expected Results:**
- ✅ All asked questions present
- ✅ `scope` = 'semantic'
- ✅ `tags` = '["auto-saved"]'
- ✅ `customerId` matches selected customer
- ✅ `userId` matches your user ID
- ✅ `name` starts with "Auto-saved:"

---

### Test 8: Error Handling ✅

**Goal:** Verify graceful handling of failures

**Test 8a: Auto-save fails (doesn't break main flow)**
1. Stop the database (simulate failure)
2. Ask a question
3. Check console

**Expected:**
- ✅ Results still display
- ⚠️ Warning in console: "Failed to auto-save insight"
- ✅ No error dialog shown to user
- ✅ Main flow continues normally

**Test 8b: Ask API fails**
1. Ask invalid question: Empty string
2. Check error handling

**Expected:**
- ❌ Error message displayed
- ✅ No results shown
- ✅ Can retry with valid question

---

## Testing Checklist

### UI/UX Tests
- [ ] Customer selector loads and displays customers
- [ ] Question input auto-resizes
- [ ] Ctrl+Enter submits question
- [ ] Loading states display correctly
- [ ] Thinking stream shows/hides
- [ ] Results table displays data
- [ ] Suggested questions clickable
- [ ] Recent questions clickable
- [ ] Mobile responsive design
- [ ] No layout shifts

### Functional Tests
- [ ] Questions are asked successfully
- [ ] Results display correctly
- [ ] Questions auto-save to database
- [ ] Recent questions fetch and display
- [ ] Customer filtering works
- [ ] Re-running questions works
- [ ] Multiple questions in sequence work

### API Tests
- [ ] POST /api/insights/ask returns 200
- [ ] POST /api/insights/save returns 200
- [ ] GET /api/insights/recent returns 200
- [ ] GET /api/customers returns 200
- [ ] Auth required for all endpoints
- [ ] Error responses are 4xx/5xx

### Database Tests
- [ ] SavedInsights records created
- [ ] customerId correctly set
- [ ] userId correctly set
- [ ] semanticContext saved
- [ ] tags include "auto-saved"
- [ ] createdAt timestamp correct

---

## Common Issues & Solutions

### Issue: Recent Questions Never Show

**Symptoms:**
- Questions are asked successfully
- Results display
- Recent Questions section empty

**Debug Steps:**
1. Check Network tab: GET `/api/insights/recent?customerId=xxx`
2. Check response: Should be JSON array
3. If response is `[]`:
   - Check POST `/api/insights/save` was called
   - Check database: `SELECT * FROM "SavedInsights" WHERE scope='semantic'`
   - Verify `userId` in database matches `session.user.id`

**Solution:**
- Verify migration 022 was applied
- Check session.user.id exists
- Verify customerId is valid UUID

---

### Issue: Auto-Save Fails

**Symptoms:**
- Results display correctly
- Console warning: "Failed to auto-save insight"
- Recent Questions empty

**Debug Steps:**
1. Check POST `/api/insights/save` request
2. Look for 400/500 error response
3. Check error details in response

**Common Causes:**
- Missing required fields (question, sql)
- Invalid customerId format
- Database connection issue
- Missing userId in session

**Solution:**
- Check all required fields present
- Verify customerId is valid UUID
- Test database connection
- Verify user is logged in

---

### Issue: Customer Filter Not Working

**Symptoms:**
- Questions from all customers show in Recent Questions
- Changing customer doesn't filter questions

**Debug:**
```javascript
// Check request URL includes customerId
GET /api/insights/recent?customerId=abc-123-def-456

// Verify SQL query includes WHERE clause
WHERE "userId" = $1 AND "isActive" = true AND "customerId" = $2::uuid
```

**Solution:**
- Verify recent questions API uses customerId parameter
- Check query construction in `/app/api/insights/recent/route.ts`

---

## Performance Benchmarks

Expected timings:

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Ask question (mock) | < 1s | < 2s |
| Auto-save insight | < 500ms | < 1s |
| Fetch recent questions | < 200ms | < 500ms |
| Page load | < 1s | < 2s |

---

## Next Steps After Testing

Once all tests pass:

1. ✅ Mark Phase 7A as complete
2. 📋 Document any issues found
3. 🚀 Begin Phase 7B: Semantic Integration
   - Implement template matching
   - Implement complexity detection
   - Replace mock ask endpoint with real logic

---

## Database Cleanup (Optional)

To remove auto-saved test insights:

```sql
-- View all auto-saved insights
SELECT id, name, question, "createdAt"
FROM "SavedInsights"
WHERE tags::jsonb @> '["auto-saved"]'::jsonb
ORDER BY "createdAt" DESC;

-- Delete auto-saved insights (CAREFUL!)
DELETE FROM "SavedInsights"
WHERE tags::jsonb @> '["auto-saved"]'::jsonb
AND "createdAt" < NOW() - INTERVAL '1 day';

-- Or soft delete (recommended)
UPDATE "SavedInsights"
SET "isActive" = false
WHERE tags::jsonb @> '["auto-saved"]'::jsonb
AND "createdAt" < NOW() - INTERVAL '1 day';
```

---

## Support

If you encounter issues:

1. Check browser console for errors
2. Check Network tab for API failures
3. Check database for saved records
4. Review implementation files:
   - `app/api/insights/save/route.ts`
   - `lib/hooks/useInsights.ts`
   - `app/api/insights/recent/route.ts`

---

**Last Updated:** 2025-11-02  
**Phase:** 7A - Unified Entry  
**Status:** Ready for Testing ✅


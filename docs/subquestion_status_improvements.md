# Sub-Question Status Workflow Improvements

## Overview

This document outlines the improvements made to the sub-question status workflow in the AI-powered query generation system, along with additional proposed enhancements.

## Changes Made

### 1. Automatic Status Updates on Query Execution

**File Modified:** `app/api/ai/execute-query/route.ts`

**Changes:**

- Added optional `subQuestionId` parameter to the execute-query API
- When a query executes successfully and returns at least one result, the sub-question status is automatically updated to "completed"
- Added error handling to prevent status update failures from breaking the query execution

**API Request Format:**

```json
{
  "query": "SELECT * FROM table",
  "subQuestionId": "123"
}
```

### 2. Manual "Mark as Complete" Buttons

**File Modified:** `components/funnel/FunnelPanel.tsx`

**Changes:**

- Added `onMarkComplete` prop to the FunnelPanel interface
- Added `handleMarkComplete` function that updates the sub-question status via API call
- Added "Mark as Complete" button in two locations:
  1. **Header Section:** Next to the status badge (small green button with ✓ icon)
  2. **Results Section:** Below the results display (full-width green button)

**Button Behavior:**

- Only visible when `onMarkComplete` prop is provided and status is not "completed"
- Updates status to "completed" via API call to `/api/ai/funnel/subquestions/[id]/status`
- Calls parent callback to update local state

### 3. Updated Component Hierarchy

**Files Modified:**

- `components/funnel/FunnelContainer.tsx`
- `app/funnel-test/page.tsx`

**Changes:**

- Added `onMarkComplete` prop to FunnelContainer interface
- Implemented `handleMarkComplete` function in FunnelContainer
- Updated FunnelPanel rendering to pass the `onMarkComplete` callback
- Added handler in funnel-test page for testing

### 4. Enhanced Query Execution

**File Modified:** `components/funnel/FunnelPanel.tsx`

**Changes:**

- Updated `handleExecuteSql` function to pass `subQuestionId` to the execute-query API
- This enables automatic status updates when queries execute successfully

### 5. Clear Results on SQL Change ✅ **COMPLETED**

**File Modified:** `components/funnel/FunnelPanel.tsx`

**Changes:**

- Added result clearing to `handleGenerateSql` function when SQL is regenerated
- Added result clearing to `handleSqlSave` function when SQL is manually edited and saved
- Added `resultsCleared` state to track when results are cleared
- Added helpful message in Results section: "Results cleared due to SQL changes. Click Execute to run the updated query."
- Added `useEffect` to reset cleared flag when navigating to different sub-questions
- Reset cleared flag when executing new queries

**Benefits:**

- Prevents confusion from stale results when SQL changes
- Provides clear visual feedback to users
- Ensures users only see fresh results after SQL modifications
- Maintains good UX by guiding users to re-execute queries

## Proposed Additional Workflow Improvements

### 6. Persistent Results Across Navigation ✅ **COMPLETED**

**File Modified:** `components/funnel/FunnelContainer.tsx` and `components/funnel/FunnelPanel.tsx`

**Changes:**

- Added `subQuestionResults` state to `FunnelContainer` to store results per sub-question ID
- Added `handleQueryResult` function to store results when queries execute successfully
- Added `initialResults` and `onQueryResult` props to `FunnelPanel` interface
- Fixed bug: Reset `queryResult`, `executionError`, and `resultViewMode` when navigating between sub-questions
- Updated Results section to show appropriate messages based on SQL existence
- Results persist within the same funnel session until user leaves

**Bug Fix:**

- **Problem:** Results from completed sub-questions were showing in pending sub-questions
- **Solution:** Added `useEffect` to reset result states when `subQuestion.id` changes
- **Result:** Clean navigation between sub-questions with proper state management

**Benefits:**

- Results persist when navigating back to the same sub-question
- Each sub-question maintains its own independent results
- No more confusion from results appearing in wrong sub-questions
- Better user experience with persistent data within the session

### 7. Mark Complete Validation ✅ **COMPLETED**

**File Modified:** `components/funnel/FunnelPanel.tsx`

**Changes:**

- Added validation check in `handleMarkComplete` function to warn users when no SQL query exists
- Updated button styling: green for sub-questions with SQL, yellow for those without SQL
- Updated button text: "Mark Sub-Question Complete" vs "Mark Complete (No SQL)"
- Updated tooltips to provide context about SQL status
- Applied changes to both header and bottom "Mark as Complete" buttons

**Validation Logic:**

- Checks if `subQuestion.sqlQuery` exists and is not empty
- Shows confirmation dialog with helpful message when no SQL exists
- Allows users to proceed or cancel based on their choice
- Prevents accidental completion without proper analysis

**Benefits:**

- Prevents users from accidentally marking incomplete sub-questions as complete
- Clear visual indicators show which sub-questions are ready for completion
- Users are guided to generate SQL queries before marking complete
- Maintains flexibility while encouraging best practices

### 8. Comprehensive Error Handling ✅ **COMPLETED**

**Files Modified:**

- `app/api/error-handler.ts` (enhanced)
- `lib/error-handler.ts` (new)
- `app/api/ai/execute-query/route.ts`
- `app/api/ai/funnel/generate-subquestions/route.ts`
- `app/api/ai/funnel/generate-query/route.ts`
- `app/api/ai/funnel/subquestions/[id]/status/route.ts`
- `components/funnel/FunnelPanel.tsx`

**Backend Changes:**

- Enhanced `error-handler.ts` with `ErrorType` enum and `withErrorHandling` wrapper
- Added standardized error response format with request ID tracking
- Created `createErrorResponse` helpers for common error types
- Updated all funnel API endpoints to use consistent error handling
- Added comprehensive error type classification (validation, database, AI service, network, etc.)

**Frontend Changes:**

- Created `lib/error-handler.ts` with `ErrorHandler` class and `useErrorHandler` hook
- Updated `FunnelPanel` component to use new error handling utilities
- Replaced generic `alert()` calls with user-friendly error messages
- Added success notifications for completed operations
- Implemented proper error state management

**Error Types Handled:**

- **BAD_REQUEST**: Invalid input data
- **VALIDATION_ERROR**: Data validation failures
- **DATABASE_ERROR**: Database connection issues
- **AI_SERVICE_ERROR**: AI model service failures
- **NETWORK_ERROR**: Network connectivity issues
- **TIMEOUT_ERROR**: Request timeout issues
- **INTERNAL_SERVER_ERROR**: Unexpected server errors

**Benefits:**

- Consistent error handling across all API endpoints
- User-friendly error messages with context
- Request ID tracking for error correlation and debugging
- Graceful error recovery without application crashes
- Proper loading state management on errors
- Success feedback for completed operations

### 9. Chart Integration with Funnel Workflow ✅ **COMPLETED**

**Files Modified:**

- `app/api/ai/funnel/generate-chart/route.ts` (new)
- `lib/ai/providers/i-query-funnel-provider.ts`
- `lib/ai/providers/base-provider.ts`
- `lib/prompts/chart-recommendations.prompt.ts` (new)
- `components/funnel/FunnelPanel.tsx`
- `components/funnel/ChartGenerationModal.tsx` (new)

**Backend Changes:**

- Created new API endpoint `/api/ai/funnel/generate-chart` for chart recommendations
- Added `generateChartRecommendations` method to AI provider interface
- Implemented chart recommendation logic in BaseProvider
- Created comprehensive prompt system for AI chart recommendations
- Added proper error handling and validation for chart generation

**Frontend Changes:**

- Updated FunnelPanel component with dual chart generation options
- Created ChartGenerationModal component for manual chart creation
- Added chart recommendation generation after query execution
- Integrated existing ChartComponent for visualization
- Added chart type selection dropdown with AI recommendations
- Implemented Data/Chart view toggle functionality
- Added chart display container with titles and explanations

**Chart Generation Options:**

1. **Manual Chart Generation:**

   - User selects chart type from available options
   - Manual field mapping with dropdown selection
   - Step-by-step workflow with validation
   - Chart preview before saving
   - Full user control over visualization

2. **AI Chart Generation:**
   - AI analyzes SQL results to recommend best chart type
   - Automatic field mapping based on data structure
   - AI explanations for recommendations
   - Quick chart generation with minimal user input

**Chart Types Supported:**

- **Bar Charts**: Category comparisons and distributions
- **Line Charts**: Time series and trends over time
- **Pie Charts**: Part-to-whole relationships
- **KPI Cards**: Single important metrics
- **Tables**: Detailed raw data display

**Integration Features:**

- AI analyzes SQL results to recommend best chart type
- Automatic data transformation using existing data-shaper
- Chart type switching with real-time updates
- AI explanations for chart recommendations
- Seamless integration with existing funnel workflow
- Error handling prevents workflow disruption
- Manual field mapping for educational purposes

**Benefits:**

- Users can visualize query results immediately after execution
- Manual option provides learning opportunity for data visualization
- AI provides intelligent chart type recommendations
- Multiple chart types available for different data patterns
- Consistent UI/UX with existing funnel workflow
- Leverages existing chart components and data transformation
- Maintains data accessibility alongside visualizations
- Dual approach caters to different user preferences and skill levels

### 10. Visual Status Indicators 📊 **MEDIUM PRIORITY**

**Problem:** Users can't quickly see which sub-questions have results vs. which are empty.

**Proposed Solution:**

- Add visual indicators in step navigation
- Show icons: 📊 for results, ⚪ for empty, ✅ for completed
- Help users quickly identify progress and available data

**Implementation:**

- Modify step indicators in `FunnelContainer.tsx`
- Add result status to sub-question data structure

### 11. Smart Navigation Logic 🧠 **MEDIUM PRIORITY**

**Problem:** Navigation doesn't guide users through the workflow naturally.

**Proposed Solution:**

- Show prominent action buttons based on current state:
  - "Generate SQL" when SQL is empty
  - "Execute Query" when SQL exists but no results
  - "View Results" when results are available

**Implementation:**

- Add conditional action buttons in `FunnelPanel.tsx`
- Update navigation logic in `FunnelContainer.tsx`

### 12. Query Execution History 📅 **MEDIUM PRIORITY**

**Problem:** Users don't know when results were last generated.

**Proposed Solution:**

- Show timestamp of last execution for each sub-question
- Add "Last executed: 2 minutes ago" indicators
- Help users understand data freshness

**Implementation:**

- Store execution timestamps in sub-question data
- Display in UI with relative time formatting

### 13. Query Validation ✅ **MEDIUM PRIORITY**

**Problem:** Users may execute problematic queries without warnings.

**Proposed Solution:**

- Show warnings for potential SQL issues
- Highlight missing WHERE clauses, large result sets, etc.
- Prevent wasted execution attempts

**Implementation:**

- Add SQL validation logic in `FunnelPanel.tsx`
- Show warning badges before execution

### 14. Bulk Operations ⚡ **LOW PRIORITY**

**Problem:** No efficient way to handle multiple sub-questions at once.

**Proposed Solution:**

- Add "Execute All" button to run all pending queries
- Add "Mark All Complete" for quick completion
- Useful for power users and batch processing

### 15. Results Export 📤 **LOW PRIORITY**

**Problem:** Users can't easily export results for external analysis.

**Proposed Solution:**

- Add CSV/JSON export functionality
- Include export buttons in results section
- Support for further analysis outside the tool

## Workflow Summary

### Automatic Completion (Option A)

1. User clicks "Execute" button for a SQL query
2. Query executes via `/api/ai/execute-query` with `subQuestionId`
3. If query returns at least one result, status automatically updates to "completed"
4. UI reflects the status change immediately

### Manual Completion (Option B)

1. User clicks "Mark as Complete" button (either in header or below results)
2. Status updates to "completed" via API call
3. UI reflects the status change immediately

## Benefits

1. **Flexibility:** Users can complete sub-questions even without executing queries
2. **Automation:** Successful query execution automatically marks questions as complete
3. **Clear UI:** Multiple button locations make it easy to mark questions complete
4. **Consistency:** Status updates are handled through the same API endpoint
5. **Error Handling:** Status update failures don't break query execution

## Implementation Todo List

### 🔥 **HIGH PRIORITY** (Implement First)

- [x] **Clear Results on SQL Change**

  - [x] Clear `queryResult` in `handleGenerateSql`
  - [x] Clear `queryResult` in `handleSqlSave`
  - [x] Test both regenerate and manual edit scenarios
  - [x] Add visual feedback when results are cleared
  - [x] Reset cleared flag when executing new query
  - [x] Reset cleared flag when navigating to different sub-question

- [x] **Persistent Results Across Navigation**
  - [x] Add `subQuestionResults` state to `FunnelContainer`
  - [x] Implement `handleQueryResult` function
  - [x] Pass results to `FunnelPanel` via props
  - [x] Test navigation between sub-questions
  - [x] Fix bug: Reset results when navigating between sub-questions
  - [x] Add appropriate messaging for different states

### 📊 **MEDIUM PRIORITY** (Implement Second)

- [ ] **Visual Status Indicators**

  - [ ] Add result status to sub-question data structure
  - [ ] Update step indicators with result icons
  - [ ] Test visual feedback in navigation

- [ ] **Smart Navigation Logic**

  - [ ] Add conditional action buttons in `FunnelPanel`
  - [ ] Implement state-based button visibility
  - [ ] Test user guidance through workflow

- [ ] **Query Execution History**

  - [ ] Add `lastExecutionDate` to sub-question data
  - [ ] Display relative timestamps in UI
  - [ ] Test timestamp formatting and updates

- [ ] **Query Validation**
  - [ ] Implement SQL validation logic
  - [ ] Add warning badges for potential issues
  - [ ] Test validation with various query types

### ⚡ **LOW PRIORITY** (Future Enhancements)

- [ ] **Bulk Operations**

  - [ ] Add "Execute All" functionality
  - [ ] Add "Mark All Complete" functionality
  - [ ] Test bulk operations with multiple sub-questions

- [ ] **Results Export**
  - [ ] Implement CSV export functionality
  - [ ] Implement JSON export functionality
  - [ ] Add export buttons to results section

## Testing

A test script has been created (`test-execute-query.js`) to verify the API changes work correctly.

## Future Enhancements

1. **Visual Feedback:** Add loading states and success/error notifications
2. **Confirmation Dialogs:** Add confirmation for manual completion
3. **Bulk Operations:** Allow marking multiple sub-questions as complete
4. **Audit Trail:** Track who marked questions complete and when
5. **Advanced Validation:** More sophisticated SQL validation rules
6. **Performance Optimization:** Lazy loading of results for large datasets
7. **Accessibility:** Ensure all new features are keyboard accessible

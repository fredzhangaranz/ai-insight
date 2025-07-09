# InsightGen POC - Remaining Work

This document outlines the remaining tasks to complete the proof-of-concept application. The tasks are ordered to build foundational pieces first, allowing for verification at each major step.

## 1. Backend API Implementation

The first priority is to build and test the real backend endpoints. This ensures our AI and data logic is solid before connecting the UI.

- [ ] **Implement `POST /ai/generate-query` Endpoint (Analysis Plan)**

  - This is the primary AI endpoint.
  - It should take `assessmentFormDefinition` and a `question` in the request body.
  - It will construct a comprehensive prompt for the AI, instructing it to return a single JSON object with three keys: `explanation`, `generatedSql`, and `chartType`.
  - This endpoint **will not** execute the query. It only generates the plan.
  - This replaces the previous separate `generate-query` and `explain-query` endpoints.

- [ ] **Implement `POST /ai/execute-query` Endpoint**
  - This endpoint will receive a `query` string in its body.
  - It must perform a security check to ensure the query is a read-only `SELECT` statement.
  - It will execute the validated query against the database and return the resulting `data` array.

## 2. Frontend API Integration

With the backend APIs in place, we will replace the mock data in the UI with live API calls.

- [ ] **Update `analysis-page.tsx` to Call Real APIs**
  - Refactor `handleGenerateSqlAndExplanation` to make a `fetch` call to our new `POST /ai/generate-query` endpoint. The response will populate the `explanation`, `generatedSql`, and `recommendedChartType` state variables.
  - Refactor `handleFetchChartData` to make a `fetch` call to `POST /ai/execute-query`, passing the `generatedSql` in the body. The response will populate the `chartData` and `tableData` state variables.
  - At this point, the "AI Query Plan" view should be fully functional with real, AI-generated content.

## 3. Final UI Implementation

The final step is to build the complete results view as described in the application flow.

- [ ] **Implement the Final `results` UI State**
  - In `analysis-page.tsx`, move the JSX for the `results` state into the `renderRightPanelContent` function for better code organization.
  - Create the final layout which includes:
    - A main title with the user's selected question (`currentQuestion.text`).
    - A large card for the `<ChartComponent />`.
    - A two-column grid below the chart for the `<CodeBlock />` (showing `generatedSql`) and `<DataTable />` (showing `tableData`).
  - Add an "Ask Another Question" button at the bottom of the results view.
  - Wire the button's `onClick` to the `handleResetToInsights` function to allow the user to start a new analysis.

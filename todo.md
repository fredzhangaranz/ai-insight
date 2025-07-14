# InsightGen POC - Remaining Work

This document outlines the remaining tasks to complete the proof-of-concept application. The tasks are ordered to build foundational pieces first, allowing for verification at each major step.

## 1. Backend API Implementation & Architecture

The backend APIs are complete and include significant architectural improvements for performance and security.

- [x] **Implement `POST /ai/generate-query` Endpoint (Analysis Plan)**

  - This is the primary AI endpoint.
  - It should take `assessmentFormDefinition` and a `question` in the request body.
  - It will construct a comprehensive prompt for the AI, instructing it to return a single JSON object with three keys: `explanation`, `generatedSql`, and `chartType`.
  - This endpoint **does not** execute the query. It only generates the plan.

- [x] **Implement `POST /ai/execute-query` Endpoint**

  - This endpoint will receive a `query` string in its body.
  - It must perform a security check to ensure the query is a read-only `SELECT` statement.
  - It will execute the validated query against the database and return the resulting `data` array.

- [x] **Architectural Improvements**
  - **Caching:** The `/ai/generate-query` endpoint now caches all analysis plans (both patient-specific and general) in the `rpt.AIAnalysisPlan` table to reduce AI API costs and improve response times for repeated questions. The frontend can force a regeneration via a `regenerate: true` flag.
  - **Security:** The system now uses parameterized queries. The AI generates SQL templates with placeholders (e.g., `@patientId`), and the `/ai/execute-query` endpoint safely injects values, preventing SQL injection vulnerabilities.

## 2. Frontend API Integration

With the backend APIs in place, we will replace the mock data in the UI with live API calls.

- [x] **Update `analysis-page.tsx` to call `generate-query` API**

  - Refactored `handleGenerateSqlAndExplanation` to make a `fetch` call to our new `POST /ai/generate-query` endpoint.
  - The response populates the `explanation`, `generatedSql`, and `recommendedChartType` state variables.
  - Added a "Regenerate Plan" button to call the same endpoint with `regenerate: true`.

- [ ] **Update `analysis-page.tsx` to call `execute-query` API**

  - Refactor `handleFetchChartData` to make a `fetch` call to `POST /ai/execute-query`.
  - The request body should include the `generatedSql` from the state.
  - For patient-specific questions, the request body must also include a `params` object (e.g., `{ "patientId": "..." }`).
  - The response will populate the `chartData` and `tableData` state variables.

- [ ] **Update `chart-component.tsx` to handle real data**
  - The component currently expects a specific data shape (`{name, value, percentage}`).
  - It needs to be updated to dynamically handle different data shapes returned by the API (e.g., `{assessmentDate, woundArea}` or `{etiology, count}`).
  - It should use the `recommendedChartType` to render the correct chart (e.g., 'line' or 'bar').

## 3. Final UI Implementation

The final step is to build the complete results view as described in the application flow.

- [ ] **Implement the Final `results` UI State**
  - In `analysis-page.tsx`, integrate the final results display into the main component logic.
  - Create the final layout which includes:
    - A main title with the user's selected question (`currentQuestion.text`).
    - A large card for the `<ChartComponent />` displaying the real `chartData`.
    - A two-column grid below the chart for the `<CodeBlock />` (showing `generatedSql`) and `<DataTable />` (showing `tableData`).
  - Add an "Ask Another Question" button at the bottom of the results view that resets the state correctly.

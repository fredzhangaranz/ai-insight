# InsightGen POC - Remaining Work

This document outlines the remaining tasks to complete the proof-of-concept application. The tasks are ordered to build foundational pieces first, allowing for verification at each major step.

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

## 2. Backend API Enhancements

- [x] **Enhance `POST /ai/generate-query` to return `availableMappings`**
  - Update the system prompt in `app/api/ai/generate-query/route.ts` to instruct the AI to return `recommendedChartType` and a new `availableMappings` object.
  - `availableMappings` will be an object where keys are chart types (e.g., 'bar', 'pie', 'table') and values are the corresponding column mapping objects (e.g., `{ "category": "etiology", "value": "count" }`).
  - The AI should determine all plausible chart types for the given query and provide mappings for each.
  - This allows the frontend to offer user-selectable chart types without extra API calls.

## 3. Frontend Implementation: Dynamic Charting

This section outlines our progress in building a data-agnostic charting system.

- [x] **Step 1: Define Chart Data Contracts**

  - ✅ Created `lib/chart-contracts.ts`
  - ✅ Defined TypeScript interfaces for all chart types (Bar, Line, Pie, KPI)
  - ✅ Added support for table data with column definitions
  - ✅ Implemented chart type union and mapping interfaces

- [x] **Step 2: Create Individual "Dumb" Chart Components**

  - ✅ Created `components/charts/` directory
  - ✅ Implemented `bar-chart.tsx` with recharts
  - ✅ Implemented `line-chart.tsx` with recharts
  - ✅ Implemented `pie-chart.tsx` with recharts
  - ✅ Implemented `kpi-card.tsx` with trend indicators
  - ✅ Added proper TypeScript contracts to all components
  - ✅ Added example data for testing

- [x] **Step 4: Create the "Smart" Dispatcher**

  - ✅ Implemented `chart-component.tsx` as a dispatcher
  - ✅ Added type guards for data validation
  - ✅ Added error boundaries for graceful failure
  - ✅ Added proper sizing and className support
  - ✅ Added debugging and error reporting

- [x] **Step 3: Implement the Data Shaper Utility**

  - ✅ Created `lib/data-shaper.ts`
  - ✅ Implemented `shapeDataForChart` with type safety
  - ✅ Added support for sorting and limiting
  - ✅ Added individual shapers for each chart type
  - ✅ Added comprehensive error handling

- [ ] **Step 5: Connect Real Data Flow** (Next Priority)
  - Update `analysis-page.tsx` to use real data from API
  - Connect `availableMappings` from AI response to chart selection
  - Use `data-shaper.ts` to transform SQL results
  - Set initial chart type to AI's recommendation
  - Add loading states during data transformation

## 4. Final UI Implementation

- [x] **Basic Results View Layout**

  - ✅ Added chart type selection dropdown
  - ✅ Added chart container with proper sizing
  - ✅ Added SQL and raw data display
  - ✅ Added proper error states and loading indicators

- [ ] **Polish and Final Features**
  - Add loading spinners during data transformation
  - Add error handling for data shaping failures
  - Add tooltips explaining chart type options
  - Add "Ask Another Question" button
  - Add transition animations between states
  - Add copy-to-clipboard for raw data
  - Add export options for charts and data

## Next Steps

1. Connect Real Data Flow (Step 5)

   - This is now the main priority
   - Replace example data with real SQL results
   - Use the data shaper to transform the data
   - Connect with AI's recommended chart types
   - Add proper loading and error states

2. Add Final Polish

   - Focus on user experience improvements
   - Add helpful tooltips and explanations
   - Ensure smooth transitions between states
   - Add export and sharing capabilities

3. Testing and Documentation
   - Add unit tests for data shaping scenarios
   - Add integration tests for the complete flow
   - Document the chart type selection logic
   - Document the data transformation process

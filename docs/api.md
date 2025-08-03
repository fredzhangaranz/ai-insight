### **API Documentation: InsightGen POC (v2)**

**Base URL:** `http://localhost:3000/api`
**Authentication:** None for this POC.

---

### **1. AssessmentForm Endpoints**

These endpoints are responsible for fetching information about the AssessmentForms themselves.

#### **1.1 Get All AssessmentForms**

- **Endpoint:** `GET /assessment-forms`
- **Description:** Retrieves a simple list of all available AssessmentForms that can be selected for analysis. This is the first call the application makes to populate the initial selection page.
- **Request:**
  - No body or parameters required.
- **Response (`200 OK`):**
  - An array of AssessmentForm objects.
  - **Body (JSON):**
    ```json
    [
      {
        "assessmentFormId": "wound-assessment-v1",
        "assessmentFormName": "Wound Assessment",
        "definitionVersion": 1
      },
      {
        "assessmentFormId": "patient-intake-v2",
        "assessmentFormName": "Patient Intake Form",
        "definitionVersion": 1
      }
    ]
    ```
- **Response (`500 Internal Server Error`):**
  - If the database connection fails.
  - **Body (JSON):**
    ```json
    {
      "message": "Failed to fetch AssessmentForms.",
      "error": "Database connection failed."
    }
    ```
- **Backend Logic:**
  1.  Connect to the MS SQL database.
  2.  Execute a query to get the distinct list of AssessmentForms. (e.g., `SELECT DISTINCT FormId as assessmentFormId, FormName as assessmentFormName FROM YourFormsTable`).
  3.  Format the result into the specified JSON array.
  4.  Handle any database errors and return a 500 status.
  5.  Close the database connection.

#### **1.2 Get AssessmentForm Definition**

- **Endpoint:** `GET /assessment-forms/[assessmentFormId]/definition`
- **Description:** Fetches the detailed field structure (the Definition) for a single, specified AssessmentForm. This is called after the user selects an AssessmentForm from the list.
- **Request:**
  - **Path Parameter:** `assessmentFormId` (string) - The unique identifier for the AssessmentForm (e.g., `wound-assessment-v1`).
- **Response (`200 OK`):**
  - The complete JSON definition for the requested AssessmentForm.
  - **Body (JSON):**
    ```json
    {
      "Etiology": {
        "fieldtype": "SingleSelect",
        "options": [
          "Pressure Ulcer: Stage 1",
          "Venous Ulcer",
          "Diabetic",
          "..."
        ]
      },
      "Exudate Volume": {
        "fieldtype": "SingleSelect",
        "options": ["None", "Low", "Moderate", "High"]
      },
      "Clinical Signs of Infection": {
        "fieldtype": "MultiSelect",
        "options": ["Cellulitis", "Suppuration", "Granulation changes", "..."]
      }
      // ... all other fields for the AssessmentForm
    }
    ```
- **Response (`404 Not Found`):**
  - If no AssessmentForm with the given `assessmentFormId` exists.
- **Backend Logic:**
  1.  Get the `assessmentFormId` from the request path.
  2.  Connect to the database.
  3.  Execute a query to retrieve all field definitions associated with that `assessmentFormId`.
  4.  Dynamically construct the `AssessmentFormDefinition` JSON object based on the database results.
  5.  If no fields are found, return a 404. Otherwise, return the definition.

#### **1.3 Get Patients for AssessmentForm**

- **Endpoint:** `GET /assessment-forms/[assessmentFormId]/patients`
- **Description:** Retrieves a list of patients who have at least one completed assessment using the specified AssessmentForm. This is used to populate the patient dropdown for single-patient trend analysis.
- **Request:**
  - **Path Parameter:** `assessmentFormId` (string) - The unique identifier for the AssessmentForm.
- **Response (`200 OK`):**
  - An array of patient objects, sorted by name.
  - **Body (JSON):**
    ```json
    [
      {
        "patientId": "PAT-001",
        "patientName": "John Smith"
      },
      {
        "patientId": "PAT-002",
        "patientName": "Jane Doe"
      }
    ]
    ```
- **Backend Logic:**
  1.  Get the `assessmentFormId` from the request path.
  2.  Connect to the database.
  3.  Execute a query to get a distinct list of patients who have entries linked to this `assessmentFormId`. (e.g., `SELECT DISTINCT p.PatientId, p.PatientName FROM Patients p JOIN Assessments a ON p.PatientId = a.PatientId WHERE a.FormId = @assessmentFormId ORDER BY p.PatientName`).
  4.  Return the formatted list.

#### **1.4 Get Wounds for Patient**

- **Endpoint:** `GET /patients/[patientId]/wounds`
- **Description:** Retrieves a list of all wounds associated with a specific patient that have at least one assessment.
- **Request:**
  - **Path Parameter:** `patientId` (string) - The unique identifier for the patient.
- **Response (`200 OK`):**
  - An array of wound objects, providing enough detail for the user to make an informed choice.
  - **Body (JSON):**
    ```json
    [
      {
        "woundId": "WOUND-GUID-1",
        "woundLabel": "W1",
        "anatomyLabel": "Left Heel"
      },
      {
        "woundId": "WOUND-GUID-2",
        "woundLabel": "W2",
        "anatomyLabel": "Right Sacrum"
      }
    ]
    ```
- **Backend Logic:**
  - The backend would execute a query like: `SELECT id as woundId, label as woundLabel, anatomyLabel FROM rpt.Wound WHERE patientFk = @patientId ORDER BY [index];`

### **2. AI Endpoints**

These endpoints interact with the Claude API to generate insights and SQL queries.

You have an excellent eye for user experience. You're absolutely right, the current flow is too aggressive by automatically generating insights. Forcing the user to explicitly click a button to trigger a potentially long-running (and costly) AI operation is much better design. It manages expectations and gives them a feeling of control.

Your idea to check for existing insights first is the correct path. I agree with your goal completely.

I'd like to propose a small refinement to your implementation idea. Instead of creating a _new_ API endpoint just to check if insights exist, we can make our existing `GET /insights` endpoint smarter. This will make the frontend code cleaner and reduce the number of API calls.

Here's the proposed workflow:

1.  When the `analysis-page` loads, it will call our one and only insights endpoint: `GET /api/assessment-forms/[assessmentFormId]/insights`.
2.  The API will **only check the cache**.
    - If insights are found in the database, it will return them with a `200 OK` status.
    - If no insights are found, it will return an empty response with a special status code (`204 No Content`) that tells the frontend "I looked, but found nothing."
3.  The frontend will then decide what to display based on the API's response:
    - If it gets a `200 OK` with data, it shows the questions and a "Regenerate" button.
    - If it gets a `204 No Content`, it shows the "Analyze with AI" button.
4.  Clicking **either** the "Analyze with AI" button or the "Regenerate" button will call the exact same endpoint, but with a special instruction: `GET .../insights?regenerate=true`. This tells the API to skip the cache, call the AI, save the results, and return them.

This approach is more efficient and keeps the logic clean. Here is the updated API documentation reflecting this improved design.

---

### **Updated API Documentation (v5)**

#### **2.1 Get or Generate Suggested Insights**

- **Endpoint:** `GET /assessment-forms/[assessmentFormId]/insights`

- **Method:** `GET`

- **Description:**
  This is a smart endpoint that serves as the single source for retrieving AI-generated analytical questions. It uses a cache-first strategy and its behavior is determined by the `regenerate` query parameter.

- **Request:**

  - **Path Parameter:** `assessmentFormId` (string) - The unique identifier for the AssessmentForm.
  - **Query Parameter (Optional):** `regenerate` (boolean, e.g., `?regenerate=true`) - Controls the caching and generation behavior.

- **Behavior without `regenerate` flag (`GET .../insights`):**

  - This is the "cache-check only" mode.
  - The endpoint queries the `rpt.AIInsights` table for a stored record.
  - **If found:** Returns a `200 OK` status with the `insightsJson` payload.
  - **If not found:** Returns a `204 No Content` status with an empty body. It **will not** call the AI service.

- **Behavior with `regenerate=true` flag (`GET .../insights?regenerate=true`):**

  - This is the "force generate" mode.
  - The endpoint will bypass the cache check, call the Claude AI service to generate fresh insights, save (or update) the results in the database, and return the new data with a `200 OK` status.

- **Frontend Interaction Flow:**

  1.  When the `analysis-page` initially loads, it should call `GET .../insights`.
  2.  The page should display a loading indicator.
  3.  If the response status is `200 OK`, the frontend receives the insight data and displays the list of questions along with a "Regenerate Insights" button.
  4.  If the response status is `204 No Content`, the frontend knows no cached insights exist and should display the "Analyze with AI" button.
  5.  When the user clicks either "Analyze with AI" or "Regenerate Insights", the frontend should call `GET .../insights?regenerate=true`.

- **Success Response (`200 OK`):**

  - The standard JSON structure containing the insights.
  - **Body (JSON):**
    ```json
    {
      "insights": [
        {
          "category": "Wound Progression and Healing Trajectory",
          "questions": [
            {
              "text": "Show the wound healing trend (area over time) for a patient.",
              "type": "single-patient"
            }
          ]
        }
      ]
    }
    ```

- **Success Response (`204 No Content`):**

  - Indicates that no cached insights were found.
  - The response will have no body.

#### **2.2 Get or Generate Analysis Plan**

- **Endpoint:** `POST /ai/generate-query`
- **Description:** This is a smart endpoint that acts as the single source for retrieving an AI-generated analysis plan. It uses a cache-first strategy. Its behavior is determined by the `regenerate` flag in the request body.

- **Request:**

  - **Body (JSON):**

    ```json
    {
      // The definition of the AssessmentForm being analyzed
      "assessmentFormDefinition": { "...": { "...": [] } },

      // The exact question the user selected
      "question": "Compare healing rates for different treatment types.",

      // Optional: Only include for single-patient questions
      "patientId": "PAT-001",

      // Optional: Force regeneration, bypassing the cache
      "regenerate": false
    }
    ```

- **Behavior:**

  - **If `regenerate` is `false` or omitted (Cache-check mode):**
    - The endpoint first queries a cache table (e.g., `rpt.AIAnalysisPlan`) for a stored plan matching the `assessmentFormId` and `question`.
    - **If found:** Returns a `200 OK` status with the cached analysis plan.
    - **If not found:** Proceeds to the "generate" mode logic below.
  - **If `regenerate` is `true` (Force-generate mode):**
    - The endpoint will bypass the cache check, call the Claude AI service to generate a fresh analysis plan, save (or update) the result in the database, and then return the new data.

- **Response (`200 OK`):**
- Returns the complete analysis plan from the AI or the cache.
  ```json
  {
    "chartType": "bar",
    "generatedSql": "SELECT w.TreatmentType, AVG(w.HealingRate) ...",
    "explanation": "### Step 1: Analyze the User's Question\nThe user is asking for a 'healing rate progression' for a specific patient 'over time'. This clearly indicates a time-series analysis is needed...\n\n### Step 2: Consult the Database Schema\n- To get a date for each event, I will use the `date` column from the `rpt.Assessment` table...\n\n### Step 3: Construct the SQL Query\nBased on the analysis, I will construct the query as follows..."
  }
  ```
- **Backend Logic (Updated):**
  1.  The backend will have a hardcoded string or will read from a local file containing the `databaseSchemaContext`.
  2.  It will construct a single, comprehensive `system` prompt for the Claude API. This prompt will instruct the AI to return a single JSON object containing three keys: `explanation`, `generatedSql`, and `chartType`.
  3.  It will receive the `assessmentFormDefinition` and `question` from the client's request body.
  4.  It will construct a `user` message for the Claude API containing only this dynamic information.

#### **2.3 Execute Query**

- **Endpoint:** `POST /ai/execute-query`

- **Description:**
  This endpoint takes a SQL query string, performs a basic security validation, executes it against the database, and returns the resulting data. It is designed to be called after `generate-query` and after the user has had a chance to review the generated SQL.

- **Request:**

  - **Body (JSON):**
    ```json
    {
      "query": "SELECT TOP 5 L.text as etiology, COUNT(N.id) as count FROM ..."
    }
    ```

- **Response (`200 OK`):**

  - An object containing the `data` from the query execution.
  - **Body (JSON):**
    ```json
    {
      "data": [
        { "etiology": "Diabetic", "count": 145 },
        { "etiology": "Pressure Ulcer: Stage 2", "count": 98 }
      ]
    }
    ```

- **Backend Logic:**
  1.  Receives the `query` string from the request body.
  2.  **Security Check:** Validates that the query is a read-only `SELECT` statement. If not, it rejects the request with a 400 Bad Request error.
  3.  Connects to the database.
  4.  Executes the validated query.
  5.  Returns the `recordset` from the database as the `data` property in the response.

---

### **3. Funnel Query Workflow Endpoints**

These endpoints support the new AI-powered incremental query generation workflow, allowing complex questions to be broken down into simpler sub-questions and executed sequentially.

#### **3.1 Funnel Management**

##### **3.1.1 Create Funnel**

- **Endpoint:** `POST /ai/funnel`
- **Description:** Creates a new query funnel to store the breakdown of a complex question into sub-questions.
- **Request:**
  - **Body (JSON):**
    ```json
    {
      "assessmentFormVersionFk": "wound-assessment-v1",
      "originalQuestion": "What is the effectiveness of treatments across different wound etiologies over the past year?"
    }
    ```
- **Response (`201 Created`):**
  - **Body (JSON):**
    ```json
    {
      "id": 1,
      "assessmentFormVersionFk": "wound-assessment-v1",
      "originalQuestion": "What is the effectiveness of treatments across different wound etiologies over the past year?",
      "status": "active",
      "createdDate": "2024-01-15T10:30:00Z",
      "lastModifiedDate": "2024-01-15T10:30:00Z"
    }
    ```

##### **3.1.2 List Funnels**

- **Endpoint:** `GET /ai/funnel`
- **Description:** Retrieves all query funnels, optionally filtered by status.
- **Request:**
  - **Query Parameters (Optional):**
    - `status` (string) - Filter by status: `active`, `archived`
    - `assessmentFormId` (string) - Filter by assessment form
- **Response (`200 OK`):**
  - **Body (JSON):**
    ```json
    [
      {
        "id": 1,
        "assessmentFormVersionFk": "wound-assessment-v1",
        "originalQuestion": "What is the effectiveness of treatments across different wound etiologies over the past year?",
        "status": "active",
        "createdDate": "2024-01-15T10:30:00Z",
        "lastModifiedDate": "2024-01-15T10:30:00Z"
      }
    ]
    ```

##### **3.1.3 Get Funnel by ID**

- **Endpoint:** `GET /ai/funnel/[id]`
- **Description:** Retrieves a specific funnel by its ID.
- **Request:**
  - **Path Parameter:** `id` (integer) - The funnel ID
- **Response (`200 OK`):**
  - **Body (JSON):** Same structure as Create Funnel response
- **Response (`404 Not Found`):** If funnel doesn't exist

#### **3.2 Sub-Question Management**

##### **3.2.1 Add Sub-Question**

- **Endpoint:** `POST /ai/funnel/subquestions`
- **Description:** Adds a sub-question to an existing funnel.
- **Request:**
  - **Body (JSON):**
    ```json
    {
      "funnelId": 1,
      "questionText": "List all distinct wound etiologies recorded in the past year.",
      "order": 1,
      "sqlQuery": "SELECT DISTINCT etiology FROM rpt.Note WHERE YEAR(createdDate) = YEAR(GETDATE()) - 1"
    }
    ```
- **Response (`201 Created`):**
  - **Body (JSON):**
    ```json
    {
      "id": 1,
      "funnelId": 1,
      "questionText": "List all distinct wound etiologies recorded in the past year.",
      "order": 1,
      "sqlQuery": "SELECT DISTINCT etiology FROM rpt.Note WHERE YEAR(createdDate) = YEAR(GETDATE()) - 1",
      "status": "pending",
      "lastExecutionDate": null
    }
    ```

##### **3.2.2 List Sub-Questions**

- **Endpoint:** `GET /ai/funnel/subquestions`
- **Description:** Retrieves all sub-questions for a specific funnel.
- **Request:**
  - **Query Parameter:** `funnelId` (integer) - The funnel ID
- **Response (`200 OK`):**
  - **Body (JSON):**
    ```json
    [
      {
        "id": 1,
        "funnelId": 1,
        "questionText": "List all distinct wound etiologies recorded in the past year.",
        "order": 1,
        "sqlQuery": "SELECT DISTINCT etiology FROM rpt.Note WHERE YEAR(createdDate) = YEAR(GETDATE()) - 1",
        "status": "completed",
        "lastExecutionDate": "2024-01-15T10:35:00Z"
      }
    ]
    ```

##### **3.2.3 Update Sub-Question Status**

- **Endpoint:** `PUT /ai/funnel/subquestions/[id]/status`
- **Description:** Updates the status of a specific sub-question.
- **Request:**
  - **Path Parameter:** `id` (integer) - The sub-question ID
  - **Body (JSON):**
    ```json
    {
      "status": "completed"
    }
    ```
- **Response (`200 OK`):** Success confirmation

##### **3.2.4 Update Sub-Question SQL**

- **Endpoint:** `PUT /ai/funnel/subquestions/[id]/sql`
- **Description:** Updates the SQL query for a specific sub-question.
- **Request:**
  - **Path Parameter:** `id` (integer) - The sub-question ID
  - **Body (JSON):**
    ```json
    {
      "sqlQuery": "SELECT DISTINCT etiology FROM rpt.Note WHERE YEAR(createdDate) = YEAR(GETDATE()) - 1 AND etiology IS NOT NULL"
    }
    ```
- **Response (`200 OK`):** Success confirmation

#### **3.3 Query Results Management**

##### **3.3.1 Store Query Result**

- **Endpoint:** `POST /ai/funnel/results`
- **Description:** Stores the execution result for a sub-question.
- **Request:**
  - **Body (JSON):**
    ```json
    {
      "subQuestionId": 1,
      "resultData": [
        { "etiology": "Diabetic" },
        { "etiology": "Pressure" },
        { "etiology": "Surgical" }
      ]
    }
    ```
- **Response (`201 Created`):** Success confirmation

##### **3.3.2 Get Query Result**

- **Endpoint:** `GET /ai/funnel/results`
- **Description:** Retrieves the latest result for a specific sub-question.
- **Request:**
  - **Query Parameter:** `subQuestionId` (integer) - The sub-question ID
- **Response (`200 OK`):**
  - **Body (JSON):**
    ```json
    {
      "id": 1,
      "subQuestionId": 1,
      "resultData": [
        { "etiology": "Diabetic" },
        { "etiology": "Pressure" },
        { "etiology": "Surgical" }
      ],
      "executionDate": "2024-01-15T10:35:00Z"
    }
    ```

#### **3.4 AI Generation Endpoints**

##### **3.4.1 Generate Sub-Questions**

- **Endpoint:** `POST /ai/funnel/generate-subquestions`
- **Description:** Uses AI to break down a complex question into simpler sub-questions.
- **Request:**
  - **Body (JSON):**
    ```json
    {
      "originalQuestion": "What is the effectiveness of treatments across different wound etiologies over the past year?",
      "assessmentFormDefinition": {
        "Etiology": {
          "fieldtype": "SingleSelect",
          "options": ["Diabetic", "Pressure", "Surgical"]
        }
      },
      "databaseSchemaContext": "Optional database schema information"
    }
    ```
- **Response (`200 OK`):**
  - **Body (JSON):**
    ```json
    {
      "original_question": "What is the effectiveness of treatments across different wound etiologies over the past year?",
      "matched_template": "Treatment Effectiveness Overview",
      "sub_questions": [
        {
          "step": 1,
          "question": "List all distinct wound etiologies recorded in the past year.",
          "depends_on": null
        },
        {
          "step": 2,
          "question": "Calculate the average healing time per treatment method for each wound etiology.",
          "depends_on": 1
        },
        {
          "step": 3,
          "question": "Rank the treatment methods by average healing time for each wound etiology.",
          "depends_on": 2
        }
      ]
    }
    ```

##### **3.4.2 Generate SQL Query**

- **Endpoint:** `POST /ai/funnel/generate-query`
- **Description:** Uses AI to generate SQL for a specific sub-question, considering previous queries and context.
- **Request:**
  - **Body (JSON):**
    ```json
    {
      "subQuestion": "Calculate the average healing time per treatment method for each wound etiology.",
      "previousQueries": [
        "SELECT DISTINCT etiology FROM rpt.Note WHERE YEAR(createdDate) = YEAR(GETDATE()) - 1"
      ],
      "assessmentFormDefinition": {
        "Etiology": {
          "fieldtype": "SingleSelect",
          "options": ["Diabetic", "Pressure", "Surgical"]
        }
      },
      "databaseSchemaContext": "Optional database schema information"
    }
    ```
- **Response (`200 OK`):**
  - **Body (JSON):**
    ```json
    {
      "explanation": "This query calculates average healing times by treatment method and etiology, building on the distinct etiologies identified in the previous step.",
      "generatedSql": "SELECT etiology, treatmentType, AVG(healingTime) as avgHealingTime FROM rpt.Treatment WHERE etiology IN (SELECT DISTINCT etiology FROM rpt.Note WHERE YEAR(createdDate) = YEAR(GETDATE()) - 1) GROUP BY etiology, treatmentType",
      "validationNotes": "Ensured healingTime is non-null and valid. Used CTE for better performance.",
      "matchedQueryTemplate": "Aggregation by Category"
    }
    ```

#### **3.5 Error Responses**

All funnel endpoints may return the following error responses:

- **400 Bad Request:** Invalid request data or parameters
- **404 Not Found:** Resource not found
- **500 Internal Server Error:** Database or AI service errors

**Example Error Response:**

```json
{
  "error": "Invalid funnel ID",
  "message": "The specified funnel does not exist",
  "statusCode": 404
}
```

#### **3.6 Backend Implementation Notes**

- **Database Tables:** Uses `rpt.QueryFunnel`, `rpt.SubQuestions`, and `rpt.QueryResults` tables
- **AI Integration:** Integrates with Anthropic Claude API for question breakdown and SQL generation
- **Caching:** Results are cached in the database for performance
- **Security:** SQL queries are validated for safety (SELECT statements only)
- **Monitoring:** All AI interactions and query executions are logged for metrics

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

---

### **2. AI Endpoints**

These endpoints interact with the Claude API to generate insights and SQL queries.

#### **2.1 Suggest Insights (Questions)**

- **Endpoint:** `POST /ai/suggest-insights`
- **Description:** Takes an AssessmentForm's Definition and asks the AI to generate a categorized list of potential analytical questions (insights) a user might want to ask.
- **Request:**
  - **Body (JSON):**
    ```json
    {
      "assessmentFormDefinition": {
        // The full JSON definition obtained from GET /assessment-forms/[assessmentFormId]/definition
        "Etiology": { "fieldtype": "SingleSelect", "options": [...] },
        "Exudate Volume": { "fieldtype": "SingleSelect", "options": [...] }
        // ...
      }
    }
    ```
- **Response (`200 OK`):**
  - A structured object containing categorized questions. Each question must have a `type` to inform the UI what to do next.
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
            },
            {
              "text": "Which patients have wounds that have increased in size?",
              "type": "all-patient"
            }
          ]
        }
      ]
    }
    ```
- **Backend Logic:**
  1.  Receive the `assessmentFormDefinition` in the request body.
  2.  Construct a detailed prompt for the Claude API. The prompt should instruct the AI to act as a clinical data analyst, analyze the provided `AssessmentFormDefinition` (and its possible values), and generate insightful questions.
  3.  Crucially, the prompt must instruct the AI to categorize the questions and to add a `type` field (`"single-patient"` or `"all-patient"`) to each question.
  4.  Call the Claude API.
  5.  Parse the AI's text response into the required JSON structure. Add error handling for malformed AI responses.

#### **2.2 Generate Query and Fetch Data**

- **Endpoint:** `POST /ai/generate-query`
- **Description:** The main workhorse endpoint. It takes a user-selected question and context, asks the AI to generate a SQL query and suggest a chart type, executes the query against the database, and returns the complete package for visualization.
- **Request:**

  - **Body (JSON):**

    ```json
    {
      // The definition of the AssessmentForm being analyzed
      "assessmentFormDefinition": { "...": { "...": [] } },

      // The database schema context (for the AI)
      "databaseSchemaContext": "Table Assessments has columns [AssessmentId, PatientId, WoundId, ...]. Table Wounds has [WoundId, Etiology, Area, Volume...].",

      // The exact question the user selected
      "question": "Compare healing rates for different treatment types.",

      // Optional: Only include for single-patient questions
      "patientId": "PAT-001"
    }
    ```

- **Response (`200 OK`):**

  - An object containing everything the frontend needs to render the result.
  - **Body (JSON):**

    ```json
    {
      // The suggested chart type for the frontend to use
      "chartType": "bar", // e.g., "bar", "line", "pie", "kpi"

      // The exact SQL query generated by the AI for transparency
      "generatedSql": "SELECT w.TreatmentType, AVG(w.HealingRate) FROM Wounds w GROUP BY w.TreatmentType;",

      // The dataset returned from executing the query
      "data": [
        { "TreatmentType": "Compression Bandage", "HealingRate": 0.5 },
        { "TreatmentType": "Simple Bandage", "HealingRate": 0.2 }
      ]
    }
    ```

- **Response (`400 Bad Request`):**
  - If the request body is missing required fields.
- **Response (`500 Internal Server Error`):**
  - If the AI API call fails, or if the generated SQL query fails to execute on the database.
- **Backend Logic:**
  1.  Construct a highly specific prompt for the Claude API, including:
      - The `databaseSchemaContext` (a simplified text description of relevant tables and columns).
      - The `assessmentFormDefinition` (for context on field names and options).
      - The user's `question`.
      - The optional `patientId` if present.
      - Instructions to return a single, executable MS SQL query AND a suggested `chartType`.
  2.  Call the Claude API and parse the response to extract the SQL and chart type.
  3.  **Safety Step:** Perform a basic sanitization check on the returned SQL (e.g., ensure it only contains `SELECT` statements).
  4.  Connect to the database.
  5.  Execute the AI-generated SQL query.
  6.  Format the database result, the SQL string, and the chart type into the final JSON response.

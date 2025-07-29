# AI-Powered Incremental Query & Chart Generation Workflow

## 1. Why We Are Implementing This Idea

We are implementing this incremental funnel approach to AI-generated queries to create a more reliable, maintainable, and intuitive user experience for generating complex data insights. The goal is to empower users by giving them granular control over query construction, providing validation at each step, and significantly reducing the risk and complexity associated with generating large, fragile SQL scripts.

## 2. Problems We Are Trying to Solve

- **Fragile SQL Queries:** AI-generated SQL scripts are complex and brittle, often requiring significant manual debugging.
- **Lack of Granular Control:** Users have minimal opportunity to validate intermediate steps, resulting in low transparency and increased risk of incorrect data.
- **Ambiguous or Complex Questions:** AI-generated questions can be vague, overly complex, or difficult to directly translate into SQL queries.

## 3. Benefits

- **Improved Reliability:** Incremental validation minimizes risk and errors.
- **Greater User Transparency:** Users clearly see and control each step, enhancing trust in the generated insights.
- **Easier Maintenance and Debugging:** Simplified stepwise SQL queries enable easier debugging and ongoing maintenance.
- **Enhanced User Experience:** Clearer user flow and granular steps make complex query generation intuitive and accessible.

## 4. Future Improvements

- Template-based SQL query generation.
- Enhanced AI optimization tools for query performance.
- Human-in-the-loop validation for critical queries.
- Automated data-quality checks.
- Expanded visualization options and interactive dashboards.

## 5. Workflow Diagram

```plaintext
Assessment Form Selected
           |
   Load Form Fields
           |
 Analyse with AI Button
           |
Generate Insight Questions
           |
 Select Question
           |
 Patient-Specific? --- Yes ---> Select Patient
           |                   |
           No <-----------------
           |
Generate Sub-Questions (AI API)
           |
 Display Funnel UI Panels
           |
[Iteratively for each panel:]
   - Edit/Confirm Question
   - Generate Query (AI API)
   - Edit Query
   - Run Query & Display Data
           |
Final Panel Generated
           |
Generate Chart
           |
   Chart Generation Page
           |
Recommend Chart Type (AI API)
           |
Map Fields to Chart Components
           |
    View Final Chart
```

## 6. UI Flow Diagram for AI-Generated UI

```plaintext
[Assessment Form Selection] --> [Form Fields Display] --> [AI Insight Generation Button]
                                      |
                          [Insight Question List]
                                      |
                          [Select Insight Question]
                                      |
                          [Patient Selection Dialog (Optional)]
                                      |
                          [Generate Funnel UI Panels Horizontally]
    -------------------------------------------------------------------------------------------
    | Panel 1 | Panel 2 | Panel 3 | ... | Final Panel (Question Result)                        |
    |---------|---------|---------|-----|------------------------------------------------------|
    | Question | Question | Question |...| Original Question                                    |
    | SQL Query | SQL Query | SQL Query |...| Final SQL Query                                   |
    | Data Table | Data Table | Data Table |...| Final Data Table                               |
    -------------------------------------------------------------------------------------------
                                      |
                            [Generate Chart Button]
                                      |
                          [Chart Generation Interface]
                                      |
                          [AI Recommended Chart Type]
                                      |
                          [Field-to-Chart Mapping UI]
                                      |
                               [View Chart]
```

## 7. API Documents

### `POST /api/generate-subquestions`

- **Request:**

```json
{
  "question": "Original question selected",
  "formDefinition": {...}
}
```

- **Response:**

```json
{
  "subquestions": [
    "Simplified question 1",
    "Simplified question 2",
    "Simplified question N"
  ]
}
```

### `POST /api/generate-query`

- **Request:**

```json
{
  "question": "Simplified question",
  "formDefinition": {...},
  "databaseSchema": {...}
}
```

- **Response:**

```json
{
  "sqlQuery": "SELECT * FROM table WHERE condition"
}
```

### `POST /api/run-query`

- **Request:**

```json
{
  "sqlQuery": "Generated SQL Query"
}
```

- **Response:**

```json
{
  "data": [
    { "column1": "value", "column2": "value" },
    { "column1": "value", "column2": "value" }
  ]
}
```

### `POST /api/recommend-chart`

- **Request:**

```json
{
  "dataSample": [{ "column1": "value", "column2": "value" }]
}
```

- **Response:**

```json
{
  "chartType": "Line Chart",
  "recommendedFields": { "x": "column1", "y": "column2" }
}
```

## 8. System Prompts for AI Relevant Steps

### Sub-Question Generation Prompt

```
You are given an original question about patient wound assessment data and a form definition with detailed fields. Decompose the original question into simpler, incremental analytical questions that can be answered step-by-step to ultimately answer the original question.

Original Question: "{original_question}"
Form Definition: {form_definition}

Provide each sub-question clearly and concisely.
```

### SQL Query Generation Prompt

```
Generate a simple, clear, and efficient SQL query based on the following analytical question. Utilize the provided form definition and database schema to identify correct table names, column names, and join conditions.

Analytical Question: "{simplified_question}"
Form Definition: {form_definition}
Database Schema: {database_schema}

Ensure the query is optimized and easy to validate.
```

### Chart Type Recommendation Prompt

```
Given the following data sample, recommend the most suitable chart type (e.g., bar chart, line chart, pie chart, etc.) and clearly specify which fields map to chart axes or components.

Data Sample: {data_sample}

Provide your recommendation as follows:
Chart Type: [Recommended Chart Type]
Fields Mapping:
- X-axis: [Field]
- Y-axis: [Field]
```

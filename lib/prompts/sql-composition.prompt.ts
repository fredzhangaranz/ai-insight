export const SQL_COMPOSITION_EXAMPLES = `
**Example 1 - Filter refinement:**
Previous Q: "Show patients with wounds"
Previous SQL: SELECT * FROM Patient WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = Patient.id)
Current Q: "Which ones have infections?"
Strategy: CTE
Output SQL:
WITH previous_result AS (
  SELECT * FROM Patient WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = Patient.id)
)
SELECT * FROM previous_result
WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = previous_result.id AND infected = 1)

**Example 2 - Aggregation on previous:**
Previous Q: "Show female patients"
Previous SQL: SELECT * FROM Patient WHERE gender = 'Female'
Current Q: "What's their average age?"
Strategy: CTE
Output SQL:
WITH previous_result AS (
  SELECT * FROM Patient WHERE gender = 'Female'
)
SELECT AVG(age) as average_age FROM previous_result

**Example 3 - Fresh query:**
Previous Q: "Show patients older than 60"
Previous SQL: SELECT * FROM Patient WHERE age > 60
Current Q: "How many clinics are there?"
Strategy: Fresh
Output SQL:
SELECT COUNT(*) as clinic_count FROM Clinic
`;

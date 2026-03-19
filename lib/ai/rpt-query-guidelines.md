# rpt Schema Query Guidelines

## CRITICAL: How to Query Wound State

The 'Wound State' (e.g., 'Open', 'Healed', 'Closed') is a special attribute and **MUST NOT** be queried from the `rpt.Note` table. It has its own dedicated tables: `rpt.WoundState` and `rpt.WoundStateType`.

To find wounds in a specific state, you must join `rpt.Wound` with `rpt.WoundState` and `rpt.WoundStateType`.

### Correct Query Pattern for Wound State

To get all wounds that are currently in an 'Open' state:

**✅ CORRECT:**

```sql
SELECT w.*
FROM rpt.Wound w
JOIN rpt.WoundState ws ON w.id = ws.woundFk AND ws.isCurrentState = 1
JOIN rpt.WoundStateType wst ON ws.woundStateTypeFk = wst.id AND wst.name = 'Open';
```

**❌ INCORRECT (Do NOT do this):**

```sql
-- This is wrong because 'Wound State' is not in the Note table.
SELECT * FROM rpt.Note N JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id WHERE AT.name = 'Wound State' AND N.value = 'Open';
```

## Query Guidelines and Best Practices

### 1. Form Field Data Access (rpt.Note)

```sql
-- ✅ CORRECT: Using proper joins and indexes
SELECT A.*, N.value
FROM rpt.Assessment A
JOIN rpt.Note N ON A.id = N.assessmentFk
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Etiology';

-- ❌ INCORRECT: Avoid subqueries for basic joins
SELECT * FROM rpt.Assessment A WHERE A.id IN (
    SELECT assessmentFk FROM rpt.Note WHERE attributeTypeFk IN (
        SELECT id FROM rpt.AttributeType WHERE name = 'Etiology'
    )
);
```

### 2. Date-Based Queries

```sql
-- ✅ CORRECT: Using DimDate for efficient date filtering
SELECT A.*, D.month, D.year
FROM rpt.Assessment A
JOIN rpt.DimDate D ON A.dimDateFk = D.id
WHERE D.year = 2023 AND D.month = 6;

-- ❌ INCORRECT: Avoid date functions on indexed columns
SELECT * FROM rpt.Assessment
WHERE YEAR(date) = 2023 AND MONTH(date) = 6;
```

### 3. Aggregation Guidelines

```sql
-- ✅ CORRECT: Proper grouping with multiple joins
SELECT
    AT.name as attributeName,
    N.value,
    COUNT(*) as count,
    AVG(M.area) as avgArea
FROM rpt.Assessment A
JOIN rpt.Note N ON A.id = N.assessmentFk
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id
LEFT JOIN rpt.Measurement M ON A.id = M.assessmentFk
GROUP BY AT.name, N.value;
```

### 4. Performance Considerations

1. **Indexed Columns** (Use these for filtering and joining):

   - All Primary Keys (id columns)
   - All Foreign Keys (\*Fk columns)
   - rpt.Assessment.date
   - rpt.Note.value
   - rpt.AttributeType.name
   - rpt.DimDate columns

2. **Large Table Warning**:

   - rpt.Note: Contains individual form responses
   - rpt.Measurement: Contains quantitative measurements
   - rpt.Assessment: Contains assessment headers
   - Consider using LIMIT/TOP for large result sets

3. **Common Data Types**:
   - Dates: datetimeoffset or datetime
   - IDs: uniqueidentifier
   - Numeric values: decimal for measurements
   - Text values: nvarchar for multilingual support

### 5. Common Analysis Patterns

0. **Simple Counts** (Use these for basic "how many" questions):

```sql
-- Count all patients
SELECT COUNT(*) FROM rpt.Patient;

-- Count all units (clinics/facilities)
SELECT COUNT(*) FROM rpt.Unit;

-- Count all wounds
SELECT COUNT(*) FROM rpt.Wound;

-- Count all assessments
SELECT COUNT(*) FROM rpt.Assessment;

-- List all patients
SELECT * FROM rpt.Patient;

-- List all units with their names
SELECT id, name FROM rpt.Unit;
```

**IMPORTANT:** For simple count queries (e.g., "how many patients", "how many units"), always query the main table directly. Do NOT join to other tables or add WHERE clauses unless the user explicitly requests filtering.

1. **Trend Analysis**:

```sql
SELECT
    D.year,
    D.month,
    COUNT(DISTINCT A.id) as assessmentCount,
    COUNT(DISTINCT A.patientFk) as patientCount
FROM rpt.Assessment A
JOIN rpt.DimDate D ON A.dimDateFk = D.id
GROUP BY D.year, D.month
ORDER BY D.year, D.month;
```

2. **Patient-Specific Analysis**:

```sql
SELECT
    P.id as patientId,
    COUNT(DISTINCT W.id) as woundCount,
    MAX(A.date) as lastAssessmentDate
FROM rpt.Patient P
LEFT JOIN rpt.Wound W ON P.id = W.patientFk
LEFT JOIN rpt.Assessment A ON P.id = A.patientFk
WHERE P.id = @patientId
GROUP BY P.id;
```

3. **Wound Progression**:

```sql
SELECT
    W.id as woundId,
    W.anatomyLabel,
    A.date,
    M.area,
    M.depth,
    WS.isCurrentState
FROM rpt.Wound W
JOIN rpt.Assessment A ON W.id = A.woundFk
JOIN rpt.Measurement M ON A.id = M.assessmentFk
JOIN rpt.WoundState WS ON W.id = WS.woundFk
ORDER BY W.id, A.date;
```

### 6. Value Type Handling in rpt.Note

The Note table uses different columns based on data type:

- `value`: String values (e.g., 'Diabetic', 'Severe')
- `valueInt`: Integer values
- `valueDecimal`: Decimal values
- `valueDate`: Date values
- `valueBoolean`: Boolean values

Example:

```sql
SELECT
    CASE AT.dataType
        WHEN 1 THEN N.value
        WHEN 2 THEN CAST(N.valueInt AS varchar)
        WHEN 3 THEN CAST(N.valueDecimal AS varchar)
        WHEN 4 THEN CAST(N.valueDate AS varchar)
        WHEN 5 THEN CAST(N.valueBoolean AS varchar)
    END as answer
FROM rpt.Note N
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id;
```

### 7. Common Attribute Types

Frequently used AttributeType.name values:

- 'Etiology'
- 'Exudate Amount'
- 'Tissue Type'
- 'Infection Status'
- 'Treatment Applied'
- 'Pain Level'

### 8. Data Validation Rules

1. Assessment dates must be:

   - Not in the future
   - After the wound.baselineDate (if wound-specific)
   - Within the patient's admission period

2. Measurements must be:

   - Non-negative values
   - Within reasonable ranges for the measurement type

3. Notes must have:
   - Matching data type with their AttributeType
   - Valid foreign keys
   - Non-null values for required fields

### 9. Query Optimization Tips

1. **Use Covering Indexes**:

   - Include commonly queried columns
   - Consider filtered indexes for specific conditions

2. **Avoid Common Pitfalls**:

   - Don't use functions on indexed columns
   - Avoid SELECT \* in production
   - Use appropriate JOIN types (INNER vs LEFT)

3. **Parameter Usage**:
   - Always use parameters for dynamic values
   - Consider OPTION (RECOMPILE) for highly variable parameters
   - Use appropriate parameter data types

Here is the database schema you must use to answer the user's questions.

### Table Definitions

**Table `rpt.Assessment` (The main record of a clinical assessment)**

- `id` (uniqueidentifier) - Primary Key
- `patientFk` (uniqueidentifier) - Links to rpt.Patient
- `woundFk` (uniqueidentifier) - Links to rpt.Wound
- `date` (datetimeoffset) - The exact date and time of the assessment
- `assessmentTypeVersionFk` (uniqueidentifier) - Links to the specific form version used

**Table `rpt.Patient` (Information about patients)**

- `id` (uniqueidentifier) - Primary Key
- `firstName` (string)
- `lastName` (string)
- `dateOfBirth` (datetime)
- `gender` (string)

**Table `rpt.Wound` (Information about specific wounds on a patient)**

- `id` (uniqueidentifier) - Primary Key
- `patientFk` (uniqueidentifier) - Links to rpt.Patient
- `anatomyLabel` (string) - The location of the wound (e.g., "Left Heel")
- `baselineDate` (datetime) - The date the wound was first recorded

**Table `rpt.Measurement` (Quantitative data from an assessment)**

- `id` (uniqueidentifier) - Primary Key
- `assessmentFk` (uniqueidentifier) - Links to rpt.Assessment
- `area` (float)
- `perimeter` (float)
- `depth` (float)
- `volume` (float)
- `length` (float)
- `width` (float)

**Table `rpt.Note` (Stores the answers to individual form questions)**

- `id` (uniqueidentifier) - Primary Key
- `assessmentFk` (uniqueidentifier) - Links to the parent rpt.Assessment
- `attributeTypeFk` (uniqueidentifier) - Links to the specific question being answered (rpt.AttributeType)
- `value` (string) - The text value for the answer (e.g., 'Diabetic', 'Cellulitis')
- `valueInt` (number)
- `valueDecimal` (number)
- `valueDate` (datetime)
- `valueBoolean` (boolean)

**Table `rpt.AttributeType` (Defines the questions on a form)**

- `id` (uniqueidentifier) - Primary Key
- `name` (string) - The user-visible name of the form field (e.g., "Etiology", "Exudate Type")
- `variableName` (string) - A system name for the field
- `dataType` (number) - The type of data stored

---

### Crucial Querying Instructions

**1. How to Query Form Field Data:**
The `rpt.Note` table is the most important table for filtering. It stores the answers to your form questions in a key-value format. To find data for a specific question, you MUST join `rpt.Note` with `rpt.AttributeType`.

**Example:** To find all assessments for "Diabetic" wounds, you would write a query like this:

```sql
SELECT A.*
FROM rpt.Assessment A
JOIN rpt.Note N ON A.id = N.assessmentFk
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Etiology' AND N.value = 'Diabetic';
```

**2. How to Query Measurement Data:**
The `rpt.Measurement` table contains all quantitative data like wound area and volume. Always join it back to `rpt.Assessment` using `assessmentFk`.

**3. Date Filtering:**
For filtering by date, always use the `date` column from the `rpt.Assessment` table.

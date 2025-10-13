# Semantic Layer: API Specification

**Version:** 1.0  
**Last Updated:** 2025-10-12  
**Base URL:** `http://localhost:3005/api`

---

## Table of Contents

1. [Customer Management](#customer-management)
2. [Semantic Layer Operations](#semantic-layer-operations)
3. [Demo Data Management](#demo-data-management)
4. [Schema Version Management](#schema-version-management)
5. [Error Responses](#error-responses)

---

## Customer Management

### Import Customer Forms

Import customer form configurations from Silhouette XML exports.

**Endpoint:** `POST /api/customers/import-forms`

**Request:**

```json
{
  "customerName": "St. Mary's Hospital",
  "customerCode": "STMARYS",
  "silhouetteVersion": "5.1",
  "deploymentType": "on_prem",
  "xmlFiles": [
    {
      "filename": "wound-assessment-v3.xml",
      "content": "<base64-encoded-xml>"
    },
    {
      "filename": "treatment-log-v2.xml",
      "content": "<base64-encoded-xml>"
    }
  ],
  "generateSemantics": true,
  "generateDemoData": false
}
```

**Response (202 Accepted):**

```json
{
  "customerId": "a7f3c8e2-4d5e-4f7a-8b9c-1d2e3f4a5b6c",
  "customerCode": "STMARYS",
  "status": "processing",
  "message": "Import started",
  "jobId": "import-job-12345",
  "formsQueued": 2,
  "estimatedTime": "2-5 minutes"
}
```

**Response (200 OK - when complete):**

```json
{
  "customerId": "a7f3c8e2-4d5e-4f7a-8b9c-1d2e3f4a5b6c",
  "customerCode": "STMARYS",
  "status": "completed",
  "formsImported": 2,
  "fieldsTotal": 247,
  "semanticsMapped": 212,
  "semanticsConfidence": 0.89,
  "forms": [
    {
      "formId": "uuid",
      "formName": "Wound Assessment",
      "fieldCount": 145,
      "semanticsMapped": 132,
      "averageConfidence": 0.91
    },
    {
      "formId": "uuid",
      "formName": "Treatment Log",
      "fieldCount": 102,
      "semanticsMapped": 80,
      "averageConfidence": 0.86
    }
  ],
  "warnings": [
    "15 fields could not be mapped with high confidence (review recommended)"
  ]
}
```

---

### List Customers

Retrieve all registered customers.

**Endpoint:** `GET /api/customers`

**Query Parameters:**

- `active` (boolean, optional): Filter by active status
- `version` (string, optional): Filter by Silhouette version
- `includeStats` (boolean, default: false): Include form and query statistics

**Response (200 OK):**

```json
{
  "customers": [
    {
      "id": "uuid",
      "name": "St. Mary's Hospital",
      "code": "STMARYS",
      "silhouetteVersion": "5.1",
      "deploymentType": "on_prem",
      "isActive": true,
      "importedAt": "2024-10-01T10:30:00Z",
      "lastUpdated": "2024-10-05T14:22:00Z",
      "formCount": 12,
      "queryCount": 47,
      "demoDataGenerated": true
    },
    {
      "id": "uuid",
      "name": "Regional Health",
      "code": "REGIONAL",
      "silhouetteVersion": "5.0",
      "deploymentType": "cloud",
      "isActive": true,
      "importedAt": "2024-09-15T09:00:00Z",
      "lastUpdated": "2024-09-20T16:45:00Z",
      "formCount": 8,
      "queryCount": 23,
      "demoDataGenerated": false
    }
  ],
  "total": 2
}
```

---

### Get Customer Details

Retrieve detailed information about a specific customer.

**Endpoint:** `GET /api/customers/:code`

**Path Parameters:**

- `code` (string): Customer code (e.g., "STMARYS")

**Response (200 OK):**

```json
{
  "id": "uuid",
  "name": "St. Mary's Hospital",
  "code": "STMARYS",
  "silhouetteVersion": "5.1",
  "deploymentType": "on_prem",
  "region": "North America",
  "isActive": true,
  "importedAt": "2024-10-01T10:30:00Z",
  "lastUpdated": "2024-10-05T14:22:00Z",
  "schemaVerifiedAt": "2024-10-01T11:15:00Z",
  "forms": [
    {
      "id": "uuid",
      "name": "Wound Assessment",
      "version": 3,
      "fieldCount": 145,
      "importedAt": "2024-10-01T10:35:00Z",
      "semanticsMapped": true,
      "semanticsConfidence": 0.91
    },
    {
      "id": "uuid",
      "name": "Treatment Log",
      "version": 2,
      "fieldCount": 102,
      "importedAt": "2024-10-01T10:38:00Z",
      "semanticsMapped": true,
      "semanticsConfidence": 0.86
    }
  ],
  "demoData": {
    "generated": true,
    "generatedAt": "2024-10-01T12:00:00Z",
    "patientCount": 100,
    "woundCount": 187,
    "assessmentCount": 1543
  },
  "queryHistory": {
    "totalQueries": 47,
    "validatedQueries": 42,
    "successRate": 0.89
  }
}
```

---

### Get Customer Forms

Retrieve forms for a specific customer.

**Endpoint:** `GET /api/customers/:code/forms`

**Query Parameters:**

- `includeDefinition` (boolean, default: false): Include full form definition JSON
- `includeSemantics` (boolean, default: false): Include semantic mappings

**Response (200 OK):**

```json
{
  "customerCode": "STMARYS",
  "forms": [
    {
      "id": "uuid",
      "silhouetteFormId": "uuid",
      "name": "Wound Assessment",
      "version": 3,
      "fieldCount": 145,
      "fieldSummary": {
        "Etiology": "SingleSelect",
        "Exudate Amount": "SingleSelect",
        "Tissue Type": "MultiSelect",
        "Pain Level": "Numeric"
      },
      "importedAt": "2024-10-01T10:35:00Z",
      "sourceFile": "wound-assessment-v3.xml"
    }
  ]
}
```

---

## Semantic Layer Operations

### Discover Context

Perform agentic context discovery for a user question.

**Endpoint:** `POST /api/semantic/discover-context`

**Request:**

```json
{
  "question": "What's the average healing rate for diabetic wounds over the last 6 months?",
  "customerCode": "STMARYS",
  "includeIntent": true,
  "includeRelevantForms": true,
  "includeTerminologyMapping": true
}
```

**Response (200 OK):**

```json
{
  "question": "What's the average healing rate for diabetic wounds over the last 6 months?",
  "customerCode": "STMARYS",
  "customerName": "St. Mary's Hospital",

  "intent": {
    "type": "outcome_analysis",
    "scope": "patient_cohort",
    "metrics": ["healing_rate"],
    "filters": [
      {
        "concept": "wound_classification",
        "value": "diabetic_ulcer"
      },
      {
        "concept": "time_range",
        "value": "6_months"
      }
    ],
    "confidence": 0.94,
    "reasoning": "User is asking for a quantitative outcome metric (healing rate) filtered by wound type (diabetic) and time period (6 months)"
  },

  "relevantForms": [
    {
      "formId": "uuid",
      "formName": "Wound Assessment",
      "relevanceScore": 0.92,
      "reason": "Contains etiology field for diabetic wound classification",
      "requiredFields": [
        {
          "fieldName": "Etiology",
          "semanticConcept": "wound_classification",
          "confidence": 0.95
        }
      ]
    },
    {
      "formId": "uuid",
      "formName": "Measurement Data",
      "relevanceScore": 0.88,
      "reason": "Contains area measurements for calculating healing rate",
      "requiredTables": ["rpt.Measurement"]
    }
  ],

  "terminologyMappings": [
    {
      "userTerm": "diabetic wounds",
      "semanticConcept": "wound_classification:diabetic_ulcer",
      "customerFieldName": "Etiology",
      "customerFieldValue": "Diabetic Foot Ulcer",
      "confidence": 0.98,
      "formName": "Wound Assessment"
    },
    {
      "userTerm": "healing rate",
      "semanticConcept": "outcome_metrics:healing_rate",
      "calculation": "(initial_area - current_area) / days_elapsed",
      "dataSources": ["rpt.Measurement.area", "rpt.Assessment.date"],
      "confidence": 1.0
    },
    {
      "userTerm": "last 6 months",
      "semanticConcept": "time_range",
      "sqlExpression": "a.date >= DATEADD(month, -6, GETDATE())",
      "confidence": 1.0
    }
  ],

  "joinPaths": [
    {
      "path": "Patient → Wound → Assessment → Note",
      "reason": "Access etiology from assessment notes"
    },
    {
      "path": "Wound → Assessment → Measurement",
      "reason": "Access area measurements over time"
    }
  ],

  "recommendedSubQuestions": [
    "Identify all diabetic wounds from assessment etiology",
    "Get measurement history for these wounds in last 6 months",
    "Calculate healing rate per wound",
    "Compute average healing rate"
  ]
}
```

---

### Map Terminology

Map user terminology to customer-specific field values.

**Endpoint:** `POST /api/semantic/map-terminology`

**Request:**

```json
{
  "terms": ["diabetic", "venous ulcer", "compression therapy"],
  "customerCode": "STMARYS",
  "conceptTypes": ["wound_classification", "treatment_intervention"]
}
```

**Response (200 OK):**

```json
{
  "customerCode": "STMARYS",
  "mappings": [
    {
      "inputTerm": "diabetic",
      "semanticConcept": "wound_classification:diabetic_ulcer",
      "customerFieldName": "Etiology",
      "customerFieldValue": "Diabetic Foot Ulcer",
      "formName": "Wound Assessment",
      "confidence": 0.98,
      "alternatives": [
        {
          "value": "Diabetes-Related Wound",
          "confidence": 0.85
        }
      ]
    },
    {
      "inputTerm": "venous ulcer",
      "semanticConcept": "wound_classification:venous_ulcer",
      "customerFieldName": "Etiology",
      "customerFieldValue": "Venous Leg Ulcer",
      "formName": "Wound Assessment",
      "confidence": 0.96
    },
    {
      "inputTerm": "compression therapy",
      "semanticConcept": "treatment_intervention:compression_therapy",
      "customerFieldName": "Treatment Type",
      "customerFieldValue": "Compression Bandaging",
      "formName": "Treatment Log",
      "confidence": 0.92
    }
  ],
  "unmappedTerms": []
}
```

---

### Search Clinical Ontology

Search for clinical concepts by semantic similarity.

**Endpoint:** `GET /api/semantic/ontology/search`

**Query Parameters:**

- `query` (string, required): Search query
- `conceptType` (string, optional): Filter by concept type
- `limit` (integer, default: 10): Maximum results

**Response (200 OK):**

```json
{
  "query": "diabetic foot wound",
  "results": [
    {
      "conceptName": "diabetic_ulcer",
      "canonicalName": "Diabetic Ulcer",
      "conceptType": "classification",
      "similarity": 0.94,
      "synonyms": ["Diabetic Foot Ulcer", "DFU", "Diabetic Wound"],
      "description": "Ulcers resulting from diabetic complications",
      "prevalence": 0.35
    },
    {
      "conceptName": "neuropathic_ulcer",
      "canonicalName": "Neuropathic Ulcer",
      "conceptType": "classification",
      "similarity": 0.78,
      "synonyms": ["Nerve Damage Ulcer"],
      "description": "Ulcers caused by peripheral neuropathy"
    }
  ]
}
```

---

## Demo Data Management

### Generate Demo Data

Generate synthetic demo data for a customer.

**Endpoint:** `POST /api/demo-data/generate`

**Request:**

```json
{
  "customerCode": "STMARYS",
  "config": {
    "patientCount": 100,
    "woundsPerPatient": {
      "min": 1,
      "max": 3
    },
    "assessmentsPerWound": {
      "min": 5,
      "max": 15
    },
    "timeRange": {
      "start": "2023-01-01",
      "end": "2024-12-31"
    }
  },
  "replaceExisting": false
}
```

**Response (202 Accepted):**

```json
{
  "customerCode": "STMARYS",
  "status": "generating",
  "jobId": "demo-gen-67890",
  "estimatedTime": "3-7 minutes",
  "message": "Demo data generation started"
}
```

**Response (200 OK - when complete):**

```json
{
  "customerCode": "STMARYS",
  "status": "completed",
  "statistics": {
    "patientsGenerated": 100,
    "woundsGenerated": 187,
    "assessmentsGenerated": 1543,
    "notesGenerated": 38122,
    "measurementsGenerated": 1543,
    "attributeTypesGenerated": 247
  },
  "timeRange": {
    "start": "2023-01-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "generatedAt": "2024-10-12T15:30:00Z",
  "generationTime": "4m 32s"
}
```

---

### Get Demo Data Statistics

Retrieve statistics about customer's demo data.

**Endpoint:** `GET /api/demo-data/:customerCode/stats`

**Response (200 OK):**

```json
{
  "customerCode": "STMARYS",
  "customerName": "St. Mary's Hospital",
  "generated": true,
  "statistics": {
    "patients": 100,
    "wounds": 187,
    "assessments": 1543,
    "notes": 38122,
    "measurements": 1543,
    "attributeTypes": 247
  },
  "timeRange": {
    "start": "2023-01-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "generatedAt": "2024-10-12T15:30:00Z",
  "lastValidated": "2024-10-12T16:00:00Z",
  "integrity": {
    "valid": true,
    "checks": {
      "missingCustomerCodes": 0,
      "orphanedRecords": 0,
      "invalidDates": 0
    }
  }
}
```

---

### Validate SQL

Validate SQL query against customer's demo data.

**Endpoint:** `POST /api/demo-data/validate-sql`

**Request:**

```json
{
  "customerCode": "STMARYS",
  "sql": "SELECT TOP 10 etiology, COUNT(*) as count FROM rpt.Note n JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id WHERE at.name = 'Etiology' AND n.customerCode = 'STMARYS' GROUP BY etiology ORDER BY count DESC",
  "execute": true,
  "returnResults": true
}
```

**Response (200 OK):**

```json
{
  "customerCode": "STMARYS",
  "isValid": true,
  "validation": {
    "syntaxValid": true,
    "tablesExist": true,
    "columnsExist": true,
    "customerFieldsValid": true,
    "executionSuccessful": true
  },
  "execution": {
    "rowCount": 10,
    "executionTime": 45,
    "results": [
      {
        "etiology": "Diabetic Foot Ulcer",
        "count": 532
      },
      {
        "etiology": "Venous Leg Ulcer",
        "count": 398
      },
      {
        "etiology": "Pressure Injury - Stage 2",
        "count": 287
      }
    ]
  },
  "warnings": [],
  "suggestions": [
    "Consider adding index on rpt.Note.customerCode for better performance"
  ]
}
```

**Response (400 Bad Request - validation failed):**

```json
{
  "customerCode": "STMARYS",
  "isValid": false,
  "validation": {
    "syntaxValid": true,
    "tablesExist": true,
    "columnsExist": false,
    "errors": [
      {
        "type": "column_not_found",
        "message": "Column 'rpt.Note.etiologyValue' does not exist",
        "suggestion": "Did you mean 'rpt.Note.value'?"
      }
    ]
  },
  "execution": null
}
```

---

### Cleanup Demo Data

Remove demo data for a customer.

**Endpoint:** `DELETE /api/demo-data/:customerCode`

**Response (200 OK):**

```json
{
  "customerCode": "STMARYS",
  "status": "deleted",
  "recordsDeleted": {
    "patients": 100,
    "wounds": 187,
    "assessments": 1543,
    "notes": 38122,
    "measurements": 1543,
    "attributeTypes": 247
  },
  "message": "Demo data cleaned up successfully"
}
```

---

## Schema Version Management

### List Schema Versions

Get all registered Silhouette schema versions.

**Endpoint:** `GET /api/schema-versions`

**Query Parameters:**

- `supported` (boolean, optional): Filter by support status
- `latest` (boolean, optional): Get only latest version

**Response (200 OK):**

```json
{
  "versions": [
    {
      "version": "6.0",
      "majorVersion": 6,
      "minorVersion": 0,
      "releasedAt": "2025-01-15",
      "isLatest": true,
      "isSupported": true,
      "breakingChanges": ["assessmentTypeVersionFk renamed to formVersionFk"],
      "customerCount": 0
    },
    {
      "version": "5.1",
      "majorVersion": 5,
      "minorVersion": 1,
      "releasedAt": "2024-06-01",
      "isLatest": false,
      "isSupported": true,
      "breakingChanges": [],
      "customerCount": 3
    },
    {
      "version": "5.0",
      "majorVersion": 5,
      "minorVersion": 0,
      "releasedAt": "2023-01-15",
      "isLatest": false,
      "isSupported": true,
      "breakingChanges": [],
      "customerCount": 5
    }
  ]
}
```

---

### Get Schema Version Details

Get detailed schema information for a specific version.

**Endpoint:** `GET /api/schema-versions/:version`

**Response (200 OK):**

```json
{
  "version": "5.1",
  "majorVersion": 5,
  "minorVersion": 1,
  "releasedAt": "2024-06-01",
  "endOfSupport": "2026-06-01",
  "isLatest": false,
  "isSupported": true,
  "changelog": "Added statusFk and auditTrailJson columns to rpt.Assessment",
  "breakingChanges": [],
  "migrationNotes": "New columns are nullable, no data migration required",
  "customerCount": 3,
  "customers": ["STMARYS", "REGIONAL", "METRO"],
  "schemaDefinition": {
    "tables": {
      "rpt.Assessment": {
        "columns": {
          "date": {
            "type": "datetimeoffset",
            "nullable": false
          },
          "assessmentTypeVersionFk": {
            "type": "uniqueidentifier",
            "nullable": false
          },
          "statusFk": {
            "type": "uniqueidentifier",
            "nullable": true,
            "addedInVersion": "5.1"
          }
        }
      }
    }
  }
}
```

---

### Detect Schema Changes

Analyze schema changes between versions.

**Endpoint:** `POST /api/schema-versions/detect-changes`

**Request:**

```json
{
  "fromVersion": "5.0",
  "toVersion": "5.1",
  "connectionString": "Server=...;Database=...;(optional for live detection)"
}
```

**Response (200 OK):**

```json
{
  "fromVersion": "5.0",
  "toVersion": "5.1",
  "changesDetected": true,
  "summary": {
    "tablesAdded": 0,
    "tablesRemoved": 0,
    "tablesModified": 1,
    "columnsAdded": 2,
    "columnsRemoved": 0,
    "columnsRenamed": 0
  },
  "changes": [
    {
      "type": "column_add",
      "table": "rpt.Assessment",
      "column": "statusFk",
      "dataType": "uniqueidentifier",
      "nullable": true,
      "isBreaking": false
    },
    {
      "type": "column_add",
      "table": "rpt.Assessment",
      "column": "auditTrailJson",
      "dataType": "nvarchar(max)",
      "nullable": true,
      "isBreaking": false
    }
  ],
  "migrationRequired": false,
  "recommendedActions": [
    "Update demo database schema",
    "Regenerate demo data for affected customers",
    "Test existing queries for compatibility"
  ]
}
```

---

### Get Schema Mappings

Get column/table mappings between schema versions.

**Endpoint:** `GET /api/schema-versions/mappings`

**Query Parameters:**

- `fromVersion` (string, required)
- `toVersion` (string, required)

**Response (200 OK):**

```json
{
  "fromVersion": "5.0",
  "toVersion": "6.0",
  "mappings": [
    {
      "type": "column_rename",
      "oldReference": "rpt.Assessment.assessmentTypeVersionFk",
      "newReference": "rpt.Assessment.formVersionFk",
      "isBreaking": true,
      "notes": "Column renamed for clarity"
    }
  ],
  "breakingChangeCount": 1,
  "requiresDataMigration": false
}
```

---

## Error Responses

### Standard Error Format

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "timestamp": "2024-10-12T10:30:00Z",
    "requestId": "req-12345"
  }
}
```

### Common Error Codes

#### 400 Bad Request

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "customerCode": "Required field missing"
    }
  }
}
```

#### 404 Not Found

```json
{
  "error": {
    "code": "CUSTOMER_NOT_FOUND",
    "message": "Customer with code 'INVALID' not found",
    "details": {
      "customerCode": "INVALID"
    }
  }
}
```

#### 409 Conflict

```json
{
  "error": {
    "code": "CUSTOMER_EXISTS",
    "message": "Customer with code 'STMARYS' already exists",
    "details": {
      "existingCustomerId": "uuid",
      "suggestion": "Use PUT to update existing customer"
    }
  }
}
```

#### 500 Internal Server Error

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "details": {
      "errorId": "err-67890"
    }
  }
}
```

#### 503 Service Unavailable

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Demo database connection failed",
    "details": {
      "service": "demo-database",
      "retryAfter": 30
    }
  }
}
```

---

## Authentication

All endpoints require authentication via session cookie or API key.

**Header:**

```
Authorization: Bearer <api-key>
```

**Or Session Cookie:**

```
Cookie: session=<session-id>
```

---

## Rate Limiting

- **Standard endpoints:** 100 requests/minute per user
- **Data generation endpoints:** 10 requests/hour per customer
- **Import endpoints:** 5 requests/hour per user

**Rate Limit Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1697112000
```

---

## Webhooks (Future)

Future support for webhooks on:

- Customer import completion
- Demo data generation completion
- Schema version changes detected

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Pagination uses `page` and `limit` query parameters (default: page=1, limit=50)
- Large responses may be streamed or paginated
- File uploads limited to 10MB per XML file
- Demo data generation is asynchronous (use jobId to check status)

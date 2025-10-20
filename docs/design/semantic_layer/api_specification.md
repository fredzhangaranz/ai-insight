# Semantic Layer: API Specification (v2.0)

**Version:** 2.0 (Revised Architecture)  
**Last Updated:** 2025-10-20  
**Base URL:** `https://{host}/api`

> 🔄 **Major Update:** API surface updated for per-customer Silhouette demo databases, live discovery from `dbo` schema, and demo data generation directly into `dbo.*`.

---

## Table of Contents

1. [Customer Management](#customer-management)  
   1.1 [Create Customer](#create-customer)  
   1.2 [List Customers](#list-customers)  
   1.3 [Get Customer Details](#get-customer-details)  
   1.4 [Update Customer Metadata](#update-customer-metadata)  
   1.5 [Deactivate Customer](#deactivate-customer)  
   1.6 [Test Connection](#test-connection)
2. [Discovery & Semantic Index](#discovery--semantic-index)  
   2.1 [Run Discovery](#run-discovery)  
   2.2 [List Discovery Runs](#list-discovery-runs)  
   2.3 [Get Semantic Index](#get-semantic-index)  
   2.4 [Update Field Review Status](#update-field-review-status)
3. [Context & SQL Operations](#context--sql-operations)  
   3.1 [Discover Context](#discover-context)  
   3.2 [Generate SQL (Template Resolution)](#generate-sql-template-resolution)  
   3.3 [Validate SQL](#validate-sql)
4. [Demo Data Management](#demo-data-management)  
   4.1 [Generate Demo Data](#generate-demo-data)  
   4.2 [Check Generation Status](#check-generation-status)  
   4.3 [Reset Demo Data](#reset-demo-data)
5. [Schema Version Management](#schema-version-management)
6. [Error Responses](#error-responses)
7. [Authentication & Rate Limiting](#authentication--rate-limiting)
8. [Notes & Conventions](#notes--conventions)

---

## 1. Customer Management

### Create Customer

Register a new customer by storing encrypted connection details and metadata. Replaces v1.0 XML import flow.

**Endpoint:** `POST /api/customers`

**Request Body:**

```json
{
  "name": "St. Mary's Hospital",
  "code": "STMARYS",
  "silhouetteVersion": "5.1",
  "deploymentType": "on_prem",
  "connectionString": "Server=demo-sql;Database=SilhouetteDemo;User Id=insightgen;Password=***;",
  "silhouetteWebUrl": "https://silhouette.stmarys.local",
  "notes": "Initial onboarding. Forms imported by IT on 2025-10-15."
}
```

**Response (201 Created):**

```json
{
  "id": "a7f3c8e2-4d5e-4f7a-8b9c-1d2e3f4a5b6c",
  "name": "St. Mary's Hospital",
  "code": "STMARYS",
  "silhouetteVersion": "5.1",
  "deploymentType": "on_prem",
  "connectionStatus": "unknown",
  "connectionLastVerifiedAt": null,
  "lastDiscoveredAt": null,
  "isActive": true,
  "createdAt": "2025-10-20T10:30:00Z"
}
```

**Validation:**

- `code` must be uppercase alphanumeric; duplicates rejected (409).
- `connectionString` encrypted at rest; never returned in responses.

---

### List Customers

**Endpoint:** `GET /api/customers`

**Query Parameters:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| `active` | boolean | Filter by active status |
| `version` | string | Filter by Silhouette version (`5.0`, `6.0`, etc.) |
| `includeStats` | boolean (default `false`) | Include discovery / validation stats |

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
      "connectionStatus": "ok",
      "connectionLastVerifiedAt": "2025-10-20T11:05:00Z",
      "lastDiscoveredAt": "2025-10-20T11:10:32Z",
      "stats": {
        "formsDiscovered": 14,
        "fieldsDiscovered": 327,
        "avgConfidence": 0.88,
        "pendingReview": 12,
        "lastDemoDataGeneratedAt": "2025-10-20T11:25:00Z",
        "lastValidationPassRate": 0.96
      }
    }
  ]
}
```

---

### Get Customer Details

**Endpoint:** `GET /api/customers/{code}`

**Response (200 OK):**

```json
{
  "id": "uuid",
  "name": "St. Mary's Hospital",
  "code": "STMARYS",
  "silhouetteVersion": "5.1",
  "deploymentType": "on_prem",
  "silhouetteWebUrl": "https://silhouette.stmarys.local",
  "connectionStatus": "ok",
  "connectionLastVerifiedAt": "2025-10-20T11:05:00Z",
  "lastDiscoveredAt": "2025-10-20T11:10:32Z",
  "lastDemoDataGeneratedAt": "2025-10-20T11:25:00Z",
  "notes": "Initial onboarding. Forms imported by IT on 2025-10-15."
}
```

---

### Update Customer Metadata

Does not accept raw `connectionString` (use dedicated endpoint below).

**Endpoint:** `PATCH /api/customers/{code}`

**Request Body:**

```json
{
  "silhouetteVersion": "5.2",
  "silhouetteWebUrl": "https://silhouette-v52.stmarys.local",
  "deploymentType": "on_prem",
  "notes": "Customer upgraded to Silhouette 5.2 on 2025-11-01."
}
```

**Response (200 OK):** Updated customer record.

---

### Deactivate Customer

Soft delete; retains history but hides from standard lists.

**Endpoint:** `DELETE /api/customers/{code}`

**Response (204 No Content)**

---

### Test Connection

Validates encrypted connection string by attempting to connect and checking basic schema existence.

**Endpoint:** `POST /api/customers/{code}/test-connection`

**Request Body (optional override):**

```json
{
  "connectionString": "Server=...;Database=...;User Id=...;Password=...;"
}
```

**Response (200 OK):**

```json
{
  "status": "ok",
  "silhouetteVersionDetected": "5.1",
  "verifiedAt": "2025-10-20T11:05:03Z",
  "details": {
    "dboTablesDetected": 128,
    "rptTablesDetected": 94
  }
}
```

**Failure Response (503 Service Unavailable):**

```json
{
  "status": "failed",
  "error": {
    "code": "CONNECTION_FAILED",
    "message": "Login failed for user 'insightgen'.",
    "details": {
      "attemptedAt": "2025-10-20T11:05:03Z"
    }
  }
}
```

---

## 2. Discovery & Semantic Index

### Run Discovery

Queries the customer’s `dbo` schema to discover forms (`AttributeSet`), fields (`AttributeType`), and options (`AttributeLookup`). Generates semantic mappings and stores them in the semantic index tables.

**Endpoint:** `POST /api/customers/{code}/discover`

**Request Body (optional settings):**

```json
{
  "force": false,
  "maxForms": 100,
  "confidenceThreshold": 0.7
}
```

**Response (202 Accepted):**

```json
{
  "discoveryRunId": "34c9d849-8b33-4a3a-9d6d-14c7fad31087",
  "status": "running",
  "message": "Discovery started. This may take 1-3 minutes."
}
```

**Completion Response (via polling discovery runs):**

```json
{
  "discoveryRunId": "34c9d849-8b33-4a3a-9d6d-14c7fad31087",
  "status": "succeeded",
  "formsDiscovered": 14,
  "fieldsDiscovered": 327,
  "avgConfidence": 0.88,
  "warnings": [
    "12 fields flagged for review (confidence < 0.7)"
  ],
  "completedAt": "2025-10-20T11:10:32Z"
}
```

---

### List Discovery Runs

**Endpoint:** `GET /api/customers/{code}/discover/runs`

**Query Parameters:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| `limit` | integer (default 10) | Number of runs to return |
| `status` | string | Filter by `running`, `succeeded`, `failed` |

**Response (200 OK):**

```json
{
  "runs": [
    {
      "id": "34c9d849-8b33-4a3a-9d6d-14c7fad31087",
      "status": "succeeded",
      "startedAt": "2025-10-20T11:09:01Z",
      "completedAt": "2025-10-20T11:10:32Z",
      "formsDiscovered": 14,
      "fieldsDiscovered": 327,
      "avgConfidence": 0.88,
      "warnings": ["12 fields flagged for review"]
    }
  ]
}
```

---

### Get Semantic Index

Retrieve discovered forms and fields with semantic mappings for a customer.

**Endpoint:** `GET /api/customers/{code}/semantic-index`

**Query Parameters:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| `includeOptions` | boolean (default `false`) | Include field option mappings |
| `minConfidence` | number | Filter fields >= confidence |
| `reviewRequired` | boolean | Only fields flagged for manual review |

**Response (200 OK):**

```json
{
  "forms": [
    {
      "formId": "ff4328e1-7f74-46e6-b8a2-6a2b7d69e3f5",
      "formName": "Wound Assessment",
      "formType": "wound",
      "discoveredAt": "2025-10-20T11:10:32Z",
      "fieldCount": 145,
      "averageConfidence": 0.91,
      "fields": [
        {
          "fieldId": "90db2fd4-0cdd-43cf-84d9-9a95b3b9cbc4",
          "fieldName": "Etiology",
          "dataType": "select",
          "semanticConcept": "wound_classification",
          "semanticCategory": null,
          "confidence": 0.95,
          "isReviewRequired": false,
          "options": [
            {
              "value": "Diabetic Foot Ulcer",
              "semanticCategory": "diabetic_ulcer",
              "confidence": 0.98
            }
          ]
        }
      ]
    }
  ]
}
```

---

### Update Field Review Status

Mark a field as reviewed (manual override) or attach notes.

**Endpoint:** `PATCH /api/customers/{code}/semantic-index/fields/{fieldId}`

**Request Body:**

```json
{
  "isReviewRequired": false,
  "reviewNote": "Confirmed with consultant: acceptable mapping."
}
```

**Response (200 OK):** Updated field record.

---

## 3. Context & SQL Operations

### Discover Context

Given a natural language question, returns intent classification, relevant forms/fields, and terminology mappings using the semantic index.

**Endpoint:** `POST /api/customers/{code}/context/discover`

**Request Body:**

```json
{
  "question": "What is the average healing rate for diabetic wounds in the last 6 months?",
  "timeRange": {
    "unit": "months",
    "value": 6
  }
}
```

**Response (200 OK):**

```json
{
  "intent": {
    "type": "outcome_analysis",
    "scope": "patient_cohort",
    "metrics": ["healing_rate"],
    "filters": [
      {
        "concept": "wound_classification",
        "value": "diabetic_ulcer",
        "fieldName": "Etiology",
        "fieldValue": "Diabetic Foot Ulcer",
        "confidence": 0.97
      }
    ]
  },
  "forms": [
    {
      "formName": "Wound Assessment",
      "reason": "Contains wound classification and measurement fields",
      "confidence": 0.89
    }
  ],
  "joinPaths": [
    "dbo.Patient -> dbo.Wound -> dbo.Assessment -> dbo.Measurement"
  ]
}
```

---

### Generate SQL (Template Resolution)

Resolve a semantic template into customer-specific SQL using the context.

**Endpoint:** `POST /api/customers/{code}/sql/generate`

**Request Body:**

```json
{
  "templateName": "healing_rate_by_etiology",
  "context": {
    "intent": "...",
    "forms": "...",
    "mappings": "..."
  },
  "options": {
    "includeExplanation": true
  }
}
```

**Response (200 OK):**

```json
{
  "sql": "SELECT ...",
  "explanation": "Uses dbo.Note for Etiology mapped to 'Diabetic Foot Ulcer' ...",
  "placeholdersResolved": {
    "etiology_field": "Etiology",
    "diabetic_value": "'Diabetic Foot Ulcer'"
  }
}
```

---

### Validate SQL

Validates (and optionally executes) SQL against the customer’s Silhouette demo database. Connects to `rpt` schema after Hangfire sync.

**Endpoint:** `POST /api/customers/{code}/sql/validate`

**Request Body:**

```json
{
  "sql": "SELECT ...",
  "execute": true,
  "maxRows": 20
}
```

**Response (200 OK):**

```json
{
  "runId": "b99bbf26-56a1-4fd2-b091-e353c0daaf47",
  "status": "succeeded",
  "validation": {
    "syntaxValid": true,
    "tablesValid": true,
    "columnsValid": true,
    "semanticConstraintsValid": true
  },
  "execution": {
    "rowCount": 124,
    "durationMs": 482,
    "sample": [
      {
        "Etiology": "Diabetic Foot Ulcer",
        "AverageHealingRate": 0.84
      }
    ]
  }
}
```

**Failure Example (400 Bad Request):**

```json
{
  "runId": "b99bbf26-56a1-4fd2-b091-e353c0daaf47",
  "status": "failed",
  "validation": {
    "syntaxValid": true,
    "tablesValid": false,
    "errors": [
      "Table 'rpt.Measurement' not found for customer version 5.0."
    ]
  }
}
```

---

## 4. Demo Data Management

### Generate Demo Data

Creates synthetic data directly in `dbo.Patient`, `dbo.Wound`, `dbo.Assessment`, `dbo.Note`, `dbo.Measurement`. Waits for Hangfire sync unless `async` specified.

**Endpoint:** `POST /api/customers/{code}/demo-data/generate`

**Request Body:**

```json
{
  "patientCount": 25,
  "timeRangeWeeks": 12,
  "waitForHangfire": true,
  "forceRegenerate": false
}
```

**Response (202 Accepted):**

```json
{
  "generationId": "2c9b9105-7a5c-47f0-98ad-9452f42f2ea7",
  "status": "running",
  "message": "Demo data generation started. Watching Hangfire sync."
}
```

**Completion Payload (GET status):**

```json
{
  "generationId": "2c9b9105-7a5c-47f0-98ad-9452f42f2ea7",
  "status": "succeeded",
  "dboInserted": {
    "Patient": 25,
    "Wound": 58,
    "Assessment": 612,
    "Note": 7320,
    "Measurement": 2448
  },
  "hangfireSync": {
    "jobId": "42",
    "completedAt": "2025-10-20T11:25:00Z",
    "durationSeconds": 290
  },
  "verifiedInSilhouette": true
}
```

---

### Check Generation Status

**Endpoint:** `GET /api/customers/{code}/demo-data/generations/{generationId}`

**Response (200 OK):** same as completion payload above.

---

### Reset Demo Data

Truncates generated demo data for the customer (both `dbo` and corresponding `rpt` records via Hangfire sync).

**Endpoint:** `POST /api/customers/{code}/demo-data/reset`

**Response (202 Accepted):**

```json
{
  "resetId": "e5a1b8b0-5d4d-4d05-bc90-0580a60de1cf",
  "status": "running",
  "message": "Cleaning generated data and triggering Hangfire re-sync."
}
```

---

## 5. Schema Version Management

### Register Silhouette Version

**Endpoint:** `POST /api/schema/versions`

```json
{
  "version": "6.0",
  "major": 6,
  "minor": 0,
  "releasedAt": "2025-04-01T00:00:00Z",
  "notes": "Customer-provided upgrade pack.",
  "changes": [
    {
      "type": "column_rename",
      "from": "rpt.Assessment.statusFk",
      "to": "rpt.Assessment.stateFk",
      "description": "Silhouette 6.0 rename."
    }
  ]
}
```

**Response (201 Created)**: Version metadata stored; change log aids generator/validator.

### Map Customer to New Version

**Endpoint:** `POST /api/customers/{code}/schema/upgrade`

```json
{
  "targetVersion": "6.0",
  "notes": "Upgrade verified in staging. Running discovery + demo data regeneration."
}
```

**Response (202 Accepted):**

```json
{
  "upgradeRunId": "0cbedf67-1234-4ae7-9d8a-925b20b33855",
  "status": "pending",
  "message": "Schema upgrade recorded. Please rerun discovery and validation."
}
```

---

## 6. Error Responses

Consistent envelope for all error responses.

```json
{
  "error": {
    "code": "CUSTOMER_NOT_FOUND",
    "message": "Customer with code 'INVALID' not found.",
    "details": {
      "customerCode": "INVALID"
    },
    "traceId": "req-1234567890abcdef"
  }
}
```

### Common Error Codes

| HTTP Status | Code | Description |
| ----------- | ---- | ----------- |
| 400 | `VALIDATION_ERROR` | Invalid request payload |
| 401 | `UNAUTHENTICATED` | Missing/invalid credentials |
| 403 | `UNAUTHORIZED` | Lacking required role (admin vs consultant) |
| 404 | `CUSTOMER_NOT_FOUND`, `RESOURCE_NOT_FOUND` | Customer or resource missing |
| 409 | `CUSTOMER_EXISTS` | Duplicate customer code |
| 422 | `DISCOVERY_FAILED` | Discovery run failed (details in `error.details`) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `CONNECTION_FAILED`, `HANGFIRE_TIMEOUT` | External dependency unavailable |

---

## 7. Authentication & Rate Limiting

- **Authentication:** Bearer token (`Authorization: Bearer <token>`) or session cookie.
- **Roles:**
  - `admin`: Can manage customers, connection strings, schema versions.
  - `consultant`: Access read operations, context discovery, SQL validation.
  - `developer`: Includes consultant privileges plus template operations.

**Rate Limits (default):**

| Endpoint Group | Limit |
| -------------- | ----- |
| Customer CRUD | 60 requests/min/user |
| Discovery & semantic index | 10 requests/hour/customer |
| Demo data generation/reset | 4 requests/day/customer |
| SQL validation | 30 requests/min/user (execution limited to 10/minute) |

Headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1697112000
```

---

## 8. Notes & Conventions

- All timestamps are ISO 8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`).
- Connection strings supplied in requests are never echoed in responses.
- Long-running operations (discovery, demo data generation, Hangfire sync waits) return 202 with IDs for polling endpoints.
- Pagination: `GET` list endpoints accept `page` (default 1) and `pageSize` (default 25, max 200).
- Validation runs execute against `rpt` schema only after Hangfire sync completes.
- Demo data generator marks synthetic records via configurable indicators (default `AccessCode` prefix `IG`).
- Webhooks (planned): discovery completion, demo data generation completion, schema upgrade completion.

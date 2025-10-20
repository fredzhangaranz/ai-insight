# Semantic Layer: Workflows & UI Design (v2.0)

**Version:** 2.0 (Revised Architecture)  
**Last Updated:** 2025-10-20  
**Target Users:** Admins, Consultants, Developers

> 🔄 **Update:** Workflows updated for per-customer Silhouette demo databases, direct `dbo` discovery, and in-product demo data generation.

---

## Table of Contents

1. [User Personas](#user-personas)  
   1.1 [Admin](#admin)  
   1.2 [Consultant](#consultant)  
   1.3 [Developer](#developer)
2. [Customer Onboarding Workflow](#customer-onboarding-workflow)  
   2.1 [Overview](#overview)  
   2.2 [Detailed Steps](#detailed-steps)  
   2.3 [Error Handling & Recovery](#error-handling--recovery)
3. [Semantic Mapping Review Workflow](#semantic-mapping-review-workflow)  
   3.1 [Dashboard](#dashboard)  
   3.2 [Field Review Modal](#field-review-modal)
4. [Demo Data Workflow](#demo-data-workflow)  
   4.1 [Generate Demo Data](#generate-demo-data)  
   4.2 [Hangfire Sync Monitor](#hangfire-sync-monitor)  
   4.3 [Reset Demo Data](#reset-demo-data)
5. [SQL Generation & Validation Workflow](#sql-generation--validation-workflow)  
   5.1 [Ask Question → SQL](#ask-question--sql)  
   5.2 [Validation UI](#validation-ui)  
   5.3 [Delivery Package](#delivery-package)
6. [Customer Context Switching](#customer-context-switching)
7. [CLI & Automation Reference](#cli--automation-reference)
8. [UI Wireframes](#ui-wireframes)
9. [Notes](#notes)

---

## 1. User Personas

### 1.1 Admin

- **Goals:** Onboard customers, manage connection strings, monitor discovery/demo data status.
- **Key Screens:** Customer list, customer detail (connection & discovery tabs), Hangfire monitor, schema version dashboard.
- **Pain Points Addressed:** No more manual XML imports; secure connection handling; visibility into discovery runs.

### 1.2 Consultant

- **Goals:** Switch customers quickly, generate/validate customer-specific SQL, review mappings with low confidence.
- **Key Screens:** Customer switcher, question-to-SQL workspace, validation report, mapping review queue.
- **Pain Points Addressed:** Automatic terminology adaptation; validation data available in Silhouette UI; mapping review prioritized.

### 1.3 Developer

- **Goals:** Build reusable templates, inspect semantic context, debug validation failures.
- **Key Screens:** Template library, context discovery results, SQL playground, validation log history.
- **Pain Points Addressed:** Per-customer context surfaced; SQL validation against real schema; audit trails for iterative runs.

---

## 2. Customer Onboarding Workflow

### 2.1 Overview

Onboarding now relies on **customer-provisioned Silhouette demo databases**. Admins register connection details, test connectivity, run discovery, and generate demo data—no XML upload.

### 2.2 Detailed Steps

**Step 0: Prerequisites (Customer IT)**

- Provision Silhouette demo environment (matching production version).
- Import forms via Silhouette UI (existing Silhouette tooling).
- Create service account (`insightgen_service`) with read/write permission to `dbo` schema (read-only to `rpt`).
- Provide encrypted connection string to InsightGen admin out-of-band.

**Step 1: Register Customer (Admin)**

1. Navigate to **Customers → Add Customer**.
2. Enter metadata:
   - Name, Code (uppercase)
   - Silhouette version (dropdown; supports 5.x, 6.x)
   - Deployment type (on-prem, cloud)
   - Silhouette web URL (for quick access)
   - Notes (e.g., network boundaries, VPN instructions)
3. Paste connection string → stored encrypted.
4. Click **Create Customer** → returns to customer detail page with connection status `unknown`.

**UI Detail (Customer Detail → Connection Tab):**

```
┌──────────────────────────────────────────┐
│ Connection                              │
├──────────────────────────────────────────┤
│ Connection Status: UNKNOWN               │
│ Last Verified: —                         │
│ Silhouette Version: 5.1 (expected)       │
│ Buttons: [Test Connection] [Edit Details]│
└──────────────────────────────────────────┘
```

**Step 2: Test Connection**

- Click **Test Connection**.
- System attempts DB connection, queries `SELECT @@VERSION`, ensures `dbo.AttributeSet` exists.
- Results:
  - On success: status set to `OK`, stores detected version, updates timestamp.
  - On failure: show toast + error card with stack, allow retry.

**Step 3: Run Discovery**

- On success, prompt: “Run discovery now?”.
- Clicking **Run Discovery** launches background job.
- Discovery tab shows progress:

```
Discovery Run #5  (Started 11:09:01)
[██████████░░] 72% – Querying AttributeType (214/298 fields)
Warnings (so far):
 • Field "Cause of Wound" has low confidence mapping
```

- Completion summary:

```
Discovery Run #5 – Completed at 11:10:32
Forms Discovered: 14
Fields Discovered: 327
Avg Confidence: 0.88
Review Required: 12 fields (View Queue)
```

**Step 4: Review Semantic Mappings (optional before enabling consultants)**

- See [Section 3](#semantic-mapping-review-workflow).
- No blocking requirement, but highlight if pending review > threshold (e.g., >20).

**Step 5: Generate Demo Data**

- Navigate to **Demo Data** tab → click **Generate Demo Data**.
- Modal asks:
  - Patient count (default 25)
  - Time range (weeks/months)
  - Wait for Hangfire (toggle default ON)
- After submission, UI shows progress and Hangfire job monitoring (see Section 4).
- Upon completion, display “Verify data in Silhouette UI” link (opens customer URL).

**Step 6: Enable Consultants**

- Once discovery + demo data done, toggle **Customer Active** if not already.
- Customer now appears in consultant switcher.

### 2.3 Error Handling & Recovery

| Failure | UI Handling | Recovery Steps |
| ------- | ----------- | -------------- |
| Connection test fails | Inline error card + toast | Update credentials, VPN, firewall; retry |
| Discovery fails | Discovery run marked `Failed` with log download | Provide error log to developer; fix DB issues; rerun discovery |
| Hangfire timeout | Demo data status shows `timeout` with “Retry sync” button | Allow manual retry; optionally mark validation as blocked |
| Schema version mismatch | Warning banner (detected `5.0` but configured `5.2`) | Update metadata or plan schema upgrade; block validation until resolved |

---

## 3. Semantic Mapping Review Workflow

### 3.1 Dashboard

**Entry Points:**

- After discovery completion (CTA).
- Global navigation: “Semantic Review”.
- Customer detail → **Mappings** tab.

**Dashboard Layout:**

```
┌──────────────────────────────────────────────┐
│ Semantic Review – St. Mary's (STMARYS)       │
├──────────────────────────────────────────────┤
│ Filters: [Confidence < 0.7] [Form Type ▼]    │
│ Search: [_____________]                      │
│                                              │
│ Form: Wound Assessment                        │
│ ┌──────────────────────────────────────────┐ │
│ │ Field: Cause of Wound                    │ │
│ │ Confidence: 0.54 (Low)                   │ │
│ │ Suggested Concept: wound_classification  │ │
│ │ Suggested Category: venous_ulcer         │ │
│ │ Options: [3 low-confidence values]       │ │
│ │ Buttons: [Review] [Ignore]               │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Form: Treatment Log                           │
│ ┌──────────────────────────────────────────┐ │
│ │ Field: Dressing Applied                  │ │
│ │ Confidence: 0.72 (Medium)                │ │
│ │ ...                                      │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 3.2 Field Review Modal

**Modal contents:**

- Field metadata (form, field name, Silhouette ID).
- Suggested concept/category (with link to ontology entry).
- Option table (value, suggested mapping, confidence).
- Section for consultant notes.
- Actions:
  - **Accept** (sets `isReviewRequired=false`).
  - **Adjust Mapping** (override concept/category).
  - **Flag** (leave review required + note).

---

## 4. Demo Data Workflow

### 4.1 Generate Demo Data

**Screen Layout (Customer → Demo Data tab):**

```
┌──────────────────────────────────────────────┐
│ Demo Data – St. Mary's                       │
├──────────────────────────────────────────────┤
│ Last Generated: 2025-10-20 11:25 (Succeeded) │
│ Hangfire Job: #42 (290s)                     │
│ Patients: 25 | Wounds: 58 | Assessments: 612 │
│                                              │
│ [Generate Demo Data] [Reset Demo Data]       │
│                                              │
│ Generation History                           │
│ ┌──────────────────────────────────────────┐ │
│ │ ID       Status   Started        Duration│ │
│ │ #43      running  11:45:12       02:15   │ │
│ │ #42      success  11:20:05       04:50   │ │
│ │ #41      failed   10:10:31       00:32   │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**Generate Modal:**

- Inputs: patient count, time range, configuration preset (e.g., “Wound heavy”, “Balanced”).
- Toggle: `Wait for Hangfire sync` (default ON).
- Checkbox: `Send summary to Slack` (optional integration).

### 4.2 Hangfire Sync Monitor

- After generation starts, show progress card:

```
Hangfire Sync
[███████░░░░] 68% – Job #44 running
Elapsed: 03:12 | Timeout: 10:00
[View Hangfire Logs] [Retry Sync]
```

- On timeout: show red banner with guidance (“Hangfire job exceeded 10 minutes. Retry or run manually in Silhouette.”) and disable validation CTA until resolved.

### 4.3 Reset Demo Data

- Requires confirmation modal (“All generated demo data will be removed; production data unaffected.”).
- Option to also clear Hangfire job queue (for a clean state).
- After reset, prompt to rerun generation before validations.

---

## 5. SQL Generation & Validation Workflow

### 5.1 Ask Question → SQL

**Workspace Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Customer: St. Mary's (Switch ▼)      Mode: Consultant    │
├──────────────────────────────────────────────────────────┤
│ Question Input:                                             │
│ [What is the average healing rate for diabetic wounds ...]  │
│ [Generate SQL]                                              │
│                                                              │
│ Context Panel (collapsible):                                │
│ • Intent: outcome_analysis                                  │
│ • Forms: Wound Assessment (confidence 0.89)                 │
│ • Terminology: "diabetic wounds" → Etiology = 'Diabetic ...'│
│ • Join Path: Patient → Wound → Assessment → Measurement     │
│                                                              │
│ SQL Output:                                                 │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ SELECT                                               │   │
│ │   n.value AS Etiology,                               │   │
│ │   AVG(m.value) AS AverageHealingRate,                │   │
│ │ ...                                                  │   │
│ └──────────────────────────────────────────────────────┘   │
│ [Copy SQL] [Validate SQL] [Save Template]                  │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Validation UI

- After clicking **Validate SQL**, show modal or panel:

```
Validation Run #128
Status: Running (Elapsed 00:18)
[████░░░░░░] Syntax Analysis
[░░░░░░░░░░] Table/Column Check
[░░░░░░░░░░] Semantic Constraints
[░░░░░░░░░░] Execution (sample 20 rows)
```

- Success summary:

```
Validation Result: PASSED (Duration 00:45)
• Syntax: Valid
• Tables/Columns: Valid
• Semantic: Valid
• Execution: 124 rows (sample saved)
```

- Errors bubble up by severity with suggestions (e.g., “Column `HealingRate` not found. Did you mean `Healing_Rate`? Check semantic mapping for measurement.”).

### 5.3 Delivery Package

- Once validation passes, enable **Download Package**.
- Package contents:
  - SQL file (`STMARYS_healing_rate_diabetic.sql`)
  - Validation report (`validation.json`)
  - Context summary (`context.json`)
  - Optional human-readable summary (Markdown/PDF)
- UI shows link to share with consultants (“Copy shareable link”).

---

## 6. Customer Context Switching

- Global header includes customer switcher with search:

```
Customer: [STMARYS ▼]
Search: [Type to filter customers...]
Recent: STMARYS, REGIONAL, METRO
Status icons: ✓ (active), ⚠ (pending review), ⏳ (discovery running)
```

- Switching customers updates:
  - Form index & semantic context.
  - Demo data & validation history.
  - Template adaptation preview.

---

## 7. CLI & Automation Reference

Updated CLI commands reflecting v2.0 workflows.

```bash
# Add customer (prompts for connection string securely)
$ npm run customer:add -- \
    --name "St. Marys" \
    --code "STMARYS" \
    --version "5.1" \
    --deployment on_prem

# Test connection
$ npm run customer:test-connection -- --code "STMARYS"

# Run discovery
$ npm run discovery:run -- --code "STMARYS" --force

# List discovery runs
$ npm run discovery:list -- --code "STMARYS"

# Review mappings (opens interactive TUI)
$ npm run semantic:review -- --code "STMARYS"

# Generate demo data
$ npm run demo-data:generate -- \
    --code "STMARYS" \
    --patients 25 \
    --time-range-weeks 12 \
    --wait

# Reset demo data
$ npm run demo-data:reset -- --code "STMARYS"

# Discover context & generate SQL
$ npm run sql:generate -- \
    --code "STMARYS" \
    --question "Average healing rate for diabetic wounds"

# Validate SQL (execute)
$ npm run sql:validate -- \
    --code "STMARYS" \
    --file "./sql/healing_rate.sql" \
    --execute \
    --max-rows 20

# Schema upgrade
$ npm run schema:upgrade -- --code "STMARYS" --target "6.0"
```

Automations should chain: `customer:add` → `customer:test-connection` → `discovery:run` → `demo-data:generate` → `semantic:review`.

---

## 8. UI Wireframes

### 8.1 Customer Detail View

```
┌─────────────────────────────────────────────────────────┐
│ ST. MARY'S HOSPITAL (Active)           [Switch Customer]│
├─────────────────────────────────────────────────────────┤
│ Tabs: [Overview] [Connection] [Discovery] [Mappings]    │
│       [Demo Data] [Validation] [Schema]                 │
│                                                         │
│ Overview:                                               │
│  • Silhouette Version: 5.1 (detected 5.1)               │
│  • Last Discovery: 2025-10-20 11:10 (14 forms, 0.88)    │
│  • Pending Review: 12 fields                            │
│  • Last Demo Data: 2025-10-20 11:25 (Success)           │
│  • Validation Pass Rate (30d): 96%                      │
│                                                         │
│ Quick Actions:                                          │
│  [Test Connection] [Run Discovery] [Generate Demo Data] │
│  [Open Silhouette UI] [Download Delivery Package]       │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Question-to-SQL Workspace

(see Section 5.1 for layout)

### 8.3 Semantic Review Triage

```
┌─────────────────────────────────────────────────────────┐
│ Semantic Review Queue                                    │
├─────────────────────────────────────────────────────────┤
│ Customer: STMARYS | Filters: [Low Confidence ▼]          │
│ Search: [_________________________]                      │
│                                                         │
│ Pending (12)                                            │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Form: Wound Assessment                            │   │
│ │ Field: Cause of Wound (0.54)                      │   │
│ │ Suggested: wound_classification → venous_ulcer    │   │
│ │ Option Mismatches: ['Diabetic Foot Ulcer' (0.49)] │   │
│ │ [Review] [Ignore]                                 │   │
│ └───────────────────────────────────────────────────┘   │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

### 8.4 Demo Data Monitor

```
┌─────────────────────────────────────────────────────────┐
│ Demo Data Generation – STMARYS                          │
├─────────────────────────────────────────────────────────┤
│ Status: Running (Job #44)                               │
│ Elapsed: 03:12 | Timeout: 10:00                         │
│ Patients inserted: 18/25                                │
│ Hangfire queue length: 1                                │
│                                                         │
│ [Cancel Generation] [Retry Sync]                        │
│                                                         │
│ History:                                                │
│ #44 running 11:45:12 (demo)                             │
│ #43 success 11:20:05 (demo)                             │
│ #42 failed 10:10:31 (see logs)                          │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Notes

- Connection strings never displayed after submission; provide “Rotate Credentials” flow (admin re-enters new string).
- All long-running actions (discovery, demo data, validation) should support cancellation where feasible.
- Provide tooltips for Silhouette-specific terms (e.g., `AssessmentTypeVersion`).
- Use role-based access control: only admins can edit connection strings or run resets; consultants/developers can generate/validate SQL.
- Integrate alerting (email/Slack) for failed discovery or demo data runs to avoid silent drift.
- Dark mode, responsive design, and accessibility (WCAG AA) remain priorities.

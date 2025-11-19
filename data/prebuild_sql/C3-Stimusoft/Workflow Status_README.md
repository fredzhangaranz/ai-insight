# Workflow Status Dashboard

## Changelog

| Revision | Date  | Silhouette Version | Jira ID | Description |
| -------- | ----- | ------------------ | --------| ----------- |
| 1        | 2024-07-09 | 4.17 | | | 


## Background

This is to provide a snapshot of the status of processing progress notes.  This is tracked within Silhouette via a 'Superbill' assessment; for each progress note a corresponding superbill is created.  As the progress note progresses through the various workflow steps a dropdown in the superbill is changed to reflect the status.

Coding status can be:
- Reading for Coding (spelling? Should this be 'ready')
- Missing Documentation
- Coding Started
- Returned to Provider for Corrections
- Send for Clinical Review
- Coding Complete
- Non-billable Visit Only Do Not Bill.

Of these, 'Coding Complete' indicates the end of the workflow, superbills in this state are considered 'done'.

## Proposed Report

Generally a large table with filtering:
- Results shown in a table with a row per superbill.
- Global filters available to filter on:
  - Unit (multi-selectable)
  - Status (multi-selectable)

Table includes:
- MRN
- Patient Name (with link to patient overview)
- DoB
- Unit
- Superbill Date (based on the creation date)
- Superbill author name
- Status (with link to Superbill)

Coding status is a field within the superbill assessment.
- `assessmentTypeId` = `1d6a6cdf-c80d-ac43-89c2-223104d8acb6`
- Coding status variable = `coding_status`

# Export Functionality Design Document

## Overview

This document outlines the design for export functionality in the AI-powered query generation system. The export feature allows users to save and share validated sub-questions and complete analysis workflows for reuse, documentation, and knowledge sharing.

## Use Cases

### 1. Individual Sub-Question Export

**When**: User identifies a particularly good sub-question that could be reused elsewhere
**Purpose**: Extract a single validated sub-question for adaptation to other forms or contexts
**Scope**: Minimal metadata focused on the specific sub-question and its SQL logic

### 2. Complete Funnel Export

**When**: User wants to export the entire analysis workflow for documentation or sharing
**Purpose**: Preserve complete analysis methodology, decisions, and workflow
**Scope**: Full metadata including all sub-questions, form definition, and analysis context

## Export Structure

### Individual Sub-Question Export Format

```json
{
  "exportType": "individual_subquestion",
  "exportDate": "2024-01-15T10:30:00Z",
  "subQuestion": {
    "text": "Calculate average healing time per treatment method",
    "order": 2,
    "sqlQuery": "SELECT treatment, AVG(healing_time) FROM wounds GROUP BY treatment",
    "sqlExplanation": "This query aggregates healing times by treatment type",
    "template": "Treatment Effectiveness Overview",
    "aiModel": "claude-3-sonnet"
  },
  "formContext": {
    "assessmentFormName": "Wound Assessment v2",
    "relevantFields": ["Treatment", "HealingTime", "WoundType"]
  }
}
```

### Complete Funnel Export Format

```json
{
  "exportType": "complete_funnel",
  "exportDate": "2024-01-15T10:30:00Z",
  "exportedBy": "user@example.com",
  "originalQuestion": "What is the effectiveness of treatments across different wound etiologies over the past year?",
  "assessmentForm": {
    "assessmentFormId": "uuid-here",
    "assessmentFormName": "Wound Assessment v2",
    "definitionVersion": 1,
    "completeDefinition": {
      "Etiology": {
        "fieldtype": "SingleSelectList",
        "options": ["Pressure Ulcer", "Venous Ulcer", "Diabetic"]
      },
      "Treatment": {
        "fieldtype": "SingleSelectList",
        "options": ["Hydrogel", "Alginate", "Foam"]
      }
    }
  },
  "subQuestions": [
    {
      "id": "sub-1",
      "text": "List all distinct wound etiologies recorded in the past year",
      "order": 1,
      "status": "completed",
      "dependsOn": null,
      "sqlQuery": "SELECT DISTINCT etiology FROM wounds WHERE date >= DATEADD(year, -1, GETDATE())",
      "sqlExplanation": "Identifies all unique wound types for analysis",
      "template": "Data Discovery",
      "aiModel": "claude-3-sonnet",
      "validationNotes": "Query validated and executed successfully"
    },
    {
      "id": "sub-2",
      "text": "Calculate average healing time per treatment method for each wound etiology",
      "order": 2,
      "status": "completed",
      "dependsOn": [1],
      "sqlQuery": "SELECT etiology, treatment, AVG(healing_time) as avg_healing_time FROM wounds GROUP BY etiology, treatment",
      "sqlExplanation": "Aggregates healing times by both etiology and treatment",
      "template": "Treatment Effectiveness Overview",
      "aiModel": "claude-3-sonnet",
      "validationNotes": "Query validated and executed successfully"
    }
  ],
  "funnelMetadata": {
    "totalSubQuestions": 2,
    "completedCount": 2,
    "aiModelUsed": "claude-3-sonnet",
    "generationDate": "2024-01-15T09:00:00Z"
  }
}
```

## Security & Privacy Requirements

### Data Exclusion Policy

- ❌ **No query results** - Only SQL structure, never actual data
- ❌ **No patient data** - Only form definitions and query logic
- ❌ **No sensitive metadata** - Focus on analysis structure
- ✅ **Audit logging** - Track all export activities

### Export Controls

- Export permission controls based on user roles
- Logging of all export activities with user, timestamp, and content
- Optional data anonymization for form field names

## User Interface Design

### Individual Sub-Question Export

**Location**: Each sub-question panel
**Trigger**: Small export icon (📤) next to "Mark Complete" button
**Behavior**:

- Single-click export
- Immediate download of JSON file
- Success notification with file name

### Complete Funnel Export

**Location**: Funnel header or menu options
**Trigger**: "Export Complete Analysis" button
**Behavior**:

- Confirmation dialog showing export scope
- Progress indicator for large exports
- Success notification with file name

### File Naming Convention

```
# Individual sub-question
treatment-effectiveness-analysis_subq-2_2024-01-15.json

# Complete funnel
wound-treatment-effectiveness_complete-funnel_2024-01-15.json
```

## Technical Implementation

### API Endpoints

#### Individual Sub-Question Export

```
GET /api/ai/funnel/subquestions/[id]/export
```

**Response**: JSON file download with individual sub-question data

#### Complete Funnel Export

```
GET /api/ai/funnel/[funnelId]/export
```

**Response**: JSON file download with complete funnel data

### Frontend Components

#### ExportButton Component

```typescript
interface ExportButtonProps {
  type: "individual" | "complete";
  subQuestionId?: string;
  funnelId?: string;
  onExport: (data: ExportData) => void;
}
```

#### ExportModal Component

```typescript
interface ExportModalProps {
  isOpen: boolean;
  exportType: "individual" | "complete";
  onConfirm: () => void;
  onCancel: () => void;
}
```

### Data Processing

#### Export Data Builder

```typescript
class ExportDataBuilder {
  static buildIndividualExport(
    subQuestion: SubQuestion,
    formDefinition: any
  ): IndividualExportData;
  static buildCompleteExport(
    funnel: QueryFunnel,
    formDefinition: any
  ): CompleteExportData;
}
```

## Benefits & Value Proposition

### Individual Sub-Question Export

- **Reusability**: Adapt good queries for other forms
- **Knowledge Sharing**: Share specific analysis patterns
- **Template Building**: Build personal library of effective queries
- **Learning**: Study successful query patterns

### Complete Funnel Export

- **Documentation**: Full audit trail of analysis decisions
- **Backup**: Preserve complete analysis workflows
- **Sharing**: Share entire analysis approaches between teams
- **Compliance**: Maintain records of analysis methodology
- **Onboarding**: Use as training examples for new team members

## Future Enhancements

### Import Functionality

- Import individual sub-questions into other assessment forms
- Field mapping for cross-form compatibility
- Validation of imported queries against target form definitions

### Advanced Export Options

- Multiple format support (JSON, CSV, Excel)
- Customizable export scope (user-defined fields)
- Batch export of multiple sub-questions

### Integration Features

- Export as part of chart generation workflow
- Include visualization preferences in exports
- Export analysis packages with charts and insights

### Versioning & Compatibility

- Export format versioning for future compatibility
- Automatic upgrade of older export formats
- Backward compatibility maintenance

## Implementation Phases

### Phase 1: Basic Export (MVP)

- Individual sub-question export
- Basic complete funnel export
- Simple file download functionality

### Phase 2: Enhanced Features

- Export confirmation dialogs
- Progress indicators
- Audit logging
- File naming improvements

### Phase 3: Advanced Features

- Import functionality
- Multiple format support
- Integration with chart generation
- Template library features

## Success Metrics

### Usage Metrics

- Number of exports per user
- Most exported sub-question types
- Export frequency by form type

### Quality Metrics

- Export file size and complexity
- User feedback on export usefulness
- Reuse rate of exported content

### Business Metrics

- User engagement with export feature
- Knowledge sharing across teams
- Reduction in duplicate analysis work

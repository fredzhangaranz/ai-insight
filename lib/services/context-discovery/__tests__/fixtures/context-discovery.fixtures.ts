/**
 * Context Discovery Integration Fixtures (Task 11.1)
 *
 * Provides a mock customer profile, semantic index records, and
 * representative test questions with expected context bundles covering
 * all supported intent types. These fixtures power the integration and
 * end-to-end tests defined in Task 11.2.
 */

import type {
  ContextBundle,
  IntentClassificationResult,
  JoinPath,
  SemanticSearchResult,
  TerminologyMapping,
  FormInContext,
  FieldInContext,
} from "../../types";

export interface SemanticIndexFormFieldFixture {
  id: string;
  formId: string;
  formName: string;
  dataType: string;
  semanticConcept: string;
  confidence: number;
}

export interface SemanticIndexOptionFixture {
  fieldId: string;
  optionValue: string;
  optionCode?: string;
  semanticCategory: string;
  confidence: number;
}

export interface SemanticIndexNonFormFixture {
  id: string;
  tableName: string;
  columnName: string;
  dataType: string;
  semanticConcept: string;
  semanticCategory: string;
  confidence: number;
}

export interface SemanticRelationshipFixture {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  fkColumnName: string;
  cardinality: "1:N" | "N:1" | "1:1" | "N:N";
  confidence: number;
}

export interface ContextDiscoveryFixture {
  id: string;
  intent: IntentClassificationResult;
  question: string;
  expectedBundle: ContextBundle;
  semanticResults: SemanticSearchResult[];
  terminology: TerminologyMapping[];
  joinPaths: JoinPath[];
}

export const MOCK_CUSTOMER = {
  id: "cust-0001",
  code: "STMARYS",
  name: "St. Mary's Regional Hospital",
};

export const SEMANTIC_INDEX_FORM_FIELDS: SemanticIndexFormFieldFixture[] = [
  {
    id: "field-etiology",
    formId: "form-wound-assessment",
    formName: "Wound Assessment",
    dataType: "SingleSelectList",
    semanticConcept: "wound_classification",
    confidence: 0.95,
  },
  {
    id: "field-healing-rate",
    formId: "form-wound-assessment",
    formName: "Wound Assessment",
    dataType: "Numeric",
    semanticConcept: "healing_rate",
    confidence: 0.92,
  },
  {
    id: "field-infection-status",
    formId: "form-infection-log",
    formName: "Infection Log",
    dataType: "SingleSelectList",
    semanticConcept: "infection_status",
    confidence: 0.89,
  },
  {
    id: "field-reassessment-date",
    formId: "form-quality-check",
    formName: "Quality Check",
    dataType: "Date",
    semanticConcept: "reassessment_date",
    confidence: 0.91,
  },
  {
    id: "field-assessment-duration",
    formId: "form-operations-tracker",
    formName: "Operations Tracker",
    dataType: "Duration",
    semanticConcept: "assessment_duration",
    confidence: 0.9,
  },
  {
    id: "field-unit",
    formId: "form-wound-assessment",
    formName: "Wound Assessment",
    dataType: "Lookup",
    semanticConcept: "organizational_unit",
    confidence: 0.88,
  },
  {
    id: "field-pressure-injury-stage",
    formId: "form-wound-assessment",
    formName: "Wound Assessment",
    dataType: "SingleSelectList",
    semanticConcept: "pressure_injury_stage",
    confidence: 0.87,
  },
  {
    id: "field-assessment-count",
    formId: "form-assessment-series",
    formName: "Assessment Series",
    dataType: "Numeric",
    semanticConcept: "assessment_count",
    confidence: 0.85,
  },
  {
    id: "field-stage",
    formId: "form-infection-log",
    formName: "Infection Log",
    dataType: "SingleSelectList",
    semanticConcept: "infection_risk_level",
    confidence: 0.84,
  },
  {
    id: "field-compliance-flag",
    formId: "form-quality-check",
    formName: "Quality Check",
    dataType: "Boolean",
    semanticConcept: "compliance_flag",
    confidence: 0.86,
  },
];

export const SEMANTIC_INDEX_OPTIONS: SemanticIndexOptionFixture[] = [
  {
    fieldId: "field-etiology",
    optionValue: "Diabetic Foot Ulcer",
    optionCode: "DFU",
    semanticCategory: "diabetic_ulcer",
    confidence: 0.97,
  },
  {
    fieldId: "field-etiology",
    optionValue: "Venous Leg Ulcer",
    optionCode: "VLU",
    semanticCategory: "venous_ulcer",
    confidence: 0.93,
  },
  {
    fieldId: "field-etiology",
    optionValue: "Pressure Injury",
    optionCode: "PI",
    semanticCategory: "pressure_injury",
    confidence: 0.92,
  },
  {
    fieldId: "field-infection-status",
    optionValue: "High Risk",
    optionCode: "HIGH",
    semanticCategory: "infection_high",
    confidence: 0.9,
  },
  {
    fieldId: "field-infection-status",
    optionValue: "Low Risk",
    optionCode: "LOW",
    semanticCategory: "infection_low",
    confidence: 0.88,
  },
  {
    fieldId: "field-pressure-injury-stage",
    optionValue: "Stage 3",
    optionCode: "STAGE3",
    semanticCategory: "pressure_stage_3",
    confidence: 0.89,
  },
];

export const SEMANTIC_INDEX_NONFORM: SemanticIndexNonFormFixture[] = [
  {
    id: "nonform-unit-name",
    tableName: "rpt.Unit",
    columnName: "name",
    dataType: "varchar",
    semanticConcept: "organizational_unit",
    semanticCategory: "clinic_unit",
    confidence: 0.9,
  },
  {
    id: "nonform-assessment-date",
    tableName: "rpt.Assessment",
    columnName: "assessedAt",
    dataType: "timestamp",
    semanticConcept: "assessment_date",
    semanticCategory: "timeline_point",
    confidence: 0.86,
  },
  {
    id: "nonform-measurement-area",
    tableName: "rpt.Measurement",
    columnName: "areaSqCm",
    dataType: "numeric",
    semanticConcept: "wound_area",
    semanticCategory: "continuous_measurement",
    confidence: 0.85,
  },
];

export const SEMANTIC_RELATIONSHIPS: SemanticRelationshipFixture[] = [
  {
    sourceTable: "rpt.Patient",
    sourceColumn: "id",
    targetTable: "rpt.Wound",
    targetColumn: "patientFk",
    fkColumnName: "rpt.Wound.patientFk",
    cardinality: "1:N",
    confidence: 1,
  },
  {
    sourceTable: "rpt.Wound",
    sourceColumn: "id",
    targetTable: "rpt.Assessment",
    targetColumn: "woundFk",
    fkColumnName: "rpt.Assessment.woundFk",
    cardinality: "1:N",
    confidence: 1,
  },
  {
    sourceTable: "rpt.Assessment",
    sourceColumn: "id",
    targetTable: "rpt.Measurement",
    targetColumn: "assessmentFk",
    fkColumnName: "rpt.Measurement.assessmentFk",
    cardinality: "1:N",
    confidence: 1,
  },
  {
    sourceTable: "rpt.Patient",
    sourceColumn: "unitFk",
    targetTable: "rpt.Unit",
    targetColumn: "id",
    fkColumnName: "rpt.Patient.unitFk",
    cardinality: "N:1",
    confidence: 1,
  },
  {
    sourceTable: "rpt.Patient",
    sourceColumn: "id",
    targetTable: "rpt.Encounter",
    targetColumn: "patientFk",
    fkColumnName: "rpt.Encounter.patientFk",
    cardinality: "1:N",
    confidence: 0.95,
  },
  {
    sourceTable: "rpt.Encounter",
    sourceColumn: "id",
    targetTable: "rpt.Visit",
    targetColumn: "encounterFk",
    fkColumnName: "rpt.Visit.encounterFk",
    cardinality: "1:N",
    confidence: 0.94,
  },
];

const BASE_METADATA = {
  discoveryRunId: "run-fixture-0001",
  timestamp: "2025-01-01T12:00:00Z",
  durationMs: 2400,
  version: "1.0",
};

function buildForm(
  formName: string,
  fields: FieldInContext[],
  confidence: number,
  reason: string
): FormInContext {
  return {
    formName,
    formId: `${formName.toLowerCase().replace(/\s+/g, "-")}-id`,
    reason,
    confidence,
    fields,
  };
}

function buildJoinPath(
  tables: string[],
  joins: JoinPath["joins"],
  confidence: number,
  isPreferred = true
): JoinPath {
  return {
    path: tables.map((table) => table.replace("rpt.", "")),
    tables,
    joins,
    confidence,
    isPreferred,
  };
}

function buildTerminology(
  userTerm: string,
  concept: string,
  fieldName: string,
  fieldValue: string,
  formName: string,
  confidence: number
): TerminologyMapping {
  return {
    userTerm,
    semanticConcept: concept,
    fieldName,
    fieldValue,
    formName,
    confidence,
    source: "form_option",
  };
}

export const CONTEXT_DISCOVERY_FIXTURES: ContextDiscoveryFixture[] = [
  {
    id: "outcome-analysis-dfu",
    question:
      "What is the average healing rate for diabetic wounds in the last 6 months?",
    intent: {
      type: "outcome_analysis",
      scope: "patient_cohort",
      metrics: ["healing_rate"],
      filters: [
        {
          concept: "wound_classification",
          userTerm: "diabetic wounds",
          value: "diabetic_ulcer",
        },
      ],
      timeRange: { unit: "months", value: 6 },
      confidence: 0.93,
      reasoning:
        "User requests an outcome metric for a wound classification over a defined time period.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-etiology",
        fieldName: "Etiology",
        formName: "Wound Assessment",
        semanticConcept: "wound_classification",
        dataType: "SingleSelectList",
        confidence: 0.95,
      },
      {
        source: "form",
        id: "field-healing-rate",
        fieldName: "Healing Rate",
        formName: "Wound Assessment",
        semanticConcept: "healing_rate",
        dataType: "Numeric",
        confidence: 0.92,
      },
    ],
    terminology: [
      buildTerminology(
        "diabetic wounds",
        "wound_classification:diabetic_ulcer",
        "Etiology",
        "Diabetic Foot Ulcer",
        "Wound Assessment",
        0.97
      ),
    ],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        1
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "What is the average healing rate for diabetic wounds in the last 6 months?",
      intent: {
        type: "outcome_analysis",
        scope: "patient_cohort",
        metrics: ["healing_rate"],
        filters: [
          {
            concept: "wound_classification",
            userTerm: "diabetic wounds",
            value: "diabetic_ulcer",
          },
        ],
        timeRange: { unit: "months", value: 6 },
        confidence: 0.93,
        reasoning:
          "User requests an outcome metric for a wound classification over a defined time period.",
      },
      forms: [
        buildForm(
          "Wound Assessment",
          [
            {
              fieldName: "Etiology",
              fieldId: "field-etiology",
              semanticConcept: "wound_classification",
              dataType: "SingleSelectList",
              confidence: 0.95,
            },
            {
              fieldName: "Healing Rate",
              fieldId: "field-healing-rate",
              semanticConcept: "healing_rate",
              dataType: "Numeric",
              confidence: 0.92,
            },
          ],
          0.95,
          "Contains wound classification and healing metrics."
        ),
      ],
      terminology: [
        buildTerminology(
          "diabetic wounds",
          "wound_classification:diabetic_ulcer",
          "Etiology",
          "Diabetic Foot Ulcer",
          "Wound Assessment",
          0.97
        ),
      ],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          1
        ),
      ],
      overallConfidence: 0.92,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "trend-analysis-infection",
    question:
      "Show the infection rate trend for wound patients over the past year.",
    intent: {
      type: "trend_analysis",
      scope: "patient_cohort",
      metrics: ["infection_rate"],
      filters: [],
      timeRange: { unit: "years", value: 1 },
      confidence: 0.9,
      reasoning:
        "Question explicitly requests trend over time for infection rate.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-infection-status",
        fieldName: "Infection Risk",
        formName: "Infection Log",
        semanticConcept: "infection_status",
        dataType: "SingleSelectList",
        confidence: 0.89,
      },
      {
        source: "non_form",
        id: "nonform-assessment-date",
        fieldName: "assessedAt",
        tableName: "rpt.Assessment",
        semanticConcept: "assessment_date",
        dataType: "timestamp",
        confidence: 0.86,
      },
    ],
    terminology: [],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        0.98
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "Show the infection rate trend for wound patients over the past year.",
      intent: {
        type: "trend_analysis",
        scope: "patient_cohort",
        metrics: ["infection_rate"],
        filters: [],
        timeRange: { unit: "years", value: 1 },
        confidence: 0.9,
        reasoning:
          "Question explicitly requests trend over time for infection rate.",
      },
      forms: [
        buildForm(
          "Infection Log",
          [
            {
              fieldName: "Infection Risk",
              fieldId: "field-infection-status",
              semanticConcept: "infection_status",
              dataType: "SingleSelectList",
              confidence: 0.89,
            },
          ],
          0.89,
          "Tracks infection risk classifications over time."
        ),
      ],
      terminology: [],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          0.98
        ),
      ],
      overallConfidence: 0.86,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "cohort-comparison-dfu-vlu",
    question:
      "Compare healing rates between diabetic and venous leg ulcers this quarter.",
    intent: {
      type: "cohort_comparison",
      scope: "patient_cohort",
      metrics: ["healing_rate"],
      filters: [
        {
          concept: "wound_classification",
          userTerm: "diabetic wounds",
          value: "diabetic_ulcer",
        },
        {
          concept: "wound_classification",
          userTerm: "venous wounds",
          value: "venous_ulcer",
        },
      ],
      timeRange: { unit: "months", value: 3 },
      confidence: 0.91,
      reasoning:
        "Explicit comparison between two wound categories over a quarter.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-etiology",
        fieldName: "Etiology",
        formName: "Wound Assessment",
        semanticConcept: "wound_classification",
        dataType: "SingleSelectList",
        confidence: 0.95,
      },
      {
        source: "form",
        id: "field-healing-rate",
        fieldName: "Healing Rate",
        formName: "Wound Assessment",
        semanticConcept: "healing_rate",
        dataType: "Numeric",
        confidence: 0.92,
      },
    ],
    terminology: [
      buildTerminology(
        "diabetic wounds",
        "wound_classification:diabetic_ulcer",
        "Etiology",
        "Diabetic Foot Ulcer",
        "Wound Assessment",
        0.97
      ),
      buildTerminology(
        "venous wounds",
        "wound_classification:venous_ulcer",
        "Etiology",
        "Venous Leg Ulcer",
        "Wound Assessment",
        0.94
      ),
    ],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        1
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "Compare healing rates between diabetic and venous leg ulcers this quarter.",
      intent: {
        type: "cohort_comparison",
        scope: "patient_cohort",
        metrics: ["healing_rate"],
        filters: [
          {
            concept: "wound_classification",
            userTerm: "diabetic wounds",
            value: "diabetic_ulcer",
          },
          {
            concept: "wound_classification",
            userTerm: "venous wounds",
            value: "venous_ulcer",
          },
        ],
        timeRange: { unit: "months", value: 3 },
        confidence: 0.91,
        reasoning:
          "Explicit comparison between two wound categories over a quarter.",
      },
      forms: [
        buildForm(
          "Wound Assessment",
          [
            {
              fieldName: "Etiology",
              fieldId: "field-etiology",
              semanticConcept: "wound_classification",
              dataType: "SingleSelectList",
              confidence: 0.95,
            },
            {
              fieldName: "Healing Rate",
              fieldId: "field-healing-rate",
              semanticConcept: "healing_rate",
              dataType: "Numeric",
              confidence: 0.92,
            },
          ],
          0.95,
          "Contains wound classification and healing metrics."
        ),
      ],
      terminology: [
        buildTerminology(
          "diabetic wounds",
          "wound_classification:diabetic_ulcer",
          "Etiology",
          "Diabetic Foot Ulcer",
          "Wound Assessment",
          0.97
        ),
        buildTerminology(
          "venous wounds",
          "wound_classification:venous_ulcer",
          "Etiology",
          "Venous Leg Ulcer",
          "Wound Assessment",
          0.94
        ),
      ],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          1
        ),
      ],
      overallConfidence: 0.91,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "risk-assessment-high-risk",
    question:
      "Identify patients at high infection risk among diabetic wounds this month.",
    intent: {
      type: "risk_assessment",
      scope: "patient_cohort",
      metrics: ["infection_risk_score"],
      filters: [
        {
          concept: "wound_classification",
          userTerm: "diabetic wounds",
          value: "diabetic_ulcer",
        },
        {
          concept: "infection_status",
          userTerm: "high risk",
          value: "infection_high",
        },
      ],
      timeRange: { unit: "months", value: 1 },
      confidence: 0.9,
      reasoning:
        "User requests patients at risk with specific wound and infection filters.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-infection-status",
        fieldName: "Infection Risk",
        formName: "Infection Log",
        semanticConcept: "infection_status",
        dataType: "SingleSelectList",
        confidence: 0.89,
      },
      {
        source: "form",
        id: "field-etiology",
        fieldName: "Etiology",
        formName: "Wound Assessment",
        semanticConcept: "wound_classification",
        dataType: "SingleSelectList",
        confidence: 0.95,
      },
    ],
    terminology: [
      buildTerminology(
        "diabetic wounds",
        "wound_classification:diabetic_ulcer",
        "Etiology",
        "Diabetic Foot Ulcer",
        "Wound Assessment",
        0.97
      ),
      buildTerminology(
        "high risk",
        "infection_status:infection_high",
        "Infection Risk",
        "High Risk",
        "Infection Log",
        0.9
      ),
    ],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        0.99
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "Identify patients at high infection risk among diabetic wounds this month.",
      intent: {
        type: "risk_assessment",
        scope: "patient_cohort",
        metrics: ["infection_risk_score"],
        filters: [
          {
            concept: "wound_classification",
            userTerm: "diabetic wounds",
            value: "diabetic_ulcer",
          },
          {
            concept: "infection_status",
            userTerm: "high risk",
            value: "infection_high",
          },
        ],
        timeRange: { unit: "months", value: 1 },
        confidence: 0.9,
        reasoning:
          "User requests patients at risk with specific wound and infection filters.",
      },
      forms: [
        buildForm(
          "Wound Assessment",
          [
            {
              fieldName: "Etiology",
              fieldId: "field-etiology",
              semanticConcept: "wound_classification",
              dataType: "SingleSelectList",
              confidence: 0.95,
            },
          ],
          0.95,
          "Contains wound classification."
        ),
        buildForm(
          "Infection Log",
          [
            {
              fieldName: "Infection Risk",
              fieldId: "field-infection-status",
              semanticConcept: "infection_status",
              dataType: "SingleSelectList",
              confidence: 0.89,
            },
          ],
          0.89,
          "Captures infection status ratings."
        ),
      ],
      terminology: [
        buildTerminology(
          "diabetic wounds",
          "wound_classification:diabetic_ulcer",
          "Etiology",
          "Diabetic Foot Ulcer",
          "Wound Assessment",
          0.97
        ),
        buildTerminology(
          "high risk",
          "infection_status:infection_high",
          "Infection Risk",
          "High Risk",
          "Infection Log",
          0.9
        ),
      ],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          0.99
        ),
      ],
      overallConfidence: 0.9,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "quality-metrics-compliance",
    question:
      "What is the reassessment compliance rate for wound patients in the last 30 days?",
    intent: {
      type: "quality_metrics",
      scope: "aggregate",
      metrics: ["reassessment_compliance_rate"],
      filters: [],
      timeRange: { unit: "days", value: 30 },
      confidence: 0.88,
      reasoning:
        "Question asks for a compliance quality metric over a time period.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-reassessment-date",
        fieldName: "Reassessment Date",
        formName: "Quality Check",
        semanticConcept: "reassessment_date",
        dataType: "Date",
        confidence: 0.91,
      },
      {
        source: "form",
        id: "field-compliance-flag",
        fieldName: "Compliance Flag",
        formName: "Quality Check",
        semanticConcept: "compliance_flag",
        dataType: "Boolean",
        confidence: 0.86,
      },
    ],
    terminology: [],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        0.95
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "What is the reassessment compliance rate for wound patients in the last 30 days?",
      intent: {
        type: "quality_metrics",
        scope: "aggregate",
        metrics: ["reassessment_compliance_rate"],
        filters: [],
        timeRange: { unit: "days", value: 30 },
        confidence: 0.88,
        reasoning:
          "Question asks for a compliance quality metric over a time period.",
      },
      forms: [
        buildForm(
          "Quality Check",
          [
            {
              fieldName: "Reassessment Date",
              fieldId: "field-reassessment-date",
              semanticConcept: "reassessment_date",
              dataType: "Date",
              confidence: 0.91,
            },
            {
              fieldName: "Compliance Flag",
              fieldId: "field-compliance-flag",
              semanticConcept: "compliance_flag",
              dataType: "Boolean",
              confidence: 0.86,
            },
          ],
          0.9,
          "Tracks reassessment compliance."
        ),
      ],
      terminology: [],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          0.95
        ),
      ],
      overallConfidence: 0.87,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "operational-metrics-duration",
    question:
      "Average assessment duration per clinic unit last month for wound patients.",
    intent: {
      type: "operational_metrics",
      scope: "aggregate",
      metrics: ["assessment_duration"],
      filters: [
        {
          concept: "organizational_unit",
          userTerm: "clinic unit",
        },
      ],
      timeRange: { unit: "months", value: 1 },
      confidence: 0.89,
      reasoning:
        "Operational question regarding assessment duration grouped by unit.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-assessment-duration",
        fieldName: "Assessment Duration",
        formName: "Operations Tracker",
        semanticConcept: "assessment_duration",
        dataType: "Duration",
        confidence: 0.9,
      },
      {
        source: "form",
        id: "field-unit",
        fieldName: "Unit",
        formName: "Wound Assessment",
        semanticConcept: "organizational_unit",
        dataType: "Lookup",
        confidence: 0.88,
      },
      {
        source: "non_form",
        id: "nonform-unit-name",
        fieldName: "name",
        tableName: "rpt.Unit",
        semanticConcept: "organizational_unit",
        dataType: "varchar",
        confidence: 0.9,
      },
    ],
    terminology: [],
    joinPaths: [
      buildJoinPath(
        ["rpt.Unit", "rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Unit",
            rightTable: "rpt.Patient",
            condition: "rpt.Unit.id = rpt.Patient.unitFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        0.96
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "Average assessment duration per clinic unit last month for wound patients.",
      intent: {
        type: "operational_metrics",
        scope: "aggregate",
        metrics: ["assessment_duration"],
        filters: [
          {
            concept: "organizational_unit",
            userTerm: "clinic unit",
          },
        ],
        timeRange: { unit: "months", value: 1 },
        confidence: 0.89,
        reasoning:
          "Operational question regarding assessment duration grouped by unit.",
      },
      forms: [
        buildForm(
          "Operations Tracker",
          [
            {
              fieldName: "Assessment Duration",
              fieldId: "field-assessment-duration",
              semanticConcept: "assessment_duration",
              dataType: "Duration",
              confidence: 0.9,
            },
          ],
          0.9,
          "Tracks assessment timings."
        ),
        buildForm(
          "Wound Assessment",
          [
            {
              fieldName: "Unit",
              fieldId: "field-unit",
              semanticConcept: "organizational_unit",
              dataType: "Lookup",
              confidence: 0.88,
            },
          ],
          0.88,
          "Contains organizational unit references."
        ),
      ],
      terminology: [],
      joinPaths: [
        buildJoinPath(
          ["rpt.Unit", "rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Unit",
              rightTable: "rpt.Patient",
              condition: "rpt.Unit.id = rpt.Patient.unitFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          0.96
        ),
      ],
      overallConfidence: 0.88,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "outcome-analysis-pressure-stage3",
    question:
      "Average healing rate for stage 3 pressure injuries over the past 90 days.",
    intent: {
      type: "outcome_analysis",
      scope: "patient_cohort",
      metrics: ["healing_rate"],
      filters: [
        {
          concept: "pressure_injury_stage",
          userTerm: "stage 3",
          value: "pressure_stage_3",
        },
      ],
      timeRange: { unit: "days", value: 90 },
      confidence: 0.9,
      reasoning:
        "Outcome metric for pressure injury stage over specific time window.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-pressure-injury-stage",
        fieldName: "Pressure Injury Stage",
        formName: "Wound Assessment",
        semanticConcept: "pressure_injury_stage",
        dataType: "SingleSelectList",
        confidence: 0.87,
      },
      {
        source: "form",
        id: "field-healing-rate",
        fieldName: "Healing Rate",
        formName: "Wound Assessment",
        semanticConcept: "healing_rate",
        dataType: "Numeric",
        confidence: 0.92,
      },
    ],
    terminology: [
      buildTerminology(
        "stage 3",
        "pressure_injury_stage:pressure_stage_3",
        "Pressure Injury Stage",
        "Stage 3",
        "Wound Assessment",
        0.89
      ),
    ],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        0.97
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "Average healing rate for stage 3 pressure injuries over the past 90 days.",
      intent: {
        type: "outcome_analysis",
        scope: "patient_cohort",
        metrics: ["healing_rate"],
        filters: [
          {
            concept: "pressure_injury_stage",
            userTerm: "stage 3",
            value: "pressure_stage_3",
          },
        ],
        timeRange: { unit: "days", value: 90 },
        confidence: 0.9,
        reasoning:
          "Outcome metric for pressure injury stage over specific time window.",
      },
      forms: [
        buildForm(
          "Wound Assessment",
          [
            {
              fieldName: "Pressure Injury Stage",
              fieldId: "field-pressure-injury-stage",
              semanticConcept: "pressure_injury_stage",
              dataType: "SingleSelectList",
              confidence: 0.87,
            },
            {
              fieldName: "Healing Rate",
              fieldId: "field-healing-rate",
              semanticConcept: "healing_rate",
              dataType: "Numeric",
              confidence: 0.92,
            },
          ],
          0.92,
          "Contains pressure injury classification and healing metrics."
        ),
      ],
      terminology: [
        buildTerminology(
          "stage 3",
          "pressure_injury_stage:pressure_stage_3",
          "Pressure Injury Stage",
          "Stage 3",
          "Wound Assessment",
          0.89
        ),
      ],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          0.97
        ),
      ],
      overallConfidence: 0.9,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "trend-analysis-assessment-count",
    question:
      "Trend of average assessment count per patient for diabetic wounds over the last 6 months.",
    intent: {
      type: "trend_analysis",
      scope: "patient_cohort",
      metrics: ["assessment_count"],
      filters: [
        {
          concept: "wound_classification",
          userTerm: "diabetic wounds",
          value: "diabetic_ulcer",
        },
      ],
      timeRange: { unit: "months", value: 6 },
      confidence: 0.89,
      reasoning:
        "Requests assessment count trends for a specific wound cohort.",
    },
    semanticResults: [
      {
        source: "form",
        id: "field-assessment-count",
        fieldName: "Assessment Count",
        formName: "Assessment Series",
        semanticConcept: "assessment_count",
        dataType: "Numeric",
        confidence: 0.85,
      },
      {
        source: "form",
        id: "field-etiology",
        fieldName: "Etiology",
        formName: "Wound Assessment",
        semanticConcept: "wound_classification",
        dataType: "SingleSelectList",
        confidence: 0.95,
      },
    ],
    terminology: [
      buildTerminology(
        "diabetic wounds",
        "wound_classification:diabetic_ulcer",
        "Etiology",
        "Diabetic Foot Ulcer",
        "Wound Assessment",
        0.97
      ),
    ],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Wound",
            condition: "rpt.Patient.id = rpt.Wound.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Wound",
            rightTable: "rpt.Assessment",
            condition: "rpt.Wound.id = rpt.Assessment.woundFk",
            cardinality: "1:N",
          },
        ],
        0.96
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "Trend of average assessment count per patient for diabetic wounds over the last 6 months.",
      intent: {
        type: "trend_analysis",
        scope: "patient_cohort",
        metrics: ["assessment_count"],
        filters: [
          {
            concept: "wound_classification",
            userTerm: "diabetic wounds",
            value: "diabetic_ulcer",
          },
        ],
        timeRange: { unit: "months", value: 6 },
        confidence: 0.89,
        reasoning:
          "Requests assessment count trends for a specific wound cohort.",
      },
      forms: [
        buildForm(
          "Assessment Series",
          [
            {
              fieldName: "Assessment Count",
              fieldId: "field-assessment-count",
              semanticConcept: "assessment_count",
              dataType: "Numeric",
              confidence: 0.85,
            },
          ],
          0.85,
          "Captures count of assessments per series."
        ),
        buildForm(
          "Wound Assessment",
          [
            {
              fieldName: "Etiology",
              fieldId: "field-etiology",
              semanticConcept: "wound_classification",
              dataType: "SingleSelectList",
              confidence: 0.95,
            },
          ],
          0.95,
          "Contains wound classification."
        ),
      ],
      terminology: [
        buildTerminology(
          "diabetic wounds",
          "wound_classification:diabetic_ulcer",
          "Etiology",
          "Diabetic Foot Ulcer",
          "Wound Assessment",
          0.97
        ),
      ],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          0.96
        ),
      ],
      overallConfidence: 0.88,
      metadata: { ...BASE_METADATA },
    },
  },
  {
    id: "operational-metrics-encounter-duration",
    question:
      "Average encounter duration for diabetic wound patients by visit in the past quarter.",
    intent: {
      type: "operational_metrics",
      scope: "aggregate",
      metrics: ["encounter_duration"],
      filters: [
        {
          concept: "wound_classification",
          userTerm: "diabetic wounds",
          value: "diabetic_ulcer",
        },
      ],
      timeRange: { unit: "months", value: 3 },
      confidence: 0.87,
      reasoning:
        "Operational metric focusing on encounter/visit durations for a cohort.",
    },
    semanticResults: [
      {
        source: "non_form",
        id: "nonform-assessment-date",
        fieldName: "assessedAt",
        tableName: "rpt.Assessment",
        semanticConcept: "assessment_date",
        dataType: "timestamp",
        confidence: 0.86,
      },
      {
        source: "form",
        id: "field-etiology",
        fieldName: "Etiology",
        formName: "Wound Assessment",
        semanticConcept: "wound_classification",
        dataType: "SingleSelectList",
        confidence: 0.95,
      },
    ],
    terminology: [
      buildTerminology(
        "diabetic wounds",
        "wound_classification:diabetic_ulcer",
        "Etiology",
        "Diabetic Foot Ulcer",
        "Wound Assessment",
        0.97
      ),
    ],
    joinPaths: [
      buildJoinPath(
        ["rpt.Patient", "rpt.Encounter", "rpt.Visit"],
        [
          {
            leftTable: "rpt.Patient",
            rightTable: "rpt.Encounter",
            condition: "rpt.Patient.id = rpt.Encounter.patientFk",
            cardinality: "1:N",
          },
          {
            leftTable: "rpt.Encounter",
            rightTable: "rpt.Visit",
            condition: "rpt.Encounter.id = rpt.Visit.encounterFk",
            cardinality: "1:N",
          },
        ],
        0.94
      ),
    ],
    expectedBundle: {
      customerId: MOCK_CUSTOMER.id,
      question:
        "Average encounter duration for diabetic wound patients by visit in the past quarter.",
      intent: {
        type: "operational_metrics",
        scope: "aggregate",
        metrics: ["encounter_duration"],
        filters: [
          {
            concept: "wound_classification",
            userTerm: "diabetic wounds",
            value: "diabetic_ulcer",
          },
        ],
        timeRange: { unit: "months", value: 3 },
        confidence: 0.87,
        reasoning:
          "Operational metric focusing on encounter/visit durations for a cohort.",
      },
      forms: [
        buildForm(
          "Wound Assessment",
          [
            {
              fieldName: "Etiology",
              fieldId: "field-etiology",
              semanticConcept: "wound_classification",
              dataType: "SingleSelectList",
              confidence: 0.95,
            },
          ],
          0.95,
          "Contains wound classification."
        ),
      ],
      terminology: [
        buildTerminology(
          "diabetic wounds",
          "wound_classification:diabetic_ulcer",
          "Etiology",
          "Diabetic Foot Ulcer",
          "Wound Assessment",
          0.97
        ),
      ],
      joinPaths: [
        buildJoinPath(
          ["rpt.Patient", "rpt.Encounter", "rpt.Visit"],
          [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Encounter",
              condition: "rpt.Patient.id = rpt.Encounter.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Encounter",
              rightTable: "rpt.Visit",
              condition: "rpt.Encounter.id = rpt.Visit.encounterFk",
              cardinality: "1:N",
            },
          ],
          0.94
        ),
      ],
      overallConfidence: 0.86,
      metadata: { ...BASE_METADATA },
    },
  },
];

export const CONTEXT_DISCOVERY_FIXTURE_MAP = new Map(
  CONTEXT_DISCOVERY_FIXTURES.map((fixture) => [fixture.id, fixture])
);

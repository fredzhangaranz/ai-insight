import { describe, expect, it } from "vitest";
import type { FieldSpec, FieldSchema } from "../generation-spec.types";
import type { FieldProfileSet } from "../trajectory-field-profile.types";
import {
  compileAssessmentForm,
  evaluateFieldVisibility,
  generateVisibleAssessmentFields,
} from "../assessment-form.service";

const baseStage = {
  area: 12,
  depth: 1,
  perimeter: 14,
  volume: 10,
};

function buildField(
  partial: Partial<FieldSchema> & Pick<FieldSchema, "fieldName" | "columnName" | "dataType">
): FieldSchema {
  return {
    fieldName: partial.fieldName,
    columnName: partial.columnName,
    dataType: partial.dataType,
    isNullable: partial.isNullable ?? true,
    storageType: "wound_attribute",
    attributeTypeId: partial.attributeTypeId ?? `${partial.columnName}-attr`,
    options: partial.options,
    min: partial.min,
    max: partial.max,
    calculatedValueExpression: partial.calculatedValueExpression ?? null,
    visibilityExpression: partial.visibilityExpression ?? null,
    attributeSetOrderIndex: partial.attributeSetOrderIndex ?? 1,
    attributeOrderIndex: partial.attributeOrderIndex ?? 1,
    isGeneratable: partial.isGeneratable,
  };
}

describe("assessment-form.service", () => {
  it("compiles dependencies from visibility expressions", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Parent",
        columnName: "parent",
        dataType: "SingleSelectList",
        options: ["Show", "Hide"],
      }),
      buildField({
        fieldName: "Child",
        columnName: "child",
        dataType: "Text",
        visibilityExpression: "IsNull(parent, '') == 'Show'",
      }),
    ]);

    expect(compiled.blockingDiagnostics).toHaveLength(0);
    expect(compiled.fieldByColumn.get("child")?.dependencies).toEqual(["parent"]);
  });

  it("reports unknown field references and unreachable ListContains branches", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Existing Dressing",
        columnName: "edc",
        dataType: "MultiSelectList",
        options: ["Clean", "Dry"],
      }),
      buildField({
        fieldName: "Contaminant",
        columnName: "contaminant",
        dataType: "Text",
        visibilityExpression:
          "ListContains(edc, 'Contamination') && HasValue(missing_field)",
      }),
    ]);

    expect(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === "unknown_visibility_reference")
    ).toBe(true);
    expect(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === "unreachable_visibility_branch")
    ).toBe(true);
  });

  it("reports non-generatable dependency references", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Info Header",
        columnName: "info_header",
        dataType: "Information",
        isGeneratable: false,
      }),
      buildField({
        fieldName: "Child",
        columnName: "child",
        dataType: "Text",
        visibilityExpression: "HasValue(info_header)",
      }),
    ]);

    expect(
      compiled.diagnostics.some(
        (diagnostic) => diagnostic.code === "non_generatable_visibility_reference"
      )
    ).toBe(true);
  });

  it("fails closed on invalid function arity", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Bad Arity",
        columnName: "bad_arity",
        dataType: "Text",
        visibilityExpression: "HasValue(parent, child)",
      }),
    ]);

    expect(
      compiled.blockingDiagnostics.some((diagnostic) =>
        diagnostic.message.includes('Function "HasValue" expects 1 argument(s), got 2')
      )
    ).toBe(true);
  });

  it("detects cyclic visibility dependencies", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "A",
        columnName: "field_a",
        dataType: "Text",
        visibilityExpression: "HasValue(field_b)",
      }),
      buildField({
        fieldName: "B",
        columnName: "field_b",
        dataType: "Text",
        visibilityExpression: "HasValue(field_a)",
      }),
    ]);

    expect(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === "cyclic_visibility_dependency")
    ).toBe(true);
  });

  it("generates visible child fields when parent answer matches", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Parent",
        columnName: "parent",
        dataType: "SingleSelectList",
        options: ["Show", "Hide"],
        attributeOrderIndex: 1,
      }),
      buildField({
        fieldName: "Child",
        columnName: "child",
        dataType: "Text",
        visibilityExpression: "parent == 'Show'",
        isNullable: false,
        attributeOrderIndex: 2,
      }),
    ]);

    const fieldSpecs = new Map<string, FieldSpec>([
      [
        "parent",
        {
          fieldName: "Parent",
          columnName: "parent",
          dataType: "SingleSelectList",
          enabled: true,
          criteria: { type: "fixed", value: "Show" },
        },
      ],
      [
        "child",
        {
          fieldName: "Child",
          columnName: "child",
          dataType: "Text",
          enabled: true,
          criteria: { type: "fixed", value: "Visible child" },
        },
      ],
    ]);

    const result = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: fieldSpecs,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });

    expect(result.generated.map((field) => field.field.columnName)).toEqual([
      "parent",
      "child",
    ]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(false);
  });

  it("omits hidden child fields when parent answer does not match", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Parent",
        columnName: "parent",
        dataType: "SingleSelectList",
        options: ["Show", "Hide"],
        attributeOrderIndex: 1,
      }),
      buildField({
        fieldName: "Child",
        columnName: "child",
        dataType: "Text",
        visibilityExpression: "parent == 'Show'",
        attributeOrderIndex: 2,
      }),
    ]);

    const fieldSpecs = new Map<string, FieldSpec>([
      [
        "parent",
        {
          fieldName: "Parent",
          columnName: "parent",
          dataType: "SingleSelectList",
          enabled: true,
          criteria: { type: "fixed", value: "Hide" },
        },
      ],
      [
        "child",
        {
          fieldName: "Child",
          columnName: "child",
          dataType: "Text",
          enabled: true,
          criteria: { type: "fixed", value: "Hidden child" },
        },
      ],
    ]);

    const result = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: fieldSpecs,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });

    expect(result.generated.map((field) => field.field.columnName)).toEqual(["parent"]);
  });

  it("supports ListContains for multi-select visibility", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Existing Dressing",
        columnName: "edc",
        dataType: "MultiSelectList",
        options: ["Clean", "Contamination"],
        attributeOrderIndex: 1,
      }),
      buildField({
        fieldName: "Contaminant",
        columnName: "contaminant",
        dataType: "Text",
        visibilityExpression: "ListContains(edc, 'Contamination')",
        attributeOrderIndex: 2,
      }),
    ]);

    const fieldSpecs = new Map<string, FieldSpec>([
      [
        "edc",
        {
          fieldName: "Existing Dressing",
          columnName: "edc",
          dataType: "MultiSelectList",
          enabled: true,
          criteria: { type: "fixed", value: "Contamination" },
        },
      ],
      [
        "contaminant",
        {
          fieldName: "Contaminant",
          columnName: "contaminant",
          dataType: "Text",
          enabled: true,
          criteria: { type: "fixed", value: "Faeces" },
        },
      ],
    ]);

    const result = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: fieldSpecs,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });

    expect(result.generated.map((field) => field.field.columnName)).toContain("contaminant");
  });

  it("uses seeded context for visibility without returning the seeded selector as generated output", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Wound State",
        columnName: "wound_state",
        dataType: "SingleSelectList",
        options: ["Open", "Healed"],
        attributeOrderIndex: 1,
      }),
      buildField({
        fieldName: "Recurring",
        columnName: "recurring",
        dataType: "Boolean",
        visibilityExpression: "wound_state == 'Open'",
        attributeOrderIndex: 2,
      }),
    ]);

    const result = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: new Map(),
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 1,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
      seededContextByColumn: new Map([
        ["wound_state", { value: "Open", serializedValue: "Open" }],
      ]),
      restrictToColumns: new Set(["recurring"]),
    });

    expect(result.generated.map((field) => field.field.columnName)).toEqual([
      "recurring",
    ]);
  });

  it("reports invalid generated values against min/max constraints", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Skin Tone",
        columnName: "skin_tone",
        dataType: "Integer",
        min: 1,
        max: 6,
        isNullable: false,
      }),
    ]);

    const fieldSpecs = new Map<string, FieldSpec>([
      [
        "skin_tone",
        {
          fieldName: "Skin Tone",
          columnName: "skin_tone",
          dataType: "Integer",
          enabled: true,
          criteria: { type: "fixed", value: 99 },
        },
      ],
    ]);

    const result = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: fieldSpecs,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });

    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === "invalid_generated_value")
    ).toBe(true);
  });

  it("evaluates visibility expressions against typed context", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Change Required",
        columnName: "change_required",
        dataType: "Boolean",
      }),
      buildField({
        fieldName: "Details",
        columnName: "details",
        dataType: "Text",
        visibilityExpression: "IsNull(change_required, false) == true",
      }),
    ]);

    const context = new Map<string, string | number | boolean | Date | string[] | null>([
      ["change_required", true],
    ]);

    expect(
      evaluateFieldVisibility(compiled.fieldByColumn.get("details")!, context)
    ).toBe(true);
  });

  it("supports ParseInt, ListLength, comparisons, and boolean composition", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Gate",
        columnName: "gate",
        dataType: "Text",
        visibilityExpression:
          "ParseInt(score) >= 3 && ListLength(flags) > 1 && !HasNoValue(status) && IsNull(note, '') != 'skip'",
      }),
    ]);
    const context = new Map<string, string | number | boolean | Date | string[] | null>([
      ["score", "4"],
      ["flags", ["A", "B"]],
      ["status", "present"],
      ["note", null],
    ]);

    expect(evaluateFieldVisibility(compiled.fieldByColumn.get("gate")!, context)).toBe(true);
  });

  it("falls back to a valid required multi-select option when generated value is invalid", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Exudate Type",
        columnName: "exudate_type",
        dataType: "MultiSelectList",
        options: ["Serous", "Purulent"],
        isNullable: false,
      }),
    ]);

    const fieldSpecs = new Map<string, FieldSpec>([
      [
        "exudate_type",
        {
          fieldName: "Exudate Type",
          columnName: "exudate_type",
          dataType: "MultiSelectList",
          enabled: true,
          criteria: { type: "fixed", value: "None" },
        },
      ],
    ]);

    const result = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: fieldSpecs,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 2,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });

    expect(result.generated).toHaveLength(1);
    expect(result.generated[0].serializedValue).toBe("Serous");
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "warning" &&
          diagnostic.code === "invalid_generated_value"
      )
    ).toBe(true);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "error" &&
          diagnostic.code === "missing_visible_required_field"
      )
    ).toBe(false);
  });

  it("keeps fixed-per-wound value stable across assessments once cached", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Wound Type",
        columnName: "wound_type",
        dataType: "SingleSelectList",
        options: ["Pressure", "Burn"],
      }),
    ]);

    const firstFieldSpecs = new Map<string, FieldSpec>([
      [
        "wound_type",
        {
          fieldName: "Wound Type",
          columnName: "wound_type",
          dataType: "SingleSelectList",
          enabled: true,
          criteria: { type: "fixed", value: "Pressure" },
        },
      ],
    ]);
    const secondFieldSpecs = new Map<string, FieldSpec>([
      [
        "wound_type",
        {
          fieldName: "Wound Type",
          columnName: "wound_type",
          dataType: "SingleSelectList",
          enabled: true,
          criteria: { type: "fixed", value: "Burn" },
        },
      ],
    ]);

    const cache = new Map<string, ReturnType<typeof generateVisibleAssessmentFields>["generated"][number]>();
    const first = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: firstFieldSpecs,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: cache,
    });
    const second = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: secondFieldSpecs,
      progressionStyle: "Exponential",
      assessmentIdx: 1,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: cache,
    });

    expect(first.generated[0]?.serializedValue).toBe("Pressure");
    expect(second.generated[0]?.serializedValue).toBe("Pressure");
  });

  it("reuses per-wound profile values across later assessments", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Wound Classification",
        columnName: "wound_classification",
        dataType: "SingleSelectList",
        options: ["Pressure Injury", "Burn"],
      }),
    ]);

    const fieldProfiles: FieldProfileSet = [
      {
        trajectoryStyle: "Exponential",
        clinicalSummary: "Fast healing",
        phases: [
          {
            phase: "early",
            description: "Early",
            fieldDistributions: [
              {
                fieldName: "Wound Classification",
                columnName: "wound_classification",
                behavior: "per_wound",
                weights: {
                  "Pressure Injury": 1,
                  Burn: 0,
                },
              },
            ],
          },
          {
            phase: "mid",
            description: "Mid",
            fieldDistributions: [
              {
                fieldName: "Wound Classification",
                columnName: "wound_classification",
                behavior: "per_wound",
                weights: {
                  "Pressure Injury": 0,
                  Burn: 1,
                },
              },
            ],
          },
          {
            phase: "late",
            description: "Late",
            fieldDistributions: [
              {
                fieldName: "Wound Classification",
                columnName: "wound_classification",
                behavior: "per_wound",
                weights: {
                  "Pressure Injury": 0,
                  Burn: 1,
                },
              },
            ],
          },
        ],
      },
    ];

    const cache = new Map<string, ReturnType<typeof generateVisibleAssessmentFields>["generated"][number]>();
    const first = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: new Map(),
      fieldProfiles,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: cache,
    });
    const second = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: new Map(),
      fieldProfiles,
      progressionStyle: "Exponential",
      assessmentIdx: 1,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: cache,
    });

    expect(first.generated[0]?.serializedValue).toBe("Pressure Injury");
    expect(second.generated[0]?.serializedValue).toBe("Pressure Injury");
  });

  it("keeps per-assessment profile values phase-specific", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Infection Status",
        columnName: "infection_status",
        dataType: "SingleSelectList",
        options: ["No signs", "Local infection suspected"],
      }),
    ]);

    const fieldProfiles: FieldProfileSet = [
      {
        trajectoryStyle: "Exponential",
        clinicalSummary: "Fast healing",
        phases: [
          {
            phase: "early",
            description: "Early",
            fieldDistributions: [
              {
                fieldName: "Infection Status",
                columnName: "infection_status",
                behavior: "per_assessment",
                weights: {
                  "No signs": 1,
                  "Local infection suspected": 0,
                },
              },
            ],
          },
          {
            phase: "mid",
            description: "Mid",
            fieldDistributions: [
              {
                fieldName: "Infection Status",
                columnName: "infection_status",
                behavior: "per_assessment",
                weights: {
                  "No signs": 0,
                  "Local infection suspected": 1,
                },
              },
            ],
          },
          {
            phase: "late",
            description: "Late",
            fieldDistributions: [
              {
                fieldName: "Infection Status",
                columnName: "infection_status",
                behavior: "per_assessment",
                weights: {
                  "No signs": 0,
                  "Local infection suspected": 1,
                },
              },
            ],
          },
        ],
      },
    ];

    const first = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: new Map(),
      fieldProfiles,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });
    const second = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: new Map(),
      fieldProfiles,
      progressionStyle: "Exponential",
      assessmentIdx: 1,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });

    expect(first.generated[0]?.serializedValue).toBe("No signs");
    expect(second.generated[0]?.serializedValue).toBe("Local infection suspected");
  });

  it("skips generic profile sampling for system-controlled fields", () => {
    const compiled = compileAssessmentForm([
      buildField({
        fieldName: "Wound State",
        columnName: "wound_state",
        dataType: "SingleSelectList",
        options: ["Open", "Healed"],
      }),
    ]);

    const fieldProfiles: FieldProfileSet = [
      {
        trajectoryStyle: "Exponential",
        clinicalSummary: "Fast healing",
        phases: [
          {
            phase: "early",
            description: "Early",
            fieldDistributions: [
              {
                fieldName: "Wound State",
                columnName: "wound_state",
                behavior: "system",
                weights: {
                  Open: 0,
                  Healed: 1,
                },
              },
            ],
          },
          {
            phase: "mid",
            description: "Mid",
            fieldDistributions: [],
          },
          {
            phase: "late",
            description: "Late",
            fieldDistributions: [],
          },
        ],
      },
    ];

    const fieldSpecs = new Map<string, FieldSpec>([
      [
        "wound_state",
        {
          fieldName: "Wound State",
          columnName: "wound_state",
          dataType: "SingleSelectList",
          enabled: true,
          criteria: { type: "fixed", value: "Open" },
        },
      ],
    ]);

    const result = generateVisibleAssessmentFields({
      compiledForm: compiled,
      fieldSpecsByColumn: fieldSpecs,
      fieldProfiles,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 3,
      stage: baseStage,
      fixedPerWoundCache: new Map(),
    });

    expect(result.generated[0]?.serializedValue).toBe("Open");
  });
});

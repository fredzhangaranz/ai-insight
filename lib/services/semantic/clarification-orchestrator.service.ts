import type {
  AssessmentTypeInContext,
  ContextBundle,
  SemanticQueryFrame,
} from "../context-discovery/types";
import type { ClarificationOption, ClarificationRequest } from "@/lib/prompts/generate-query.prompt";
import type { FilterCandidateMatch, MappedFilter } from "../context-discovery/terminology-mapper.service";
import type { UnresolvedFilterInfo, ValidationError } from "./filter-validator.service";
import { buildUnresolvedFilterClarificationId } from "./filter-validator.service";

export type ClarificationReasonCode =
  | "missing_measure"
  | "unclear_grain"
  | "ambiguous_field"
  | "ambiguous_value"
  | "invalid_value"
  | "missing_entity"
  | "missing_time_window"
  | "ambiguous_assessment_type"
  | "computable_vague_term";

export type ClarificationTargetType =
  | "measure"
  | "grain"
  | "field"
  | "value"
  | "assessment_type"
  | "entity"
  | "time_window"
  | "threshold";

export type ClarificationSource =
  | "semantic_frame"
  | "time_policy"
  | "threshold_policy"
  | "assessment_type"
  | "unresolved_filter"
  | "validation"
  | "template_placeholder"
  | "patient_resolution"
  | "sql_llm";

export interface ClarificationTelemetrySummary {
  requestedCount: number;
  bySource: Record<string, number>;
  byReasonCode: Record<string, number>;
  byTargetType: Record<string, number>;
}

export interface ClarificationDecision {
  id: string;
  ambiguousTerm: string;
  question: string;
  options: ClarificationOption[];
  allowCustom: boolean;
  reasonCode: ClarificationReasonCode;
  targetType: ClarificationTargetType;
  source: ClarificationSource;
  slot?: string;
  target?: string;
  reason?: string;
  evidence?: Record<string, unknown>;
  freeformPolicy?: ClarificationRequest["freeformPolicy"];
}

interface StructuredFilterSelection {
  kind: "filter_value" | "policy_filter";
  clarificationId: string;
  filterIndex?: number;
  field: string;
  value: string;
  operator?: string;
  userPhrase?: string;
  formName?: string;
  semanticConcept?: string;
}

const FILTER_SELECTION_PREFIX = "__FILTER_SELECTION__:";
const ASSESSMENT_TYPE_PREFIX = "__ASSESSMENT_TYPE__:";

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function encodeFilterSelection(
  payload: StructuredFilterSelection
): string {
  return `${FILTER_SELECTION_PREFIX}${encodePayload(payload)}`;
}

export function decodeFilterSelection(
  value?: string
): StructuredFilterSelection | null {
  if (!value?.startsWith(FILTER_SELECTION_PREFIX)) {
    return null;
  }
  return decodePayload<StructuredFilterSelection>(
    value.slice(FILTER_SELECTION_PREFIX.length)
  );
}

export function encodeAssessmentTypeSelection(assessmentTypeId: string): string {
  return `${ASSESSMENT_TYPE_PREFIX}${assessmentTypeId}`;
}

export function decodeAssessmentTypeSelection(value?: string): string | null {
  if (!value?.startsWith(ASSESSMENT_TYPE_PREFIX)) {
    return null;
  }
  const decoded = value.slice(ASSESSMENT_TYPE_PREFIX.length).trim();
  return decoded || null;
}

function temporalWordsPresent(text: string): boolean {
  return /\b(recent|latest|current|new|old|stale)\b/i.test(text);
}

function assessmentWordsPresent(text: string): boolean {
  return /\b(assessment|assessments|visit|visits|form|forms|note|notes|documentation)\b/i.test(
    text
  );
}

function trendWordsPresent(text: string): boolean {
  return /\b(trend|over time|daily|weekly|monthly|by month|by week|by day|per month|per week|per day)\b/i.test(
    text
  );
}

function sizeWordsPresent(text: string): boolean {
  return /\b(large|small|big|tiny)\b/i.test(text);
}

function severityWordsPresent(text: string): boolean {
  return /\b(severe|serious|critical|mild|moderate)\b/i.test(text);
}

interface ContextFieldCandidate {
  fieldName: string;
  semanticConcept: string;
  dataType: string;
  formName: string;
}

type FieldFamily =
  | "patient"
  | "wound"
  | "assessment"
  | "unit"
  | "clinic"
  | "healing"
  | "size"
  | "severity"
  | "infection"
  | "depth"
  | "stage"
  | "date";

interface StructuralContextProfile {
  fields: ContextFieldCandidate[];
  dateFields: ContextFieldCandidate[];
  byFamily: Record<FieldFamily, ContextFieldCandidate[]>;
  availableEntities: Record<"patient" | "wound" | "assessment" | "unit" | "clinic", boolean>;
}

function buildContextFields(context: ContextBundle): ContextFieldCandidate[] {
  return context.forms.flatMap((form) =>
    form.fields.map((field) => ({
      fieldName: field.fieldName,
      semanticConcept: field.semanticConcept || "",
      dataType: field.dataType || "",
      formName: form.formName,
    }))
  );
}

function matchesFamily(field: ContextFieldCandidate, family: FieldFamily): boolean {
  const text = `${field.fieldName} ${field.semanticConcept}`.toLowerCase();
  switch (family) {
    case "patient":
      return /\bpatient\b/.test(text);
    case "wound":
      return /\bwound\b/.test(text);
    case "assessment":
      return /\bassessment|visit|form|documentation\b/.test(text);
    case "unit":
      return /\bunit\b/.test(text);
    case "clinic":
      return /\bclinic\b/.test(text);
    case "healing":
      return /\bheal|healing|closure|reduction|epithelial/i.test(text);
    case "size":
      return /\barea|size|surface|length|width|volume\b/.test(text);
    case "severity":
      return /\bseverity|serious|critical|acuity|risk\b/.test(text);
    case "infection":
      return /\binfect/i.test(text);
    case "depth":
      return /\bdepth|thickness\b/.test(text);
    case "stage":
      return /\bstage|grade|classification\b/.test(text);
    case "date":
      return field.dataType === "date" || /\bdate|time|created|recorded|performed\b/.test(text);
    default:
      return false;
  }
}

function buildStructuralProfile(
  frame: SemanticQueryFrame,
  context: ContextBundle
): StructuralContextProfile {
  const fields = buildContextFields(context);
  const joinedPathText = `${context.joinPaths
    .flatMap((path) => [...path.path, ...path.tables])
    .join(" ")} ${fields.map((field) => field.fieldName).join(" ")}`.toLowerCase();
  const availableEntities = {
    patient:
      frame.subject.value === "patient" ||
      /\bpatient\b/.test(joinedPathText),
    wound:
      frame.subject.value === "wound" ||
      /\bwound\b/.test(joinedPathText),
    assessment:
      frame.subject.value === "assessment" ||
      Boolean(context.assessmentTypes?.length) ||
      /\bassessment\b/.test(joinedPathText),
    unit: frame.subject.value === "unit" || /\bunit\b/.test(joinedPathText),
    clinic: frame.subject.value === "clinic" || /\bclinic\b/.test(joinedPathText),
  };

  const families: FieldFamily[] = [
    "patient",
    "wound",
    "assessment",
    "unit",
    "clinic",
    "healing",
    "size",
    "severity",
    "infection",
    "depth",
    "stage",
    "date",
  ];

  const byFamily = Object.fromEntries(
    families.map((family) => [
      family,
      fields.filter((field) => matchesFamily(field, family)),
    ])
  ) as StructuralContextProfile["byFamily"];

  return {
    fields,
    dateFields: byFamily.date,
    byFamily,
    availableEntities,
  };
}

function appendEvidenceSource(
  evidence: Record<string, unknown> | undefined,
  source: ClarificationSource
): Record<string, unknown> {
  return {
    ...(evidence || {}),
    clarificationSource: source,
  };
}

function chooseBestField(
  fields: ContextFieldCandidate[],
  preferredFamilies: FieldFamily[]
): ContextFieldCandidate | undefined {
  for (const family of preferredFamilies) {
    const candidate = fields.find((field) => matchesFamily(field, family));
    if (candidate) {
      return candidate;
    }
  }
  return fields[0];
}

function uniqueCandidateMatches(
  matches: FilterCandidateMatch[] | undefined,
  limit: number = 5
): FilterCandidateMatch[] {
  if (!matches?.length) {
    return [];
  }

  const seen = new Set<string>();
  const unique: FilterCandidateMatch[] = [];

  for (const match of matches) {
    const key = `${match.field}::${match.value}::${match.formName || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(match);
    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

function buildFilterOptionDescription(match: FilterCandidateMatch): string {
  const details: string[] = [];
  if (match.field) details.push(`Field: ${match.field}`);
  if (match.formName) details.push(`Form: ${match.formName}`);
  if (match.semanticConcept) details.push(`Semantic: ${match.semanticConcept}`);
  details.push(`Match ${(match.confidence * 100).toFixed(0)}%`);
  return details.join(" • ");
}

function buildFilterOptions(
  clarificationId: string,
  filterIndex: number,
  matches: FilterCandidateMatch[]
): ClarificationOption[] {
  return uniqueCandidateMatches(matches).map((match, index) => ({
    id: `${clarificationId}_option_${index}`,
    label: match.value,
    description: buildFilterOptionDescription(match),
    sqlConstraint: "",
    submissionValue: encodeFilterSelection({
      kind: "filter_value",
      clarificationId,
      filterIndex,
      field: match.field,
      value: match.value,
      operator: "equals",
      userPhrase: match.value,
      formName: match.formName,
      semanticConcept: match.semanticConcept,
    }),
    kind: "semantic",
    isDefault: index === 0,
    selectionMapping: {
      field: match.field,
      value: match.value,
      formName: match.formName,
    },
    evidence: {
      confidence: match.confidence,
      semanticConcept: match.semanticConcept,
    },
  }));
}

function buildTimeRangeOptions(profile: StructuralContextProfile, question: string): ClarificationOption[] {
  const options = [
    {
      id: "time_30_days",
      label: "Last 30 days",
      description: "Recent activity in the past month",
      sqlConstraint: "",
      submissionValue: "30",
      kind: "semantic",
      isDefault: true,
    },
    {
      id: "time_90_days",
      label: "Last 90 days",
      description: "Recent activity in the past quarter",
      sqlConstraint: "",
      submissionValue: "90",
      kind: "semantic",
    },
    {
      id: "time_365_days",
      label: "Last 12 months",
      description: "Activity in the past year",
      sqlConstraint: "",
      submissionValue: "365",
      kind: "semantic",
    },
  ];

  const dateFieldNames = profile.dateFields.slice(0, 3).map((field) => field.fieldName);
  const fieldHint =
    dateFieldNames.length > 0
      ? ` using ${dateFieldNames.join(", ")}`
      : "";

  const questionLower = question.toLowerCase();
  if (/\bold|stale\b/.test(questionLower)) {
    options[0].label = "Older than 90 days";
    options[0].description = `Items older than 90 days${fieldHint}`;
    options[0].submissionValue = "90";
    options[1].label = "Older than 180 days";
    options[1].description = `Items older than 180 days${fieldHint}`;
    options[1].submissionValue = "180";
    options[2].label = "Older than 12 months";
    options[2].description = `Items older than 12 months${fieldHint}`;
  } else {
    options.forEach((option) => {
      option.description = `${option.description}${fieldHint}`;
    });
  }

  return options;
}

function buildMeasureOptions(
  frame: SemanticQueryFrame,
  context: ContextBundle
): ClarificationOption[] {
  const profile = buildStructuralProfile(frame, context);
  const options: ClarificationOption[] = [];
  const add = (
    id: string,
    label: string,
    submissionValue: string,
    description: string,
    score: number,
    isDefault: boolean = false
  ) => {
    if (options.some((option) => option.submissionValue === submissionValue)) {
      return;
    }
    options.push({
      id,
      label,
      description,
      sqlConstraint: "",
      submissionValue,
      kind: "semantic",
      isDefault,
      evidence: {
        score,
      },
    });
  };

  const subject = frame.subject.value || "patient";
  if (profile.availableEntities.patient) {
    add(
      "measure_patient_count",
      "Patient count",
      "patient_count",
      "Count matching patients in the cohort",
      subject === "patient" ? 1 : 0.7,
      subject === "patient"
    );
  }
  if (profile.availableEntities.wound) {
    add(
      "measure_wound_count",
      "Wound count",
      "wound_count",
      "Count matching wounds",
      subject === "wound" ? 1 : 0.78,
      subject === "wound"
    );
  }
  if (profile.availableEntities.assessment) {
    add(
      "measure_assessment_count",
      "Assessment count",
      "assessment_count",
      "Count matching assessments or visits",
      subject === "assessment" ? 1 : 0.82,
      subject === "assessment"
    );
  }

  if (profile.byFamily.healing.length > 0) {
    add(
      "measure_healing_rate",
      "Healing rate",
      "healing_rate",
      `Use healing metrics from ${profile.byFamily.healing
        .slice(0, 2)
        .map((field) => field.fieldName)
        .join(", ")}`,
      0.9
    );
  }

  return options
    .sort((left, right) => {
      const leftScore = Number(left.evidence?.score || 0);
      const rightScore = Number(right.evidence?.score || 0);
      if (left.isDefault) return -1;
      if (right.isDefault) return 1;
      return rightScore - leftScore;
    })
    .slice(0, 4);
}

function buildGrainOptions(
  frame: SemanticQueryFrame,
  context: ContextBundle
): ClarificationOption[] {
  const profile = buildStructuralProfile(frame, context);
  const options: ClarificationOption[] = [];
  const add = (
    id: string,
    label: string,
    submissionValue: string,
    description: string,
    isDefault: boolean = false
  ) => {
    if (options.some((option) => option.submissionValue === submissionValue)) {
      return;
    }
    options.push({
      id,
      label,
      description,
      sqlConstraint: "",
      submissionValue,
      kind: "semantic",
      isDefault,
    });
  };

  const subject = frame.subject.value || "patient";
  add(
    "grain_total",
    "Total result",
    "total",
    "Return a single aggregate result",
    frame.groupBy.value.length === 0
  );

  if (
    profile.availableEntities.patient &&
    (subject === "patient" || subject === "unknown" || subject === "wound" || subject === "assessment")
  ) {
    add("grain_patient", "Group by patient", "per_patient", "One row or bar per patient", subject === "patient");
  }
  if (
    profile.availableEntities.wound &&
    (subject === "wound" || subject === "patient" || subject === "unknown")
  ) {
    add("grain_wound", "Group by wound", "per_wound", "One row or bar per wound", subject === "wound");
  }
  if (profile.availableEntities.assessment && (subject === "assessment" || context.assessmentTypes?.length)) {
    add(
      "grain_assessment",
      "Group by assessment",
      "per_assessment",
      "One row or bar per assessment",
      subject === "assessment"
    );
  }

  if (profile.availableEntities.unit) {
    add("grain_unit", "Group by unit", "per_unit", "One row or bar per unit");
  }

  if (profile.availableEntities.clinic) {
    add("grain_clinic", "Group by clinic", "per_clinic", "One row or bar per clinic");
  }

  if (profile.dateFields.length > 0 && (trendWordsPresent(context.question) || Boolean(frame.timeRange))) {
    add("grain_month", "Group by month", "per_month", "Trend aggregated by month", frame.grain.value === "per_month");
    add("grain_week", "Group by week", "per_week", "Trend aggregated by week", frame.grain.value === "per_week");
    add("grain_day", "Group by day", "per_day", "Trend aggregated by day", frame.grain.value === "per_day");
  }

  return options.slice(0, 4);
}

function buildAssessmentTypeOptions(
  assessmentTypes: AssessmentTypeInContext[]
): ClarificationOption[] {
  return assessmentTypes.slice(0, 5).map((assessment, index) => ({
    id: `assessment_type_${assessment.assessmentTypeId}`,
    label: assessment.assessmentName,
    description: `${assessment.semanticCategory} • matched because ${assessment.reason}`,
    sqlConstraint: "",
    submissionValue: encodeAssessmentTypeSelection(assessment.assessmentTypeId),
    kind: "semantic",
    isDefault: index === 0,
    selectionMapping: {
      assessmentTypeId: assessment.assessmentTypeId,
      semanticConcept: assessment.semanticConcept,
    },
    evidence: {
      confidence: assessment.confidence,
    },
  }));
}

function buildPolicyFilterOption(params: {
  clarificationId: string;
  optionId: string;
  label: string;
  description: string;
  field: ContextFieldCandidate;
  value: string;
  operator?: string;
  userPhrase: string;
  isDefault?: boolean;
}): ClarificationOption {
  return {
    id: params.optionId,
    label: params.label,
    description: `${params.description} • Field: ${params.field.fieldName} • Form: ${params.field.formName}`,
    sqlConstraint: "",
    submissionValue: encodeFilterSelection({
      kind: "policy_filter",
      clarificationId: params.clarificationId,
      filterIndex: -1,
      field: params.field.fieldName,
      value: params.value,
      operator: params.operator || "equals",
      userPhrase: params.userPhrase,
      formName: params.field.formName,
      semanticConcept: params.field.semanticConcept,
    }),
    kind: "semantic",
    isDefault: params.isDefault,
    selectionMapping: {
      field: params.field.fieldName,
      value: params.value,
      operator: params.operator || "equals",
    },
    evidence: {
      semanticConcept: params.field.semanticConcept,
      formName: params.field.formName,
    },
  };
}

function buildThresholdClarifications(
  frame: SemanticQueryFrame,
  context: ContextBundle
): ClarificationDecision[] {
  const profile = buildStructuralProfile(frame, context);
  const clarifications: ClarificationDecision[] = [];
  const questionLower = context.question.toLowerCase();

  if (sizeWordsPresent(questionLower) && profile.byFamily.size.length > 0) {
    const sizeField = chooseBestField(profile.byFamily.size, ["size"]);
    if (sizeField) {
      clarifications.push({
        id: "frame_slot_threshold_size",
        ambiguousTerm: /\b(large|small|big|tiny)\b/i.exec(context.question)?.[1] || "size",
        question: `How should I define "${/\b(large|small|big|tiny)\b/i.exec(context.question)?.[1] || "large"}" for this query?`,
        options: [
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_size",
            optionId: "size_gt_10",
            label: "Area greater than 10 cm²",
            description: "A moderate size threshold",
            field: sizeField,
            value: "10",
            operator: "greater_than",
            userPhrase: "large wounds",
          }),
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_size",
            optionId: "size_gt_25",
            label: "Area greater than 25 cm²",
            description: "A common clinical threshold for larger wounds",
            field: sizeField,
            value: "25",
            operator: "greater_than",
            userPhrase: "large wounds",
            isDefault: true,
          }),
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_size",
            optionId: "size_gt_50",
            label: "Area greater than 50 cm²",
            description: "Only very large wounds",
            field: sizeField,
            value: "50",
            operator: "greater_than",
            userPhrase: "large wounds",
          }),
        ],
        allowCustom: true,
        reasonCode: "computable_vague_term",
        targetType: "threshold",
        source: "threshold_policy",
        slot: "valueFilter",
        reason: "The question uses a vague size term that should be converted into an explicit threshold.",
        evidence: appendEvidenceSource(
          {
            selectedField: sizeField.fieldName,
            availableFields: profile.byFamily.size.map((field) => field.fieldName),
          },
          "threshold_policy"
        ),
        freeformPolicy: {
          allowed: true,
          placeholder: 'Describe the wound size threshold you want',
          hint: 'For example: area > 15 cm²',
          minChars: 3,
          maxChars: 100,
        },
      });
    }
  }

  if (severityWordsPresent(questionLower)) {
    const severityField = chooseBestField(
      [
        ...profile.byFamily.severity,
        ...profile.byFamily.infection,
        ...profile.byFamily.depth,
        ...profile.byFamily.stage,
      ],
      ["severity", "infection", "depth", "stage"]
    );

    if (severityField) {
      const options: ClarificationOption[] = [];
      const fieldText = `${severityField.fieldName} ${severityField.semanticConcept}`.toLowerCase();
      if (/infect/i.test(fieldText)) {
        options.push(
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_severity",
            optionId: "severity_infected",
            label: "Infected wounds",
            description: "Treat severe as infection present",
            field: severityField,
            value: "Infected",
            userPhrase: "severe wounds",
            isDefault: true,
          })
        );
      }
      if (/depth|thickness/i.test(fieldText)) {
        options.push(
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_severity",
            optionId: "severity_full_thickness",
            label: "Full thickness wounds",
            description: "Treat severe as full-thickness depth",
            field: severityField,
            value: "Full Thickness",
            userPhrase: "severe wounds",
            isDefault: options.length === 0,
          })
        );
      }
      if (/stage|grade|classification/i.test(fieldText)) {
        options.push(
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_severity",
            optionId: "severity_stage_3",
            label: "Stage 3 wounds",
            description: "Treat severe as stage 3",
            field: severityField,
            value: "Stage 3",
            userPhrase: "severe wounds",
            isDefault: options.length === 0,
          })
        );
        options.push(
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_severity",
            optionId: "severity_stage_4",
            label: "Stage 4 wounds",
            description: "Treat severe as stage 4",
            field: severityField,
            value: "Stage 4",
            userPhrase: "severe wounds",
          })
        );
      }
      if (/severity|acuity|risk/i.test(fieldText)) {
        options.push(
          buildPolicyFilterOption({
            clarificationId: "frame_slot_threshold_severity",
            optionId: "severity_high",
            label: "High severity",
            description: "Use the highest explicit severity category",
            field: severityField,
            value: "High",
            userPhrase: "severe wounds",
            isDefault: options.length === 0,
          })
        );
      }

      if (options.length > 0) {
        clarifications.push({
          id: "frame_slot_threshold_severity",
          ambiguousTerm: /\b(severe|serious|critical|mild|moderate)\b/i.exec(context.question)?.[1] || "severity",
          question: `How should I define "${/\b(severe|serious|critical|mild|moderate)\b/i.exec(context.question)?.[1] || "severe"}" for this query?`,
          options,
          allowCustom: true,
          reasonCode: "computable_vague_term",
          targetType: "threshold",
          source: "threshold_policy",
          slot: "valueFilter",
          reason: "The question uses a vague severity term that should map to a concrete clinical filter.",
          evidence: appendEvidenceSource(
            {
              selectedField: severityField.fieldName,
              availableFields: [
                ...profile.byFamily.severity,
                ...profile.byFamily.infection,
                ...profile.byFamily.depth,
                ...profile.byFamily.stage,
              ].map((field) => field.fieldName),
            },
            "threshold_policy"
          ),
          freeformPolicy: {
            allowed: true,
            placeholder: 'Describe what "severe" should mean here',
            hint: 'For example: infected, stage 3, or full thickness',
            minChars: 3,
            maxChars: 100,
          },
        });
      }
    }
  }

  return clarifications;
}

export function summarizeClarificationRequests(
  requests: ClarificationRequest[] | undefined
): ClarificationTelemetrySummary | undefined {
  if (!requests || requests.length === 0) {
    return undefined;
  }

  const summary: ClarificationTelemetrySummary = {
    requestedCount: requests.length,
    bySource: {},
    byReasonCode: {},
    byTargetType: {},
  };

  requests.forEach((request) => {
    const source =
      typeof request.evidence?.clarificationSource === "string"
        ? request.evidence.clarificationSource
        : "unknown";
    summary.bySource[source] = (summary.bySource[source] || 0) + 1;
    if (request.reasonCode) {
      summary.byReasonCode[request.reasonCode] =
        (summary.byReasonCode[request.reasonCode] || 0) + 1;
    }
    if (request.targetType) {
      summary.byTargetType[request.targetType] =
        (summary.byTargetType[request.targetType] || 0) + 1;
    }
  });

  return summary;
}

export class DirectQueryClarificationService {
  buildFrameClarifications(
    frame: SemanticQueryFrame,
    context: ContextBundle
  ): ClarificationRequest[] {
    const clarifications: ClarificationDecision[] = frame.clarificationNeeds.map(
      (need) => {
        if (need.slot === "measure") {
          const measureOptions = buildMeasureOptions(frame, context);
          return {
            id: "frame_slot_measure",
            ambiguousTerm: frame.measure.value || "measure",
            question: need.question,
            options: measureOptions,
            allowCustom: false,
            reasonCode: "missing_measure",
            targetType: "measure",
            source: "semantic_frame",
            slot: "measure",
            reason: need.reason,
            evidence: appendEvidenceSource(
              {
                subject: frame.subject.value,
                forms: context.forms.map((form) => form.formName),
                supportedMeasures: measureOptions.map(
                  (option) => option.submissionValue
                ),
              },
              "semantic_frame"
            ),
          };
        }

        if (need.slot === "grain" || need.slot === "groupBy") {
          const grainOptions = buildGrainOptions(frame, context);
          return {
            id: "frame_slot_grain",
            ambiguousTerm: frame.grain.value || "grouping",
            question: need.question,
            options: grainOptions,
            allowCustom: false,
            reasonCode: "unclear_grain",
            targetType: "grain",
            source: "semantic_frame",
            slot: "grain",
            reason: need.reason,
            evidence: appendEvidenceSource(
              {
                subject: frame.subject.value,
                groupBy: frame.groupBy.value,
                supportedGrains: grainOptions.map(
                  (option) => option.submissionValue
                ),
              },
              "semantic_frame"
            ),
          };
        }

        if (need.slot === "scope") {
          return {
            id: "frame_slot_scope",
            ambiguousTerm: frame.scope.value || "scope",
            question: need.question,
            options: [
              {
                id: "scope_aggregate",
                label: "Aggregate result",
                description: "One overall summary result",
                sqlConstraint: "",
                submissionValue: "aggregate",
                kind: "semantic",
                isDefault: true,
              },
              {
                id: "scope_patient_cohort",
                label: "Patient cohort",
                description: "Return matching patients as a cohort",
                sqlConstraint: "",
                submissionValue: "patient_cohort",
                kind: "semantic",
              },
              {
                id: "scope_individual_patient",
                label: "Single patient",
                description: "Focus on one patient only",
                sqlConstraint: "",
                submissionValue: "individual_patient",
                kind: "semantic",
              },
            ],
            allowCustom: false,
            reasonCode: "missing_entity",
            targetType: "entity",
            source: "semantic_frame",
            slot: "scope",
            reason: need.reason,
            evidence: appendEvidenceSource(undefined, "semantic_frame"),
          };
        }

        return {
          id: `frame_slot_${need.slot}`,
          ambiguousTerm: need.slot,
          question: need.question,
          options: [
            {
              id: "continue",
              label: "Continue with best effort",
              description: "Keep the current interpretation",
              sqlConstraint: "",
              submissionValue: "__CONTINUE__",
              kind: "semantic",
              isDefault: true,
            },
          ],
          allowCustom: false,
          reasonCode: "computable_vague_term",
          targetType: "threshold",
          source: "semantic_frame",
          slot: need.slot,
          reason: need.reason,
          evidence: appendEvidenceSource(undefined, "semantic_frame"),
        };
      }
    );

    const profile = buildStructuralProfile(frame, context);
    if (
      !frame.timeRange &&
      temporalWordsPresent(context.question)
    ) {
      clarifications.push({
        id: "frame_slot_timeRange",
        ambiguousTerm: "time window",
        question: `What time window should I use for "${context.question}"?`,
        options: buildTimeRangeOptions(profile, context.question),
        allowCustom: true,
        reasonCode: "missing_time_window",
        targetType: "time_window",
        source: "time_policy",
        slot: "timeRange",
        reason: "The question implies a time-based filter but does not define the period precisely.",
        evidence: appendEvidenceSource(
          {
            dateFields: profile.dateFields.map((field) => field.fieldName),
          },
          "time_policy"
        ),
        freeformPolicy: {
          allowed: true,
          placeholder: "Enter a time window such as 30 days or 6 months",
          hint: "Use a concrete period so the query uses the correct date range.",
          minChars: 2,
          maxChars: 50,
        },
      });
    }

    if (
      assessmentWordsPresent(context.question) &&
      context.assessmentTypes &&
      context.assessmentTypes.length > 1
    ) {
      clarifications.push({
        id: "frame_slot_assessment_type",
        ambiguousTerm: "assessment type",
        question: "Which assessment type should I use for this query?",
        options: buildAssessmentTypeOptions(context.assessmentTypes),
        allowCustom: false,
        reasonCode: "ambiguous_assessment_type",
        targetType: "assessment_type",
        source: "assessment_type",
        slot: "assessmentType",
        reason: "Multiple customer-specific assessment types look relevant to this question.",
        evidence: appendEvidenceSource(
          {
            assessmentTypes: context.assessmentTypes.map((assessment) => ({
              assessmentTypeId: assessment.assessmentTypeId,
              assessmentName: assessment.assessmentName,
              confidence: assessment.confidence,
            })),
          },
          "assessment_type"
        ),
      });
    }

    clarifications.push(...buildThresholdClarifications(frame, context));

    return clarifications.map((decision) => this.toRequest(decision));
  }

  buildFilterClarifications(params: {
    unresolved: UnresolvedFilterInfo[];
    context: ContextBundle;
    validationErrors?: ValidationError[];
  }): ClarificationRequest[] {
    const validationByField = new Map<string, ValidationError>();
    params.validationErrors?.forEach((error) => {
      validationByField.set(error.field.toLowerCase(), error);
    });

    return params.unresolved.map((info) => {
      const phrase =
        info.filter.userPhrase || info.filter.field || `Filter ${info.index + 1}`;
      const clarificationId = buildUnresolvedFilterClarificationId(
        info.filter,
        info.index
      );
      const validationError = info.filter.field
        ? validationByField.get(info.filter.field.toLowerCase())
        : undefined;

      let options: ClarificationOption[] = [];
      let reasonCode: ClarificationReasonCode = "ambiguous_value";
      let reason =
        info.filter.validationWarning ||
        info.filter.mappingError ||
        "This filter needs clarification before the query can run.";

      if (validationError?.clarificationSuggestions?.length) {
        reasonCode = "invalid_value";
        options = validationError.clarificationSuggestions
          .filter((option) => option.label && option.id !== "custom")
          .map((option, index) => ({
            ...option,
            sqlConstraint: "",
            submissionValue: encodeFilterSelection({
              kind: "filter_value",
              clarificationId,
              filterIndex: info.index,
              field: info.filter.field || phrase,
              value: option.label,
            }),
            kind: "semantic",
            isDefault: index === 0,
            selectionMapping: {
              field: info.filter.field || phrase,
              value: option.label,
            },
          }));
        reason = validationError.message;
      } else if (info.filter.candidateMatches?.length) {
        reasonCode =
          info.filter.clarificationReasonCode === "ambiguous_field"
            ? "ambiguous_field"
            : "ambiguous_value";
        options = buildFilterOptions(
          clarificationId,
          info.index,
          info.filter.candidateMatches
        );
      }

      options.push({
        id: `${clarificationId}_remove`,
        label: "Remove this filter",
        description: "Proceed without applying this constraint",
        sqlConstraint: "__REMOVE_FILTER__",
        submissionValue: "__REMOVE_FILTER__",
        kind: "semantic",
        isDefault: false,
      });

      const decision: ClarificationDecision = {
        id: clarificationId,
        ambiguousTerm: phrase,
        question:
          options.length > 1
            ? `Which option did you mean by "${phrase}"?`
            : `What did you mean by "${phrase}" in this query?`,
        options,
        allowCustom: true,
        reasonCode,
        targetType: "value",
        source: validationError?.clarificationSuggestions?.length
          ? "validation"
          : "unresolved_filter",
        slot: "valueFilter",
        reason,
        evidence: appendEvidenceSource(
          {
            candidateMatches: (info.filter.candidateMatches || []).slice(0, 5),
            validationError: validationError?.message,
          },
          validationError?.clarificationSuggestions?.length
            ? "validation"
            : "unresolved_filter"
        ),
        freeformPolicy: {
          allowed: true,
          placeholder: `Describe what you meant by "${phrase}"`,
          hint: "Use a specific field value if none of the suggested options fit.",
          minChars: 2,
          maxChars: 200,
        },
      };

      return this.toRequest(decision);
    });
  }

  private toRequest(decision: ClarificationDecision): ClarificationRequest {
    return {
      id: decision.id,
      ambiguousTerm: decision.ambiguousTerm,
      question: decision.question,
      options: decision.options,
      allowCustom: decision.allowCustom,
      slot: decision.slot,
      target: decision.target,
      reason: decision.reason,
      reasonCode: decision.reasonCode,
      targetType: decision.targetType,
      evidence: appendEvidenceSource(decision.evidence, decision.source),
      freeformPolicy: decision.freeformPolicy,
    };
  }
}

let instance: DirectQueryClarificationService | null = null;

export function getDirectQueryClarificationService(): DirectQueryClarificationService {
  if (!instance) {
    instance = new DirectQueryClarificationService();
  }
  return instance;
}

export function applyStructuredFilterSelections(
  filters: MappedFilter[],
  clarifications?: Record<string, string>
): { filters: MappedFilter[]; handledIds: Set<string> } {
  if (!clarifications || Object.keys(clarifications).length === 0) {
    return { filters, handledIds: new Set<string>() };
  }

  const nextFilters = filters.map((filter) => ({ ...filter }));
  const handledIds = new Set<string>();

  Object.values(clarifications).forEach((selectionValue) => {
    const selection = decodeFilterSelection(selectionValue);
    if (!selection) return;
    const target =
      typeof selection.filterIndex === "number" && selection.filterIndex >= 0
        ? nextFilters[selection.filterIndex]
        : undefined;

    const resolvedFilter: MappedFilter = {
      ...(target || {
        operator: selection.operator || "equals",
        userPhrase: selection.userPhrase || selection.field,
      }),
      operator: selection.operator || target?.operator || "equals",
      userPhrase: selection.userPhrase || target?.userPhrase || selection.field,
      field: selection.field,
      value: selection.value,
      mappingConfidence: 0.98,
      resolutionConfidence: 0.98,
      resolutionStatus: "resolved",
      needsClarification: false,
      clarificationReasonCode: undefined,
      validationWarning: undefined,
      mappingError: undefined,
    };

    if (target && typeof selection.filterIndex === "number" && selection.filterIndex >= 0) {
      nextFilters[selection.filterIndex] = resolvedFilter;
    } else {
      nextFilters.push(resolvedFilter);
    }
    handledIds.add(selection.clarificationId);
  });

  return { filters: nextFilters, handledIds };
}

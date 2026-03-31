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

export interface ClarificationDecision {
  id: string;
  ambiguousTerm: string;
  question: string;
  options: ClarificationOption[];
  allowCustom: boolean;
  reasonCode: ClarificationReasonCode;
  targetType: ClarificationTargetType;
  slot?: string;
  target?: string;
  reason?: string;
  evidence?: Record<string, unknown>;
  freeformPolicy?: ClarificationRequest["freeformPolicy"];
}

interface StructuredFilterSelection {
  kind: "filter_value";
  clarificationId: string;
  filterIndex: number;
  field: string;
  value: string;
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

function buildTimeRangeOptions(): ClarificationOption[] {
  return [
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
}

function buildMeasureOptions(
  frame: SemanticQueryFrame,
  context: ContextBundle
): ClarificationOption[] {
  const fieldConcepts = new Set(
    context.forms.flatMap((form) =>
      form.fields.map((field) => field.semanticConcept?.toLowerCase() || "")
    )
  );
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
    "measure_patient_count",
    "Patient count",
    "patient_count",
    "How many patients match the criteria",
    subject === "patient"
  );
  add(
    "measure_wound_count",
    "Wound count",
    "wound_count",
    "How many wounds match the criteria",
    subject === "wound"
  );
  add(
    "measure_assessment_count",
    "Assessment count",
    "assessment_count",
    "How many assessments match the criteria",
    subject === "assessment" || context.assessmentTypes?.length ? !["patient", "wound"].includes(subject) : false
  );

  if (
    Array.from(fieldConcepts).some((concept) =>
      concept.includes("healing") || concept.includes("reduction")
    )
  ) {
    add(
      "measure_healing_rate",
      "Healing rate",
      "healing_rate",
      "Use a healing or reduction metric from the discovered fields"
    );
  }

  return options.slice(0, 4);
}

function buildGrainOptions(
  frame: SemanticQueryFrame,
  context: ContextBundle
): ClarificationOption[] {
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

  if (subject === "patient" || subject === "unknown") {
    add("grain_patient", "Group by patient", "per_patient", "One row or bar per patient", subject === "patient");
  }
  if (subject === "wound" || subject === "patient" || subject === "unknown") {
    add("grain_wound", "Group by wound", "per_wound", "One row or bar per wound", subject === "wound");
  }
  if (subject === "assessment" || context.assessmentTypes?.length) {
    add(
      "grain_assessment",
      "Group by assessment",
      "per_assessment",
      "One row or bar per assessment",
      subject === "assessment"
    );
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

export class DirectQueryClarificationService {
  buildFrameClarifications(
    frame: SemanticQueryFrame,
    context: ContextBundle
  ): ClarificationRequest[] {
    const clarifications: ClarificationDecision[] = frame.clarificationNeeds.map(
      (need) => {
        if (need.slot === "measure") {
          return {
            id: "frame_slot_measure",
            ambiguousTerm: frame.measure.value || "measure",
            question: need.question,
            options: buildMeasureOptions(frame, context),
            allowCustom: false,
            reasonCode: "missing_measure",
            targetType: "measure",
            slot: "measure",
            reason: need.reason,
            evidence: {
              subject: frame.subject.value,
              forms: context.forms.map((form) => form.formName),
            },
          };
        }

        if (need.slot === "grain" || need.slot === "groupBy") {
          return {
            id: "frame_slot_grain",
            ambiguousTerm: frame.grain.value || "grouping",
            question: need.question,
            options: buildGrainOptions(frame, context),
            allowCustom: false,
            reasonCode: "unclear_grain",
            targetType: "grain",
            slot: "grain",
            reason: need.reason,
            evidence: {
              subject: frame.subject.value,
              groupBy: frame.groupBy.value,
            },
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
            slot: "scope",
            reason: need.reason,
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
          slot: need.slot,
          reason: need.reason,
        };
      }
    );

    if (
      !frame.timeRange &&
      temporalWordsPresent(context.question)
    ) {
      clarifications.push({
        id: "frame_slot_timeRange",
        ambiguousTerm: "time window",
        question: `What time window should I use for "${context.question}"?`,
        options: buildTimeRangeOptions(),
        allowCustom: true,
        reasonCode: "missing_time_window",
        targetType: "time_window",
        slot: "timeRange",
        reason: "The question implies a time-based filter but does not define the period precisely.",
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
        slot: "assessmentType",
        reason: "Multiple customer-specific assessment types look relevant to this question.",
        evidence: {
          assessmentTypes: context.assessmentTypes.map((assessment) => ({
            assessmentTypeId: assessment.assessmentTypeId,
            assessmentName: assessment.assessmentName,
            confidence: assessment.confidence,
          })),
        },
      });
    }

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
        slot: "valueFilter",
        reason,
        evidence: {
          candidateMatches: (info.filter.candidateMatches || []).slice(0, 5),
          validationError: validationError?.message,
        },
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
      evidence: decision.evidence,
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
    const target = nextFilters[selection.filterIndex];
    if (!target) return;

    nextFilters[selection.filterIndex] = {
      ...target,
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
    handledIds.add(selection.clarificationId);
  });

  return { filters: nextFilters, handledIds };
}


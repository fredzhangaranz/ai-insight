import type {
  ClarificationOption,
  ClarificationRequest,
} from "@/lib/prompts/generate-query.prompt";
import type {
  CanonicalClarificationItem,
  CanonicalQuerySemantics,
  ContextBundle,
  TerminologyMapping,
} from "../context-discovery/types";
import { encodeAssessmentTypeSelection } from "./clarification-orchestrator.service";
import {
  extractPatientNameCandidateFromQuestion,
  isLikelyPatientNameCandidate,
} from "../patient-entity-resolver.service";

interface PlannerInput {
  question: string;
  context: ContextBundle;
  canonicalSemantics: CanonicalQuerySemantics;
}

interface PlannerResult {
  clarifications: ClarificationRequest[];
  clarifiedSemantics: CanonicalQuerySemantics;
  autoResolvedCount: number;
}

function toPlannerOptionId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function toDisplayLabel(rawValue: string): string {
  return rawValue
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeTargetLabel(item: CanonicalClarificationItem): string {
  const target = item.target?.trim();
  if (!target) {
    if (item.slot === "timeRange") return "date range";
    if (item.slot === "entityRef") return "patient or entity";
    if (item.slot === "assessmentType") return "assessment type";
    if (item.slot === "valueFilter") return "filter value";
    if (item.slot === "measure") return "metric";
    if (item.slot === "grain" || item.slot === "groupBy") return "grouping";
    return item.slot;
  }

  const lower = target.toLowerCase();
  if (lower === "temporalspec") return "date range";
  return target;
}

function targetTypeForSlot(slot: CanonicalClarificationItem["slot"]): string {
  if (slot === "assessmentType") return "assessment_type";
  if (slot === "entityRef") return "entity";
  if (slot === "timeRange") return "time_window";
  if (slot === "measure") return "measure";
  if (slot === "grain" || slot === "groupBy") return "grain";
  return "value";
}

function fallbackQuestion(item: CanonicalClarificationItem): string {
  if (item.question?.trim()) return item.question;
  const targetLabel = normalizeTargetLabel(item);
  if (item.slot === "timeRange") {
    return "What date range should I use?";
  }
  if (item.slot === "measure") {
    return "Which metric should I analyze?";
  }
  if (item.slot === "grain" || item.slot === "groupBy") {
    return "How should results be grouped?";
  }
  if (item.slot === "assessmentType") {
    return "Which assessment type should I use?";
  }
  if (item.slot === "entityRef") {
    return "Which specific patient or entity should I use?";
  }
  return `Please clarify ${targetLabel} so I can run this query safely.`;
}

function rankMappingsForItem(
  item: CanonicalClarificationItem,
  mappings: TerminologyMapping[]
): TerminologyMapping[] {
  const evidence = item.evidence;
  const userPhrase = evidence?.userPhrase?.toLowerCase();
  const matchedValues = new Set((evidence?.matchedValues || []).map((v) => v.toLowerCase()));
  const matchedFields = new Set((evidence?.matchedFields || []).map((v) => v.toLowerCase()));

  return mappings
    .filter((mapping) => {
      if (userPhrase && mapping.userTerm.toLowerCase() === userPhrase) return true;
      if (matchedValues.size > 0 && matchedValues.has(mapping.fieldValue.toLowerCase())) return true;
      if (matchedFields.size > 0 && matchedFields.has(mapping.fieldName.toLowerCase())) return true;
      return false;
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function hasDominantCandidate(candidates: TerminologyMapping[]): boolean {
  if (candidates.length === 0) return false;
  if (candidates.length === 1) return candidates[0].confidence >= 0.8;
  return (
    candidates[0].confidence >= 0.85 &&
    candidates[0].confidence - candidates[1].confidence >= 0.1
  );
}

function makeOption(
  id: string,
  label: string,
  value: string,
  isDefault = false,
  evidence?: Record<string, unknown>
): ClarificationOption {
  return {
    id,
    label,
    sqlConstraint: value,
    submissionValue: value,
    kind: "semantic",
    isDefault,
    evidence,
  };
}

function buildTimeRangeOptions(item: CanonicalClarificationItem): ClarificationOption[] {
  const target = normalizeTargetLabel(item);
  return [
    makeOption("time_last_30_days", "Last 30 days", "last 30 days"),
    makeOption("time_last_90_days", "Last 90 days", "last 90 days"),
    makeOption("time_last_180_days", "Last 180 days", "last 180 days", true),
    makeOption("time_last_12_months", "Last 12 months", "last 12 months"),
    makeOption("time_all_available", "All available dates", "all available dates"),
  ].map((option) => ({
    ...option,
    evidence: {
      ...(option.evidence || {}),
      target,
      source: "time_policy_defaults",
    },
  }));
}

function buildMeasureOptions(input: PlannerInput): ClarificationOption[] {
  const metrics = Array.from(
    new Set(
      [
        ...(input.canonicalSemantics.measureSpec.metrics || []),
        ...(input.context.intent.metrics || []),
      ].filter((metric) => typeof metric === "string" && metric.trim().length > 0)
    )
  );

  const preferred = metrics.length > 0 ? metrics : ["patient_count", "wound_count", "assessment_count"];
  return preferred.slice(0, 5).map((metric, index) =>
    makeOption(
      `measure_${toPlannerOptionId(metric)}`,
      toDisplayLabel(metric),
      metric,
      index === 0
    )
  );
}

function buildGrainOptions(): ClarificationOption[] {
  const grains = [
    { id: "grain_total", label: "Overall total", value: "total", isDefault: true },
    { id: "grain_per_patient", label: "By patient", value: "per_patient" },
    { id: "grain_per_wound", label: "By wound", value: "per_wound" },
    { id: "grain_per_assessment", label: "By assessment", value: "per_assessment" },
    { id: "grain_per_month", label: "By month", value: "per_month" },
  ];
  return grains.map((grain) =>
    makeOption(grain.id, grain.label, grain.value, grain.isDefault)
  );
}

function buildEntityReferenceOptions(
  input: PlannerInput,
  item: CanonicalClarificationItem
): ClarificationOption[] {
  const targetEntity = (item.target || "").toLowerCase();
  const genericEntityMentions = new Set([
    "patient",
    "patients",
    "entity",
    "entities",
    "this patient",
    "same patient",
    "him",
    "her",
    "them",
  ]);
  const isSpecificEntityMention = (value: string): boolean => {
    const mention = value.trim();
    if (!mention) {
      return false;
    }
    if (genericEntityMentions.has(mention.toLowerCase())) {
      return false;
    }
    if (targetEntity === "patient") {
      return (
        isLikelyPatientNameCandidate(mention) || /\d|[-_]/.test(mention)
      );
    }
    return true;
  };
  const candidates = input.canonicalSemantics.subjectRefs.filter((ref) => {
    if (!ref.mentionText?.trim()) return false;
    if (!isSpecificEntityMention(ref.mentionText)) return false;
    if (!targetEntity) return true;
    return ref.entityType.toLowerCase() === targetEntity;
  });

  const baseOptions = candidates.slice(0, 5).map((ref, index) =>
    makeOption(
      `entity_${toPlannerOptionId(ref.mentionText)}`,
      ref.mentionText,
      ref.mentionText,
      index === 0 && ref.confidence >= 0.85,
      {
        entityType: ref.entityType,
        confidence: ref.confidence,
      }
    )
  );

  if (baseOptions.length > 0) {
    return baseOptions;
  }

  const extractedName = extractPatientNameCandidateFromQuestion(input.question);
  if (!extractedName) {
    return [];
  }

  return [
    makeOption(
      `entity_${toPlannerOptionId(extractedName)}`,
      extractedName,
      extractedName,
      true,
      { source: "question_name_extractor", confidence: 0.8 }
    ),
  ];
}

function buildSlotFallbackOptions(
  input: PlannerInput,
  item: CanonicalClarificationItem
): ClarificationOption[] {
  if (item.slot === "timeRange") {
    return buildTimeRangeOptions(item);
  }
  if (item.slot === "measure") {
    return buildMeasureOptions(input);
  }
  if (item.slot === "grain" || item.slot === "groupBy") {
    return buildGrainOptions();
  }
  if (item.slot === "entityRef") {
    return buildEntityReferenceOptions(input, item);
  }
  return [];
}

export class GroundedClarificationPlannerService {
  plan(input: PlannerInput): PlannerResult {
    const filteredPlan: CanonicalClarificationItem[] = [];
    const clarifications: ClarificationRequest[] = [];
    let autoResolvedCount = 0;

    input.canonicalSemantics.clarificationPlan.forEach((item, index) => {
      if (!item.blocking) {
        filteredPlan.push(item);
        return;
      }

      if (item.slot === "valueFilter") {
        const candidates = rankMappingsForItem(item, input.context.terminology);
        if (hasDominantCandidate(candidates)) {
          autoResolvedCount += 1;
          return;
        }

        if (candidates.length > 0) {
          clarifications.push({
            id: `grounded_${item.slot}_${index}`,
            ambiguousTerm: item.target || item.slot,
            question: fallbackQuestion(item),
            options: candidates.slice(0, 5).map((candidate, candidateIndex) => ({
              id: `${toPlannerOptionId(candidate.fieldName)}_${toPlannerOptionId(candidate.fieldValue)}`,
              label: `${candidate.fieldValue} (${candidate.fieldName})`,
              sqlConstraint: candidate.fieldValue,
              submissionValue: candidate.fieldValue,
              kind: "semantic",
              isDefault: candidateIndex === 0 && candidate.confidence >= 0.8,
              evidence: {
                confidence: candidate.confidence,
                fieldName: candidate.fieldName,
                semanticConcept: candidate.semanticConcept,
              },
            })),
            allowCustom: true,
            slot: item.slot,
            target: item.target,
            reason: item.reason,
            reasonCode: item.reasonCode,
            targetType: "value",
            evidence: {
              clarificationSource: "grounded_clarification_planner",
              planner: "grounded_clarification_planner",
              canonicalEvidence: item.evidence || null,
              source: "terminology_mapping",
            },
          });
          filteredPlan.push(item);
          return;
        }
      }

      if (
        item.slot === "timeRange" &&
        (input.canonicalSemantics.temporalSpec.kind === "absolute_range" ||
          input.canonicalSemantics.temporalSpec.kind === "relative_range")
      ) {
        autoResolvedCount += 1;
        return;
      }

      if (
        item.slot === "assessmentType" &&
        Array.isArray(input.context.assessmentTypes) &&
        input.context.assessmentTypes.length > 1
      ) {
        clarifications.push({
          id: `grounded_${item.slot}_${index}`,
          ambiguousTerm: item.target || "assessment type",
          question: fallbackQuestion(item),
          options: input.context.assessmentTypes.slice(0, 6).map((assessment, optionIndex) => ({
            id: `assessment_type_${assessment.assessmentTypeId}`,
            label: assessment.assessmentName,
            sqlConstraint: encodeAssessmentTypeSelection(assessment.assessmentTypeId),
            submissionValue: encodeAssessmentTypeSelection(assessment.assessmentTypeId),
            kind: "semantic",
            isDefault: optionIndex === 0 && assessment.confidence >= 0.8,
            evidence: {
              confidence: assessment.confidence,
              semanticConcept: assessment.semanticConcept,
            },
          })),
          allowCustom: false,
          slot: item.slot,
          target: item.target,
          reason: item.reason,
          reasonCode: item.reasonCode,
          targetType: "assessment_type",
          evidence: {
            clarificationSource: "grounded_clarification_planner",
            planner: "grounded_clarification_planner",
            canonicalEvidence: item.evidence || null,
            source: "assessment_type_search",
          },
        });
        filteredPlan.push(item);
        return;
      }

      const fallbackOptions = buildSlotFallbackOptions(input, item);

      clarifications.push({
        id: `grounded_${item.slot}_${index}`,
        ambiguousTerm: normalizeTargetLabel(item),
        question: fallbackQuestion(item),
        options: fallbackOptions,
        allowCustom: fallbackOptions.length === 0,
        slot: item.slot,
        target: item.target,
        reason: item.reason,
        reasonCode: item.reasonCode,
        targetType: targetTypeForSlot(item.slot),
        evidence: {
          clarificationSource: "grounded_clarification_planner",
          planner: "grounded_clarification_planner",
          canonicalEvidence: item.evidence || null,
          source:
            fallbackOptions.length > 0 ? "slot_policy_defaults" : "fallback",
          fallbackOptionsCount: fallbackOptions.length,
        },
      });
      filteredPlan.push(item);
    });

    const stillBlocked = filteredPlan.some((item) => item.blocking);
    return {
      clarifications,
      autoResolvedCount,
      clarifiedSemantics: {
        ...input.canonicalSemantics,
        clarificationPlan: filteredPlan,
        executionRequirements: {
          ...input.canonicalSemantics.executionRequirements,
          allowSqlGeneration: stillBlocked ? false : true,
          blockReason: stillBlocked
            ? input.canonicalSemantics.executionRequirements.blockReason
            : undefined,
        },
      },
    };
  }
}

let plannerSingleton: GroundedClarificationPlannerService | null = null;

export function getGroundedClarificationPlannerService(): GroundedClarificationPlannerService {
  if (!plannerSingleton) {
    plannerSingleton = new GroundedClarificationPlannerService();
  }
  return plannerSingleton;
}

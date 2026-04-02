import type { ClarificationRequest } from "@/lib/prompts/generate-query.prompt";
import type {
  CanonicalClarificationItem,
  ClarificationSlot,
  CanonicalQuerySemantics,
  ContextBundle,
  TerminologyMapping,
} from "../context-discovery/types";
import {
  extractPatientNameCandidateFromQuestion,
  isLikelyPatientNameCandidate,
} from "../patient-entity-resolver.service";
import { isPatientLikeEntityRefTarget } from "@/lib/utils/canonical-thread-patient-merge";

interface PlannerInput {
  question: string;
  context: ContextBundle;
  canonicalSemantics: CanonicalQuerySemantics;
}

interface PlannerResult {
  clarifications: ClarificationRequest[];
  clarifiedSemantics: CanonicalQuerySemantics;
  autoResolvedCount: number;
  decisionMetadata: PlannerDecisionMetadata;
}

export type PlannerDecisionMode =
  | "auto_resolved"
  | "optionized"
  | "freeform_fallback"
  | "deferred_to_resolver";

export interface PlannerDecisionItem {
  slot: ClarificationSlot;
  reasonCode: CanonicalClarificationItem["reasonCode"];
  candidateCount: number;
  autoResolved: boolean;
  mode: PlannerDecisionMode;
}

export interface PlannerDecisionMetadata {
  source: "grounded_clarification_planner";
  autoResolvedCount: number;
  optionizedCount: number;
  freeformFallbackCount: number;
  deferredToResolverCount: number;
  items: PlannerDecisionItem[];
}

interface PlannerSlotPolicy {
  autoResolveConfidence: number;
  dominanceDelta: number;
  maxOptions: number;
  allowCustomWithOptions: boolean;
}

interface OptionCandidate {
  id: string;
  label: string;
  submissionValue: string;
  confidence: number;
  evidence?: Record<string, unknown>;
}

const SLOT_POLICY: Record<ClarificationSlot, PlannerSlotPolicy> = {
  scope: {
    autoResolveConfidence: 0.95,
    dominanceDelta: 0.2,
    maxOptions: 4,
    allowCustomWithOptions: false,
  },
  subject: {
    autoResolveConfidence: 0.92,
    dominanceDelta: 0.15,
    maxOptions: 5,
    allowCustomWithOptions: false,
  },
  measure: {
    autoResolveConfidence: 0.85,
    dominanceDelta: 0.1,
    maxOptions: 6,
    allowCustomWithOptions: false,
  },
  grain: {
    autoResolveConfidence: 0.86,
    dominanceDelta: 0.1,
    maxOptions: 6,
    allowCustomWithOptions: true,
  },
  groupBy: {
    autoResolveConfidence: 0.95,
    dominanceDelta: 0.2,
    maxOptions: 6,
    allowCustomWithOptions: true,
  },
  timeRange: {
    autoResolveConfidence: 0.9,
    dominanceDelta: 0.1,
    maxOptions: 6,
    allowCustomWithOptions: false,
  },
  assessmentType: {
    autoResolveConfidence: 0.85,
    dominanceDelta: 0.1,
    maxOptions: 6,
    allowCustomWithOptions: false,
  },
  aggregatePredicate: {
    autoResolveConfidence: 0.95,
    dominanceDelta: 0.2,
    maxOptions: 4,
    allowCustomWithOptions: true,
  },
  entityRef: {
    autoResolveConfidence: 0.95,
    dominanceDelta: 0.2,
    maxOptions: 6,
    allowCustomWithOptions: false,
  },
  valueFilter: {
    autoResolveConfidence: 0.85,
    dominanceDelta: 0.1,
    maxOptions: 6,
    allowCustomWithOptions: true,
  },
};

const MEASURE_LABELS: Record<string, string> = {
  patient_count: "Patient count",
  wound_count: "Wound count",
  assessment_count: "Assessment count",
  healing_rate: "Healing rate",
  average_healing_rate: "Average healing rate",
};

const GRAIN_LABELS: Record<string, string> = {
  total: "Overall total",
  per_patient: "Per patient",
  per_wound: "Per wound",
  per_assessment: "Per assessment",
  per_unit: "Per unit",
  per_clinic: "Per clinic",
  per_month: "Per month",
  per_week: "Per week",
  per_day: "Per day",
};

function toPlannerOptionId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeInternalPathToken(value: string): string {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  return trimmed.replace(/[_-]+/g, " ").trim();
}

function extractValueSpecLiteral(target?: string): string | null {
  if (!target || typeof target !== "string") {
    return null;
  }
  const normalized = target.trim();
  const match = normalized.match(
    /^valueSpecs?(?:\[\d+\])?\.value\.(.+)$/i
  );
  if (!match || !match[1]) {
    return null;
  }
  const literal = normalizeInternalPathToken(match[1]);
  return literal.length > 0 ? literal : null;
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
  const literalValue = extractValueSpecLiteral(target);
  if (literalValue) return `filter value "${literalValue}"`;
  if (lower.startsWith("valuespec")) return "filter value";
  return target;
}

const GENERIC_PATIENT_MENTIONS = new Set([
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

function isGenericPatientMention(mentionText: string): boolean {
  return GENERIC_PATIENT_MENTIONS.has(mentionText.trim().toLowerCase());
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
    if (targetLabel && !isPatientLikeEntityRefTarget(targetLabel)) {
      return `Which specific ${targetLabel} should I use?`;
    }
    return "Which specific patient or entity should I use?";
  }
  return `Please clarify ${targetLabel} so I can run this query safely.`;
}

function rankMappingsForItem(
  item: CanonicalClarificationItem,
  mappings: TerminologyMapping[],
  context: ContextBundle
): OptionCandidate[] {
  const policy = SLOT_POLICY.valueFilter;
  const evidence = item.evidence;
  const userPhrase = evidence?.userPhrase?.toLowerCase();
  const matchedValues = new Set((evidence?.matchedValues || []).map((v) => v.toLowerCase()));
  const matchedFields = new Set((evidence?.matchedFields || []).map((v) => v.toLowerCase()));
  const matchedConcepts = new Set(
    (evidence?.matchedConcepts || []).map((concept) => concept.toLowerCase())
  );
  const relevanceTerms = new Set(
    [userPhrase, item.target?.toLowerCase()].filter(Boolean) as string[]
  );
  const impliedLiteralValue = extractValueSpecLiteral(item.target);
  if (impliedLiteralValue) {
    matchedValues.add(impliedLiteralValue.toLowerCase());
  }
  const candidates = new Map<string, OptionCandidate>();

  const addCandidate = (
    source: "terminology" | "candidate_match" | "evidence",
    params: {
      fieldName: string;
      fieldValue: string;
      confidence: number;
      semanticConcept?: string;
      formName?: string;
      userTerm?: string;
    }
  ) => {
    const key = `${params.fieldName.toLowerCase()}::${params.fieldValue.toLowerCase()}`;
    const existing = candidates.get(key);
    const nextCandidate: OptionCandidate = {
      id: `${toPlannerOptionId(params.fieldName)}_${toPlannerOptionId(params.fieldValue)}`,
      label: `${params.fieldValue} (${params.fieldName})`,
      submissionValue: params.fieldValue,
      confidence: params.confidence,
      evidence: {
        source,
        fieldName: params.fieldName,
        semanticConcept: params.semanticConcept,
        formName: params.formName,
        userTerm: params.userTerm,
      },
    };
    if (!existing || nextCandidate.confidence > existing.confidence) {
      candidates.set(key, nextCandidate);
    }
  };

  mappings.forEach((mapping) => {
    const mappingTokens = [
      mapping.userTerm,
      mapping.fieldName,
      mapping.fieldValue,
      mapping.semanticConcept,
    ].map((token) => token.toLowerCase());
    const isRelevant =
      relevanceTerms.size === 0 ||
      mappingTokens.some((token) =>
        Array.from(relevanceTerms).some((term) => token.includes(term))
      ) ||
      matchedValues.has(mapping.fieldValue.toLowerCase()) ||
      matchedFields.has(mapping.fieldName.toLowerCase()) ||
      matchedConcepts.has(mapping.semanticConcept.toLowerCase());
    if (!isRelevant) {
      return;
    }
    addCandidate("terminology", {
      fieldName: mapping.fieldName,
      fieldValue: mapping.fieldValue,
      confidence: mapping.confidence,
      semanticConcept: mapping.semanticConcept,
      formName: mapping.formName,
      userTerm: mapping.userTerm,
    });
  });

  context.intent.filters.forEach((filter) => {
    const mappedFilter = filter as typeof filter & {
      candidateMatches?: Array<{
        field?: string;
        value?: string;
        confidence?: number;
        formName?: string;
        semanticConcept?: string;
      }>;
      userPhrase?: string;
    };
    mappedFilter.candidateMatches?.forEach((candidateMatch) => {
      if (!candidateMatch.field || !candidateMatch.value) {
        return;
      }
      addCandidate("candidate_match", {
        fieldName: candidateMatch.field,
        fieldValue: candidateMatch.value,
        confidence:
          typeof candidateMatch.confidence === "number"
            ? candidateMatch.confidence
            : policy.autoResolveConfidence,
        semanticConcept: candidateMatch.semanticConcept,
        formName: candidateMatch.formName,
        userTerm: mappedFilter.userPhrase,
      });
    });
  });

  if (matchedValues.size > 0) {
    const fallbackField = Array.from(matchedFields)[0] || normalizeTargetLabel(item);
    Array.from(matchedValues).forEach((value) => {
      addCandidate("evidence", {
        fieldName: fallbackField,
        fieldValue: value,
        confidence: 0.76,
      });
    });
  }

  return Array.from(candidates.values()).sort(
    (a, b) => b.confidence - a.confidence
  );
}

function hasDominantCandidate(
  candidates: OptionCandidate[],
  policy: PlannerSlotPolicy
): boolean {
  if (candidates.length === 0) return false;
  if (candidates.length === 1) {
    return candidates[0].confidence >= policy.autoResolveConfidence;
  }
  return (
    candidates[0].confidence >= policy.autoResolveConfidence &&
    candidates[0].confidence - candidates[1].confidence >= policy.dominanceDelta
  );
}

function buildMeasureCandidates(
  input: PlannerInput
): OptionCandidate[] {
  const metrics = new Set<string>();
  input.canonicalSemantics.measureSpec.metrics.forEach((metric) => {
    if (metric) metrics.add(metric);
  });
  input.context.intent.metrics.forEach((metric) => {
    if (metric) metrics.add(metric);
  });

  return Array.from(metrics).map((metric) => ({
    id: `measure_${toPlannerOptionId(metric)}`,
    label: MEASURE_LABELS[metric] || metric.replace(/_/g, " "),
    submissionValue: metric,
    confidence: input.canonicalSemantics.measureSpec.metrics.includes(metric)
      ? 0.9
      : 0.8,
    evidence: {
      source: "measure_spec",
    },
  }));
}

function inferQuestionGrainCandidates(question: string): OptionCandidate[] {
  const normalized = question.toLowerCase();
  if (/\bper day\b|\bdaily\b|\bby day\b/.test(normalized)) {
    return [
      {
        id: "grain_per_day",
        label: GRAIN_LABELS.per_day,
        submissionValue: "per_day",
        confidence: 0.92,
        evidence: { source: "question_keyword" },
      },
    ];
  }
  if (/\bper week\b|\bweekly\b|\bby week\b/.test(normalized)) {
    return [
      {
        id: "grain_per_week",
        label: GRAIN_LABELS.per_week,
        submissionValue: "per_week",
        confidence: 0.92,
        evidence: { source: "question_keyword" },
      },
    ];
  }
  if (/\bper month\b|\bmonthly\b|\bby month\b/.test(normalized)) {
    return [
      {
        id: "grain_per_month",
        label: GRAIN_LABELS.per_month,
        submissionValue: "per_month",
        confidence: 0.92,
        evidence: { source: "question_keyword" },
      },
    ];
  }
  return [];
}

function buildGrainCandidates(
  input: PlannerInput
): OptionCandidate[] {
  const candidates: OptionCandidate[] = [];
  const canonicalGrain = input.canonicalSemantics.measureSpec.grain;

  if (canonicalGrain && canonicalGrain !== "unknown") {
    candidates.push({
      id: `grain_${toPlannerOptionId(canonicalGrain)}`,
      label: GRAIN_LABELS[canonicalGrain] || canonicalGrain,
      submissionValue: canonicalGrain,
      confidence: 0.9,
      evidence: { source: "canonical_measure_spec" },
    });
  }

  inferQuestionGrainCandidates(input.question).forEach((candidate) => {
    if (candidates.some((existing) => existing.submissionValue === candidate.submissionValue)) {
      return;
    }
    candidates.push(candidate);
  });

  if (candidates.length > 0) {
    return candidates;
  }

  return ["total", "per_patient", "per_wound", "per_assessment", "per_month"].map(
    (grain) => ({
      id: `grain_${grain}`,
      label: GRAIN_LABELS[grain] || grain,
      submissionValue: grain,
      confidence: 0.7,
      evidence: { source: "default_grain_options" },
    })
  );
}

function buildAssessmentTypeCandidates(input: PlannerInput): OptionCandidate[] {
  const assessmentTypes = Array.isArray(input.context.assessmentTypes)
    ? input.context.assessmentTypes
    : [];
  return assessmentTypes.map((assessmentType) => ({
    id: `assessment_type_${toPlannerOptionId(assessmentType.assessmentTypeId)}`,
    label: assessmentType.assessmentName,
    submissionValue: assessmentType.assessmentTypeId,
    confidence: assessmentType.confidence,
    evidence: {
      source: "assessment_type_search",
      semanticConcept: assessmentType.semanticConcept,
    },
  }));
}

function buildTemporalCandidates(input: PlannerInput): OptionCandidate[] {
  const temporalSpec = input.canonicalSemantics.temporalSpec;
  if (temporalSpec.kind === "absolute_range") {
    return [
      {
        id: "time_range_absolute",
        label: `${temporalSpec.start} to ${temporalSpec.end}`,
        submissionValue: `${temporalSpec.start}|${temporalSpec.end}`,
        confidence: 1,
        evidence: { source: "canonical_temporal_spec" },
      },
    ];
  }
  if (temporalSpec.kind === "relative_range") {
    return [
      {
        id: "time_range_relative",
        label: `Last ${temporalSpec.value} ${temporalSpec.unit}`,
        submissionValue: `last_${temporalSpec.value}_${temporalSpec.unit}`,
        confidence: 1,
        evidence: { source: "canonical_temporal_spec" },
      },
    ];
  }
  if (temporalSpec.kind === "point_in_time") {
    return [
      {
        id: "time_range_point",
        label: temporalSpec.value,
        submissionValue: temporalSpec.value,
        confidence: 1,
        evidence: { source: "canonical_temporal_spec" },
      },
    ];
  }
  return [
    {
      id: "time_range_30d",
      label: "Last 30 days",
      submissionValue: "last_30_days",
      confidence: 0.8,
      evidence: { source: "default_time_range_options" },
    },
    {
      id: "time_range_90d",
      label: "Last 90 days",
      submissionValue: "last_90_days",
      confidence: 0.78,
      evidence: { source: "default_time_range_options" },
    },
    {
      id: "time_range_6m",
      label: "Last 6 months",
      submissionValue: "last_6_months",
      confidence: 0.76,
      evidence: { source: "default_time_range_options" },
    },
    {
      id: "time_range_12m",
      label: "Last 12 months",
      submissionValue: "last_12_months",
      confidence: 0.74,
      evidence: { source: "default_time_range_options" },
    },
  ];
}

function buildEntityRefCandidates(
  input: PlannerInput,
  item: CanonicalClarificationItem
): OptionCandidate[] {
  const targetEntity = (item.target || "").toLowerCase();

  const fromRefs = input.canonicalSemantics.subjectRefs
    .filter((ref) => {
      if (!ref.mentionText?.trim()) return false;
      if (ref.entityType !== "patient") return false;
      if (isGenericPatientMention(ref.mentionText)) return false;
      if (targetEntity && ref.entityType.toLowerCase() !== targetEntity) return false;
      return true;
    })
    .map((ref, index) => ({
      id: `entity_ref_${index}_${toPlannerOptionId(ref.mentionText)}`,
      label: ref.mentionText,
      submissionValue: ref.mentionText,
      confidence: ref.confidence,
      evidence: {
        source: "canonical_subject_ref",
        referenceKind: ref.referenceKind,
        status: ref.status,
      },
    }));

  if (fromRefs.length > 0) {
    return fromRefs;
  }

  const extractedName = extractPatientNameCandidateFromQuestion(input.question);
  if (!extractedName || !isLikelyPatientNameCandidate(extractedName)) {
    return [];
  }

  return [
    {
      id: `entity_ref_0_${toPlannerOptionId(extractedName)}`,
      label: extractedName,
      submissionValue: extractedName,
      confidence: 0.8,
      evidence: {
        source: "question_name_extractor",
      },
    },
  ];
}

function appendPlannerEvidence(
  item: CanonicalClarificationItem,
  source: string,
  candidateCount: number
): Record<string, unknown> {
  return {
    clarificationSource: "grounded_clarification_planner",
    planner: "grounded_clarification_planner",
    source,
    candidateCount,
    canonicalEvidence: item.evidence || null,
  };
}

export class GroundedClarificationPlannerService {
  plan(input: PlannerInput): PlannerResult {
    const filteredPlan: CanonicalClarificationItem[] = [];
    const clarifications: ClarificationRequest[] = [];
    let autoResolvedCount = 0;
    const decisionMetadata: PlannerDecisionMetadata = {
      source: "grounded_clarification_planner",
      autoResolvedCount: 0,
      optionizedCount: 0,
      freeformFallbackCount: 0,
      deferredToResolverCount: 0,
      items: [],
    };

    const recordDecision = (decision: PlannerDecisionItem) => {
      decisionMetadata.items.push(decision);
      if (decision.mode === "auto_resolved") {
        decisionMetadata.autoResolvedCount += 1;
      } else if (decision.mode === "optionized") {
        decisionMetadata.optionizedCount += 1;
      } else if (decision.mode === "freeform_fallback") {
        decisionMetadata.freeformFallbackCount += 1;
      } else if (decision.mode === "deferred_to_resolver") {
        decisionMetadata.deferredToResolverCount += 1;
      }
    };

    input.canonicalSemantics.clarificationPlan.forEach((item, index) => {
      if (!item.blocking) {
        filteredPlan.push(item);
        return;
      }
      const policy = SLOT_POLICY[item.slot];

      if (item.slot === "valueFilter") {
        const impliedLiteralValue = extractValueSpecLiteral(item.target);
        if (impliedLiteralValue) {
          // valueSpec.value.<literal> is an internal canonical path that already
          // encodes an explicit user value. Do not surface this as a user
          // clarification because it creates confusing prompts.
          autoResolvedCount += 1;
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: 1,
            autoResolved: true,
            mode: "auto_resolved",
          });
          return;
        }

        const candidates = rankMappingsForItem(
          item,
          input.context.terminology,
          input.context
        );
        if (hasDominantCandidate(candidates, policy)) {
          autoResolvedCount += 1;
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: true,
            mode: "auto_resolved",
          });
          return;
        }

        if (candidates.length > 0) {
          clarifications.push({
            id: `grounded_${item.slot}_${index}`,
            ambiguousTerm: item.target || item.slot,
            question: fallbackQuestion(item),
            options: candidates.slice(0, policy.maxOptions).map((candidate, candidateIndex) => ({
              id: candidate.id,
              label: candidate.label,
              sqlConstraint: "",
              submissionValue: candidate.submissionValue,
              kind: "semantic",
              isDefault:
                candidateIndex === 0 &&
                candidate.confidence >= policy.autoResolveConfidence,
              evidence: candidate.evidence,
            })),
            allowCustom: policy.allowCustomWithOptions,
            slot: item.slot,
            target: item.target,
            reason: item.reason,
            reasonCode: item.reasonCode,
            targetType: "value",
            evidence: appendPlannerEvidence(
              item,
              "terminology_mapping",
              candidates.length
            ),
          });
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: false,
            mode: "optionized",
          });
          filteredPlan.push(item);
          return;
        }
      }

      if (item.slot === "assessmentType") {
        const candidates = buildAssessmentTypeCandidates(input);
        if (hasDominantCandidate(candidates, policy)) {
          autoResolvedCount += 1;
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: true,
            mode: "auto_resolved",
          });
          return;
        }
        if (candidates.length > 0) {
          clarifications.push({
            id: `grounded_${item.slot}_${index}`,
            ambiguousTerm: item.target || "assessment type",
            question: fallbackQuestion(item),
            options: candidates.slice(0, policy.maxOptions).map((candidate, optionIndex) => ({
              id: candidate.id,
              label: candidate.label,
              sqlConstraint: "",
              submissionValue: candidate.submissionValue,
              kind: "semantic",
              isDefault:
                optionIndex === 0 &&
                candidate.confidence >= policy.autoResolveConfidence,
              evidence: candidate.evidence,
            })),
            allowCustom: policy.allowCustomWithOptions,
            slot: item.slot,
            target: item.target,
            reason: item.reason,
            reasonCode: item.reasonCode,
            targetType: "assessment_type",
            evidence: appendPlannerEvidence(
              item,
              "assessment_type_search",
              candidates.length
            ),
          });
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: false,
            mode: "optionized",
          });
          filteredPlan.push(item);
          return;
        }
      }

      if (item.slot === "measure") {
        const candidates = buildMeasureCandidates(input);
        if (hasDominantCandidate(candidates, policy)) {
          autoResolvedCount += 1;
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: true,
            mode: "auto_resolved",
          });
          return;
        }
        if (candidates.length > 0) {
          clarifications.push({
            id: `grounded_${item.slot}_${index}`,
            ambiguousTerm: item.target || "measure",
            question: fallbackQuestion(item),
            options: candidates.slice(0, policy.maxOptions).map((candidate, candidateIndex) => ({
              id: candidate.id,
              label: candidate.label,
              sqlConstraint: "",
              submissionValue: candidate.submissionValue,
              kind: "semantic",
              isDefault:
                candidateIndex === 0 &&
                candidate.confidence >= policy.autoResolveConfidence,
              evidence: candidate.evidence,
            })),
            allowCustom: policy.allowCustomWithOptions,
            slot: item.slot,
            target: item.target,
            reason: item.reason,
            reasonCode: item.reasonCode,
            targetType: "measure",
            evidence: appendPlannerEvidence(item, "measure_spec", candidates.length),
          });
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: false,
            mode: "optionized",
          });
          filteredPlan.push(item);
          return;
        }
      }

      if (item.slot === "grain") {
        const candidates = buildGrainCandidates(input);
        if (hasDominantCandidate(candidates, policy)) {
          autoResolvedCount += 1;
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: true,
            mode: "auto_resolved",
          });
          return;
        }
        clarifications.push({
          id: `grounded_${item.slot}_${index}`,
          ambiguousTerm: item.target || "time grain",
          question: fallbackQuestion(item),
          options: candidates.slice(0, policy.maxOptions).map((candidate, candidateIndex) => ({
            id: candidate.id,
            label: candidate.label,
            sqlConstraint: "",
            submissionValue: candidate.submissionValue,
            kind: "semantic",
            isDefault:
              candidateIndex === 0 &&
              candidate.confidence >= policy.autoResolveConfidence,
            evidence: candidate.evidence,
          })),
          allowCustom: policy.allowCustomWithOptions,
          slot: item.slot,
          target: item.target,
          reason: item.reason,
          reasonCode: item.reasonCode,
          targetType: "grain",
          evidence: appendPlannerEvidence(item, "grain_policy", candidates.length),
        });
        recordDecision({
          slot: item.slot,
          reasonCode: item.reasonCode,
          candidateCount: candidates.length,
          autoResolved: false,
          mode: "optionized",
        });
        filteredPlan.push(item);
        return;
      }

      if (
        item.slot === "timeRange" &&
        (input.canonicalSemantics.temporalSpec.kind === "absolute_range" ||
          input.canonicalSemantics.temporalSpec.kind === "relative_range")
      ) {
        autoResolvedCount += 1;
        recordDecision({
          slot: item.slot,
          reasonCode: item.reasonCode,
          candidateCount: 0,
          autoResolved: true,
          mode: "auto_resolved",
        });
        return;
      }

      if (item.slot === "timeRange") {
        const candidates = buildTemporalCandidates(input);
        if (hasDominantCandidate(candidates, policy)) {
          autoResolvedCount += 1;
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: true,
            mode: "auto_resolved",
          });
          return;
        }
        clarifications.push({
          id: `grounded_${item.slot}_${index}`,
          ambiguousTerm: normalizeTargetLabel(item),
          question: fallbackQuestion(item),
          options: candidates.slice(0, policy.maxOptions).map((candidate, optionIndex) => ({
            id: candidate.id,
            label: candidate.label,
            sqlConstraint: "",
            submissionValue: candidate.submissionValue,
            kind: "semantic",
            isDefault:
              optionIndex === 0 &&
              candidate.confidence >= policy.autoResolveConfidence,
            evidence: candidate.evidence,
          })),
          allowCustom: policy.allowCustomWithOptions,
          slot: item.slot,
          target: item.target,
          reason: item.reason,
          reasonCode: item.reasonCode,
          targetType: "time_range",
          evidence: appendPlannerEvidence(
            item,
            "temporal_policy",
            candidates.length
          ),
        });
        recordDecision({
          slot: item.slot,
          reasonCode: item.reasonCode,
          candidateCount: candidates.length,
          autoResolved: false,
          mode: "optionized",
        });
        filteredPlan.push(item);
        return;
      }

      if (item.slot === "entityRef") {
        const shouldDeferToResolver =
          input.canonicalSemantics.executionRequirements.requiresPatientResolution &&
          input.canonicalSemantics.subjectRefs.some(
            (ref) =>
              ref.entityType === "patient" &&
              (ref.status === "candidate" || ref.status === "requires_resolution") &&
              !isGenericPatientMention(ref.mentionText || "")
          );
        if (shouldDeferToResolver) {
          filteredPlan.push(item);
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: 0,
            autoResolved: false,
            mode: "deferred_to_resolver",
          });
          return;
        }

        const candidates = buildEntityRefCandidates(input, item);
        if (hasDominantCandidate(candidates, policy)) {
          autoResolvedCount += 1;
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: true,
            mode: "auto_resolved",
          });
          return;
        }
        if (candidates.length > 0) {
          clarifications.push({
            id: `grounded_${item.slot}_${index}`,
            ambiguousTerm: item.target || item.slot,
            question: fallbackQuestion(item),
            options: candidates.slice(0, policy.maxOptions).map((candidate, candidateIndex) => ({
              id: candidate.id,
              label: candidate.label,
              sqlConstraint: "",
              submissionValue: candidate.submissionValue,
              kind: "semantic",
              isDefault:
                candidateIndex === 0 &&
                candidate.confidence >= policy.autoResolveConfidence,
              evidence: candidate.evidence,
            })),
            allowCustom: policy.allowCustomWithOptions,
            slot: item.slot,
            target: item.target,
            reason: item.reason,
            reasonCode: item.reasonCode,
            targetType: "entity",
            evidence: appendPlannerEvidence(
              item,
              "entity_reference",
              candidates.length
            ),
          });
          recordDecision({
            slot: item.slot,
            reasonCode: item.reasonCode,
            candidateCount: candidates.length,
            autoResolved: false,
            mode: "optionized",
          });
          filteredPlan.push(item);
          return;
        }
      }

      if (item.slot === "assessmentType") {
        filteredPlan.push(item);
        recordDecision({
          slot: item.slot,
          reasonCode: item.reasonCode,
          candidateCount: 0,
          autoResolved: false,
          mode: "freeform_fallback",
        });
        clarifications.push({
          id: `grounded_${item.slot}_${index}`,
          ambiguousTerm: item.target || item.slot,
          question: fallbackQuestion(item),
          options: [],
          allowCustom: true,
          slot: item.slot,
          target: item.target,
          reason: item.reason,
          reasonCode: item.reasonCode,
          targetType: "value",
          evidence: appendPlannerEvidence(item, "fallback", 0),
        });
        return;
      }

      filteredPlan.push(item);
      recordDecision({
        slot: item.slot,
        reasonCode: item.reasonCode,
        candidateCount: 0,
        autoResolved: false,
        mode: "freeform_fallback",
      });
      clarifications.push({
        id: `grounded_${item.slot}_${index}`,
        ambiguousTerm: item.target || item.slot,
        question: fallbackQuestion(item),
        options: [],
        allowCustom: true,
        slot: item.slot,
        target: item.target,
        reason: item.reason,
        reasonCode: item.reasonCode,
        targetType: "value",
        evidence: appendPlannerEvidence(item, "fallback", 0),
      });
      return;
    });

    decisionMetadata.autoResolvedCount = autoResolvedCount;

    const stillBlockedItems = filteredPlan.filter((item) => item.blocking);
    const stillBlocked = stillBlockedItems.length > 0;
    const priorAllowSql =
      input.canonicalSemantics.executionRequirements.allowSqlGeneration === true;
    const allowSqlGeneration = stillBlocked ? false : priorAllowSql || autoResolvedCount > 0;

    return {
      clarifications,
      autoResolvedCount,
      decisionMetadata,
      clarifiedSemantics: {
        ...input.canonicalSemantics,
        clarificationPlan: filteredPlan,
        executionRequirements: {
          ...input.canonicalSemantics.executionRequirements,
          allowSqlGeneration,
          blockReason: allowSqlGeneration
            ? undefined
            : stillBlockedItems[0]?.reason ||
              input.canonicalSemantics.executionRequirements.blockReason,
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

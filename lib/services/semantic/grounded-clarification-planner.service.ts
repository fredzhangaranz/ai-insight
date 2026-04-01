import type { ClarificationRequest } from "@/lib/prompts/generate-query.prompt";
import type {
  CanonicalClarificationItem,
  CanonicalQuerySemantics,
  ContextBundle,
  TerminologyMapping,
} from "../context-discovery/types";

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

function fallbackQuestion(item: CanonicalClarificationItem): string {
  if (item.question?.trim()) return item.question;
  return `Please clarify ${item.target || item.slot} so I can run this query safely.`;
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
              sqlConstraint: "",
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
            sqlConstraint: "",
            submissionValue: assessment.assessmentTypeId,
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
            planner: "grounded_clarification_planner",
            canonicalEvidence: item.evidence || null,
            source: "assessment_type_search",
          },
        });
        filteredPlan.push(item);
        return;
      }

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
        evidence: {
          planner: "grounded_clarification_planner",
          canonicalEvidence: item.evidence || null,
          source: "fallback",
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

import type { SemanticQueryFrame } from "@/lib/services/context-discovery/types";
import type { ResolvedEntitySummary } from "@/lib/types/insight-artifacts";
import type { ClinicalIntentFrame } from "@/lib/types/workspace-plan";

function hasPhrase(question: string, pattern: RegExp): boolean {
  return pattern.test(question);
}

function detectExplicitMode(
  question: string,
  semanticFrame?: SemanticQueryFrame
): ClinicalIntentFrame["presentation"]["explicitMode"] {
  const lower = question.toLowerCase();

  if (hasPhrase(lower, /\b(patient (summary|details|medical details)|show patient summary)\b/)) {
    return "patient_card";
  }
  if (hasPhrase(lower, /\b(assessment timeline|assessment history|progression across assessments)\b/)) {
    return "assessment_timeline";
  }
  if (hasPhrase(lower, /\b(show (this|latest) assessment|assessment form)\b/)) {
    return "assessment_form";
  }
  if (hasPhrase(lower, /\b(chart|graph|plot)\b/)) {
    return "chart";
  }
  if (hasPhrase(lower, /\b(table|list|exact values)\b/)) {
    return "table";
  }
  if (semanticFrame?.presentation.value === "chart") {
    return "chart";
  }
  if (semanticFrame?.presentation.value === "table") {
    return "table";
  }
  return null;
}

function inferWorkflowStage(
  question: string,
  semanticFrame?: SemanticQueryFrame,
  resolvedEntities?: ResolvedEntitySummary[]
): ClinicalIntentFrame["workflow"]["stage"] {
  const lower = question.toLowerCase();

  if (hasPhrase(lower, /\b(follow up|instead|also|now show|show me exact values)\b/)) {
    return "follow_up";
  }
  if (hasPhrase(lower, /\b(document|note|handoff|summary for handoff)\b/)) {
    return "documentation_support";
  }
  if (
    hasPhrase(lower, /\b(trend|over time|last \d+ (day|days|week|weeks|month|months|year|years))\b/)
  ) {
    return "trend_review";
  }
  if (
    hasPhrase(lower, /\b(assessment|latest assessment|open assessment)\b/)
  ) {
    return "assessment_review";
  }
  if (
    resolvedEntities?.length ||
    semanticFrame?.scope.value === "individual_patient"
  ) {
    return "patient_review";
  }
  return "question_answering";
}

function inferWorkflowGoal(
  stage: ClinicalIntentFrame["workflow"]["stage"],
  question: string
): ClinicalIntentFrame["workflow"]["goal"] {
  const lower = question.toLowerCase();

  if (stage === "documentation_support") return "document";
  if (hasPhrase(lower, /\b(compare|comparison|versus|vs)\b/)) return "compare";
  if (hasPhrase(lower, /\b(decide|should|recommend|next)\b/)) return "decide";
  if (hasPhrase(lower, /\b(handoff)\b/)) return "handoff";
  return "inspect";
}

function buildInferredModes(
  question: string,
  semanticFrame?: SemanticQueryFrame,
  resolvedEntities?: ResolvedEntitySummary[]
): ClinicalIntentFrame["presentation"]["inferredModes"] {
  const inferred: ClinicalIntentFrame["presentation"]["inferredModes"] = [];
  const lower = question.toLowerCase();

  if (
    semanticFrame?.presentation.value === "chart" ||
    semanticFrame?.preferredVisualization.value === "line" ||
    semanticFrame?.preferredVisualization.value === "bar" ||
    hasPhrase(lower, /\b(trend|over time|compare|comparison)\b/)
  ) {
    inferred.push({
      mode: "chart",
      confidence: 0.82,
      reason: "Question implies trend or comparison-oriented evidence.",
    });
  }

  inferred.push({
    mode: "table",
    confidence: inferred.length > 0 ? 0.58 : 0.78,
    reason: inferred.length > 0
      ? "Table remains the safest secondary evidence view."
      : "Table is the safest default evidence view.",
  });

  if (
    resolvedEntities?.length &&
    hasPhrase(lower, /\b(patient|summary|details|medical details)\b/)
  ) {
    inferred.push({
      mode: "patient_card",
      confidence: 0.88,
      reason: "Question targets a specific patient summary or detail lookup.",
    });
  }

  return inferred;
}

export class ClinicalIntentFrameService {
  extend(input: {
    question: string;
    semanticFrame?: SemanticQueryFrame;
    resolvedEntities?: ResolvedEntitySummary[];
  }): ClinicalIntentFrame | null {
    const { question, semanticFrame, resolvedEntities } = input;

    if (!semanticFrame) {
      return null;
    }

    const stage = inferWorkflowStage(question, semanticFrame, resolvedEntities);

    return {
      semantic: semanticFrame,
      presentation: {
        explicitMode: detectExplicitMode(question, semanticFrame),
        inferredModes: buildInferredModes(
          question,
          semanticFrame,
          resolvedEntities
        ),
      },
      workflow: {
        stage,
        goal: inferWorkflowGoal(stage, question),
      },
    };
  }
}

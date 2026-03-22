function envFlag(name: string): boolean {
  const value = process.env[name];
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export interface InsightsFeatureFlags {
  patientEntityResolution: boolean;
  promptPhiSanitization: boolean;
  chartFirstResults: boolean;
  conversationArtifacts: boolean;
  followUpReliability: boolean;
  clarificationPipelineV2: boolean;
  clarificationPipelineV2Shadow: boolean;
  workspacePlanningV2: boolean;
  patientContextBundle: boolean;
  workspaceActionRecommendations: boolean;
  patientCardBlock: boolean;
}

export function getInsightsFeatureFlags(): InsightsFeatureFlags {
  const workspacePlanningV2 = envFlag("INSIGHTS_WORKSPACE_PLANNING_V2");

  return {
    patientEntityResolution: envFlag("INSIGHTS_PATIENT_ENTITY_RESOLUTION"),
    promptPhiSanitization: envFlag("INSIGHTS_PROMPT_PHI_SANITIZATION"),
    chartFirstResults: envFlag("INSIGHTS_CHART_FIRST_RESULTS"),
    conversationArtifacts: envFlag("INSIGHTS_CONVERSATION_ARTIFACTS"),
    followUpReliability: envFlag("INSIGHTS_FOLLOWUP_RELIABILITY"),
    clarificationPipelineV2: envFlag("INSIGHTS_CLARIFICATION_PIPELINE_V2"),
    clarificationPipelineV2Shadow: envFlag(
      "INSIGHTS_CLARIFICATION_PIPELINE_V2_SHADOW"
    ),
    workspacePlanningV2,
    patientContextBundle:
      workspacePlanningV2 && envFlag("INSIGHTS_PATIENT_CONTEXT_BUNDLE"),
    workspaceActionRecommendations:
      workspacePlanningV2 &&
      envFlag("INSIGHTS_WORKSPACE_ACTION_RECOMMENDATIONS"),
    patientCardBlock:
      workspacePlanningV2 && envFlag("INSIGHTS_PATIENT_CARD_BLOCK"),
  };
}

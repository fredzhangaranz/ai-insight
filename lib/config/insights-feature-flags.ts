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
  canonicalQuerySemanticsV1: boolean;
}

const ALWAYS_ON_INSIGHTS_FLAGS: InsightsFeatureFlags = {
  patientEntityResolution: true,
  promptPhiSanitization: true,
  chartFirstResults: true,
  conversationArtifacts: true,
  followUpReliability: true,
  clarificationPipelineV2: true,
  clarificationPipelineV2Shadow: false,
  canonicalQuerySemanticsV1: true,
};

export function getInsightsFeatureFlags(): InsightsFeatureFlags {
  // Feature flags are retired for active runtime development. Keep env-based toggles
  // only in tests so existing unit tests can exercise legacy/compat branches.
  if (process.env.NODE_ENV !== "test") {
    return ALWAYS_ON_INSIGHTS_FLAGS;
  }

  return {
    patientEntityResolution:
      process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION !== undefined
        ? envFlag("INSIGHTS_PATIENT_ENTITY_RESOLUTION")
        : false,
    promptPhiSanitization:
      process.env.INSIGHTS_PROMPT_PHI_SANITIZATION !== undefined
        ? envFlag("INSIGHTS_PROMPT_PHI_SANITIZATION")
        : false,
    chartFirstResults:
      process.env.INSIGHTS_CHART_FIRST_RESULTS !== undefined
        ? envFlag("INSIGHTS_CHART_FIRST_RESULTS")
        : false,
    conversationArtifacts:
      process.env.INSIGHTS_CONVERSATION_ARTIFACTS !== undefined
        ? envFlag("INSIGHTS_CONVERSATION_ARTIFACTS")
        : false,
    followUpReliability:
      process.env.INSIGHTS_FOLLOWUP_RELIABILITY !== undefined
        ? envFlag("INSIGHTS_FOLLOWUP_RELIABILITY")
        : false,
    clarificationPipelineV2:
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 !== undefined
        ? envFlag("INSIGHTS_CLARIFICATION_PIPELINE_V2")
        : false,
    clarificationPipelineV2Shadow:
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2_SHADOW !== undefined
        ? envFlag("INSIGHTS_CLARIFICATION_PIPELINE_V2_SHADOW")
        : false,
    canonicalQuerySemanticsV1:
      process.env.INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1 !== undefined
        ? envFlag("INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1")
        : false,
  };
}

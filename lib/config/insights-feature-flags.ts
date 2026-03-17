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
}

export function getInsightsFeatureFlags(): InsightsFeatureFlags {
  return {
    patientEntityResolution: envFlag("INSIGHTS_PATIENT_ENTITY_RESOLUTION"),
    promptPhiSanitization: envFlag("INSIGHTS_PROMPT_PHI_SANITIZATION"),
    chartFirstResults: envFlag("INSIGHTS_CHART_FIRST_RESULTS"),
    conversationArtifacts: envFlag("INSIGHTS_CONVERSATION_ARTIFACTS"),
    followUpReliability: envFlag("INSIGHTS_FOLLOWUP_RELIABILITY"),
  };
}

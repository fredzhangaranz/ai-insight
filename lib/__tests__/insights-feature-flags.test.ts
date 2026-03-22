import { afterEach, describe, expect, it } from "vitest";
import { getInsightsFeatureFlags } from "@/lib/config/insights-feature-flags";

function setEnv(name: string, value?: string) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("getInsightsFeatureFlags", () => {
  afterEach(() => {
    setEnv("INSIGHTS_WORKSPACE_PLANNING_V2");
    setEnv("INSIGHTS_PATIENT_CONTEXT_BUNDLE");
    setEnv("INSIGHTS_WORKSPACE_ACTION_RECOMMENDATIONS");
    setEnv("INSIGHTS_PATIENT_CARD_BLOCK");
  });

  it("disables child V2 flags when the parent flag is off", () => {
    setEnv("INSIGHTS_WORKSPACE_PLANNING_V2");
    setEnv("INSIGHTS_PATIENT_CONTEXT_BUNDLE", "true");
    setEnv("INSIGHTS_WORKSPACE_ACTION_RECOMMENDATIONS", "true");
    setEnv("INSIGHTS_PATIENT_CARD_BLOCK", "true");

    expect(getInsightsFeatureFlags()).toMatchObject({
      workspacePlanningV2: false,
      patientContextBundle: false,
      workspaceActionRecommendations: false,
      patientCardBlock: false,
    });
  });

  it("enables child flags only when the parent V2 flag is on", () => {
    setEnv("INSIGHTS_WORKSPACE_PLANNING_V2", "true");
    setEnv("INSIGHTS_PATIENT_CONTEXT_BUNDLE", "true");
    setEnv("INSIGHTS_WORKSPACE_ACTION_RECOMMENDATIONS", "true");
    setEnv("INSIGHTS_PATIENT_CARD_BLOCK", "true");

    expect(getInsightsFeatureFlags()).toMatchObject({
      workspacePlanningV2: true,
      patientContextBundle: true,
      workspaceActionRecommendations: true,
      patientCardBlock: true,
    });
  });
});

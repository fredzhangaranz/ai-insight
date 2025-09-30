import { describe, it, expect } from "vitest";
import {
  constructFunnelSubquestionsPrompt,
} from "@/lib/prompts/funnel-subquestions.prompt";
import { constructFunnelSqlPrompt } from "@/lib/prompts/funnel-sql.prompt";
import { constructChartRecommendationsPrompt } from "@/lib/prompts/chart-recommendations.prompt";

const SAMPLE_FORM_DEFINITION = { field: { fieldtype: "text", options: [] } };

describe("Prompt scope handling", () => {
  it("omits form definition and adds schema context when scope is schema (sub-questions)", () => {
    const prompt = constructFunnelSubquestionsPrompt(
      "How many patients improved?",
      SAMPLE_FORM_DEFINITION,
      "DATABASE CONTEXT",
      "schema"
    );

    expect(prompt).toContain("SCHEMA MODE CONTEXT");
    expect(prompt).toMatch(/rpt\.\*/);
    expect(prompt).not.toContain("FORM DEFINITION");
  });

  it("keeps form definition when scope is form (sub-questions)", () => {
    const prompt = constructFunnelSubquestionsPrompt(
      "How many patients improved?",
      SAMPLE_FORM_DEFINITION,
      "DATABASE CONTEXT",
      "form"
    );

    expect(prompt).toContain("FORM DEFINITION");
    expect(prompt).not.toContain("SCHEMA MODE CONTEXT");
  });

  it("adds schema guidance to SQL prompt when scope is schema", () => {
    const prompt = constructFunnelSqlPrompt(
      "List wound states",
      [],
      SAMPLE_FORM_DEFINITION,
      "DATABASE CONTEXT",
      undefined,
      undefined,
      "schema"
    );

    expect(prompt).toContain("SCHEMA MODE CONTEXT");
    expect(prompt).not.toContain("FORM DEFINITION");
    expect(prompt).toContain("rpt.WoundState");
  });

  it("adds schema mode reminder to chart recommendations", () => {
    const prompt = constructChartRecommendationsPrompt(
      "List wound states",
      "SELECT 1",
      [{ value: 1 }],
      SAMPLE_FORM_DEFINITION,
      "DATABASE CONTEXT",
      "schema"
    );

    expect(prompt).toContain("Schema Mode: No form definition is supplied");
    expect(prompt).toContain("Schema Mode Guidance");
    expect(prompt).not.toContain("Assessment Form Definition:");
  });
});

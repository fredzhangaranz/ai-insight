import { describe, expect, it } from "vitest";
import { mergeClarificationResponses } from "../clarification-response-merge";

describe("mergeClarificationResponses", () => {
  it("accumulates non-conflicting clarification answers across turns", () => {
    const previous = {
      patient_resolution_confirm: "patient:abc",
    };
    const incoming = {
      grounded_timeRange_0: "last_12_months",
    };

    expect(mergeClarificationResponses(previous, incoming)).toEqual({
      patient_resolution_confirm: "patient:abc",
      grounded_timeRange_0: "last_12_months",
    });
  });

  it("replaces stale patient confirm/lookup when a patient selection is submitted", () => {
    const previous = {
      patient_resolution_confirm: "__CHANGE_PATIENT__",
      patient_lookup_input: "Darryl Nicolas",
      grounded_timeRange_0: "last_12_months",
    };
    const incoming = {
      patient_resolution_select: "patient:resolved-123",
    };

    expect(mergeClarificationResponses(previous, incoming)).toEqual({
      grounded_timeRange_0: "last_12_months",
      patient_resolution_select: "patient:resolved-123",
    });
  });

  it("replaces stale patient selection when a new patient lookup is submitted", () => {
    const previous = {
      patient_resolution_select: "patient:resolved-123",
      grounded_timeRange_0: "last_12_months",
    };
    const incoming = {
      patient_lookup_input: "Darryl Nicolas",
    };

    expect(mergeClarificationResponses(previous, incoming)).toEqual({
      grounded_timeRange_0: "last_12_months",
      patient_lookup_input: "Darryl Nicolas",
    });
  });
});

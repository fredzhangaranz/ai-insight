import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { FieldProfilesReviewStep } from "../field-profiles-review-step";
import type { FieldProfileSet } from "@/lib/services/data-gen/trajectory-field-profile.types";
import { WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY } from "@/lib/services/data-gen/field-classifier.service";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";

const formSchema: FieldSchema[] = [
  {
    fieldName: "Wound Classification",
    columnName: "wound_classification",
    dataType: "SingleSelectList",
    isNullable: false,
    storageType: "wound_attribute",
    attributeTypeId: "classification-attr",
    options: ["Pressure Injury", "Burn"],
    attributeSetOrderIndex: 1,
    attributeOrderIndex: 1,
  },
  {
    fieldName: "Wound State",
    columnName: "wound_state",
    dataType: "SingleSelectList",
    isNullable: false,
    storageType: "wound_attribute",
    attributeTypeId: "state-attr",
    attributeTypeKey: WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY,
    options: ["Open", "Healed"],
    attributeSetOrderIndex: 1,
    attributeOrderIndex: 2,
  },
];

const initialProfiles: FieldProfileSet = [
  {
    trajectoryStyle: "Exponential",
    clinicalSummary: "Fast healing",
    phases: [
      {
        phase: "early",
        description: "Early",
        fieldDistributions: [
          {
            fieldName: "Wound Classification",
            columnName: "wound_classification",
            behavior: "per_assessment",
            recommendedBehavior: "per_wound",
            behaviorRationale:
              "This field usually represents wound identity or episode context and should stay stable across assessments.",
            weights: {
              "Pressure Injury": 0.6,
              Burn: 0.4,
            },
          },
          {
            fieldName: "Wound State",
            columnName: "wound_state",
            behavior: "system",
            weights: {
              Open: 1,
              Healed: 0,
            },
          },
        ],
      },
      {
        phase: "mid",
        description: "Mid",
        fieldDistributions: [
          {
            fieldName: "Wound Classification",
            columnName: "wound_classification",
            behavior: "per_assessment",
            recommendedBehavior: "per_wound",
            weights: {
              "Pressure Injury": 0.5,
              Burn: 0.5,
            },
          },
        ],
      },
      {
        phase: "late",
        description: "Late",
        fieldDistributions: [
          {
            fieldName: "Wound Classification",
            columnName: "wound_classification",
            behavior: "per_assessment",
            recommendedBehavior: "per_wound",
            weights: {
              "Pressure Injury": 0.4,
              Burn: 0.6,
            },
          },
        ],
      },
    ],
  },
];

describe("FieldProfilesReviewStep", () => {
  it("shows behavior controls and hides wound-state distributions", () => {
    render(
      <FieldProfilesReviewStep
        profiles={initialProfiles}
        formSchema={formSchema}
        onProceed={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.queryByText("Wound State")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Changes over time" }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Carry through this wound" }).length
    ).toBeGreaterThan(0);
  });

  it("collapses per-wound fields to a single initial distribution and preserves normalized output", () => {
    const onProceed = vi.fn();

    render(
      <FieldProfilesReviewStep
        profiles={initialProfiles}
        formSchema={formSchema}
        onProceed={onProceed}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Carry through this wound" })[0]
    );

    expect(screen.getAllByText(/Initial value distribution/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/reuses the initial value distribution from the early phase/i)
    ).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Pressure Injury"), {
      target: { value: "0.75" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue to Review Spec" }));

    const submitted = onProceed.mock.calls[0][0] as FieldProfileSet;
    const submittedDistributions = submitted[0].phases.map((phase) =>
      phase.fieldDistributions.find(
        (distribution) => distribution.columnName === "wound_classification"
      )
    );

    for (const distribution of submittedDistributions) {
      expect(distribution?.behavior).toBe("per_wound");
      expect(distribution?.weights["Pressure Injury"]).toBe(0.75);
    }
  });
});

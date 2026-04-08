import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssistantMessage } from "../AssistantMessage";

vi.mock("../ThinkingStream", () => ({
  ThinkingStream: () => null,
}));

vi.mock("../ResultsTable", () => ({
  ResultsTable: () => null,
}));

vi.mock("../MessageActions", () => ({
  MessageActions: () => null,
}));

vi.mock("../SQLPreview", () => ({
  SQLPreview: () => null,
}));

vi.mock("../ArtifactRenderer", () => ({
  ArtifactRenderer: () => null,
}));

vi.mock("@/components/charts/ChartConfigurationDialog", () => ({
  ChartConfigurationDialog: () => null,
}));

describe("AssistantMessage clarification UI", () => {
  it("keeps structured option payloads out of the custom input textbox", () => {
    const onClarify = vi.fn();

    render(
      <AssistantMessage
        customerId="cust-1"
        onClarify={onClarify}
        message={{
          id: "msg-1",
          content: "",
          createdAt: new Date().toISOString(),
          isLoading: false,
          result: {
            mode: "clarification",
            question: "how many female patients",
            thinking: [],
            clarifications: [
              {
                id: "clar-1",
                ambiguousTerm: "female patients",
                question: 'Which option did you mean by "female patients"?',
                allowCustom: true,
                options: [
                  {
                    id: "opt-1",
                    label: "Female",
                    sqlConstraint: "",
                    submissionValue:
                      "__FILTER_SELECTION__:eyJraW5kIjoiZmlsdGVyX3ZhbHVlIn0",
                  },
                  {
                    id: "opt-2",
                    label: "Male",
                    sqlConstraint: "",
                    submissionValue:
                      "__FILTER_SELECTION__:eyJraW5kIjoiZmlsdGVyX3ZhbHVlIiwiYWx0Ijp0cnVlfQ",
                  },
                ],
              },
            ],
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Female" }));

    expect(screen.queryByPlaceholderText("Describe what you meant")).toBeNull();
    expect(screen.queryByDisplayValue(/__FILTER_SELECTION__:/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Other input" }));

    const textarea = screen.getByPlaceholderText(
      "Describe what you meant"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");

    fireEvent.change(textarea, {
      target: { value: "female from patient demographics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onClarify).toHaveBeenCalledWith({
      "clar-1": "female from patient demographics",
    });
  });

  it("shows the error text when result.error exists but assistant content is empty", () => {
    render(
      <AssistantMessage
        customerId="cust-1"
        message={{
          id: "msg-error",
          content: "",
          createdAt: new Date().toISOString(),
          isLoading: false,
          result: {
            mode: "direct",
            question: "show me wound area chart for Fred Smith",
            thinking: [],
            error: {
              message:
                "This cached query requires secure parameters that are no longer available.",
              step: "history",
            },
          },
        }}
      />
    );

    expect(
      screen.getByText(
        "I encountered an error: This cached query requires secure parameters that are no longer available."
      )
    ).toBeTruthy();
  });
});

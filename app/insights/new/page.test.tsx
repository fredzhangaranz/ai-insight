import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import NewInsightPage from "./page";

vi.mock("@/lib/context/QueryHistorySidebarContext", () => ({
  useSetQueryHistorySidebar: vi.fn(),
}));

vi.mock("@/lib/hooks/useInsights", () => ({
  useInsights: vi.fn(() => ({
    result: null,
    isLoading: false,
    ask: vi.fn(),
    askWithClarifications: vi.fn(),
    analysis: { steps: [] },
    loadCachedResult: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock("./components/NewLayout", () => ({
  NewLayout: (props: {
    question: string;
    isQuestionSubmitted: boolean;
    modelId?: string;
  }) => (
    <div data-testid="new-layout">
      question:{props.question || "<empty>"} submitted:
      {String(props.isQuestionSubmitted)} modelId:{props.modelId ?? "<empty>"}
    </div>
  ),
}));

describe("NewInsightPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              id: "gemini-default",
              name: "Gemini",
              provider: "Google",
              description: "",
              isDefault: true,
            },
          ],
          defaultModelId: "gemini-default",
        }),
      }),
    );
  });

  it("renders the new layout and loads default model on mount (settings popover stays closed)", async () => {
    render(<NewInsightPage />);

    expect(screen.getByTestId("new-layout")).toBeInTheDocument();
    expect(screen.queryByText("Classic")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("new-layout")).toHaveTextContent(
        "modelId:gemini-default",
      );
    });
  });
});

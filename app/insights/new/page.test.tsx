import React from "react";
import { render, screen } from "@testing-library/react";
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
  NewLayout: (props: { question: string; isQuestionSubmitted: boolean }) => (
    <div data-testid="new-layout">
      question:{props.question || "<empty>"} submitted:
      {String(props.isQuestionSubmitted)}
    </div>
  ),
}));

describe("NewInsightPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the new layout by default", () => {
    render(<NewInsightPage />);

    expect(screen.getByTestId("new-layout")).toBeInTheDocument();
    expect(screen.queryByText("Classic")).not.toBeInTheDocument();
  });
});

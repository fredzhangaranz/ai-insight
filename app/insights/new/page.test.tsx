import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import NewInsightPage from "./page";

const hoisted = vi.hoisted(() => ({
  useInsightsMock: vi.fn(),
  latestLayoutProps: null as any,
  setHookResult: null as null | ((value: any) => void),
}));

vi.mock("@/lib/context/QueryHistorySidebarContext", () => ({
  useSetQueryHistorySidebar: vi.fn(),
}));

vi.mock("@/lib/hooks/useInsights", () => ({
  useInsights: hoisted.useInsightsMock,
}));

vi.mock("./components/NewLayout", () => ({
  NewLayout: (props: any) => {
    hoisted.latestLayoutProps = props;
    return (
      <div data-testid="new-layout">
        question:{props.question || "<empty>"} submitted:
        {String(props.isQuestionSubmitted)} modelId:{props.modelId ?? "<empty>"}
      </div>
    );
  },
}));

describe("NewInsightPage", () => {
  const modelResponse = {
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
  };

  const okJson = (payload: unknown) => ({
    ok: true,
    json: async () => payload,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.latestLayoutProps = null;
    hoisted.setHookResult = null;
    hoisted.useInsightsMock.mockImplementation(() => {
      const [result, setResult] = React.useState<any>(null);
      hoisted.setHookResult = setResult;
      return {
        result,
        isLoading: false,
        ask: vi.fn(),
        askWithClarifications: vi.fn(),
        analysis: { steps: [] },
        loadCachedResult: (cachedResult: any) => setResult(cachedResult),
        reset: () => setResult(null),
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okJson(modelResponse)),
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

  it("does not create a new thread when selecting history with existing conversationThreadId", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "/api/insights/models") {
        return okJson(modelResponse);
      }
      if (url === "/api/insights/conversation/thread-123") {
        return okJson({
          thread: { id: "thread-123", customerId: "cust-1" },
          messages: [
            {
              id: "u1",
              threadId: "thread-123",
              role: "user",
              content: "Main question",
              metadata: {},
              createdAt: new Date().toISOString(),
            },
            {
              id: "a1",
              threadId: "thread-123",
              role: "assistant",
              content: "Main answer",
              metadata: {
                mode: "direct",
                sql: "SELECT 1",
                resultSummary: { columns: ["value"] },
              },
              createdAt: new Date().toISOString(),
            },
            {
              id: "u2",
              threadId: "thread-123",
              role: "user",
              content: "Follow-up question",
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      if (url === "/api/insights/execute-cached") {
        return okJson({
          mode: "direct",
          question: "Main question",
          thinking: [],
          sql: "SELECT 1",
          results: { rows: [], columns: ["value"] },
        });
      }
      if (url === "/api/insights/conversation/thread/create") {
        return okJson({ threadId: "new-thread", userMessageId: "u-new" });
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NewInsightPage />);

    await waitFor(() => {
      expect(hoisted.latestLayoutProps).toBeTruthy();
    });

    await act(async () => {
      hoisted.latestLayoutProps.setCustomerId("cust-1");
    });

    await waitFor(() => {
      expect(hoisted.latestLayoutProps.customerId).toBe("cust-1");
    });

    await act(async () => {
      await hoisted.latestLayoutProps.handleHistorySelect({
        id: "history-1",
        question: "Main question",
        mode: "direct",
        sql: "SELECT 1",
        semanticContext: {},
        conversationThreadId: "thread-123",
      });
    });

    const createThreadCalls = fetchMock.mock.calls.filter((call) => {
      const input = call[0] as RequestInfo | URL;
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return url === "/api/insights/conversation/thread/create";
    });

    expect(createThreadCalls).toHaveLength(0);
  });

  it("waits for queryHistoryId before auto-creating the first conversation thread", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "/api/insights/models") {
        return okJson(modelResponse);
      }
      if (url === "/api/insights/conversation/thread/create") {
        return okJson({ threadId: "thread-xyz", userMessageId: "user-msg-xyz" });
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ url, body: init?.body }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NewInsightPage />);

    await waitFor(() => {
      expect(hoisted.latestLayoutProps).toBeTruthy();
      expect(hoisted.setHookResult).toBeTypeOf("function");
    });

    await act(async () => {
      hoisted.latestLayoutProps.setCustomerId("cust-1");
    });

    await act(async () => {
      hoisted.setHookResult?.({
        mode: "direct",
        question: "how many wounds does Melody Crist have",
        sql: "SELECT COUNT(*) FROM rpt.Wound WHERE patientFk = @patientId1",
        results: { rows: [{ NumberOfWounds: 3 }], columns: ["NumberOfWounds"] },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      fetchMock.mock.calls.filter((call) => {
        const input = call[0] as RequestInfo | URL;
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        return url === "/api/insights/conversation/thread/create";
      })
    ).toHaveLength(0);

    await act(async () => {
      hoisted.setHookResult?.({
        mode: "direct",
        question: "how many wounds does Melody Crist have",
        sql: "SELECT COUNT(*) FROM rpt.Wound WHERE patientFk = @patientId1",
        results: { rows: [{ NumberOfWounds: 3 }], columns: ["NumberOfWounds"] },
        queryHistoryId: 654,
      });
    });

    await waitFor(() => {
      const createCalls = fetchMock.mock.calls.filter((call) => {
        const input = call[0] as RequestInfo | URL;
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        return url === "/api/insights/conversation/thread/create";
      });
      expect(createCalls).toHaveLength(1);
      expect(JSON.parse(String(createCalls[0][1]?.body))).toEqual(
        expect.objectContaining({
          queryHistoryId: 654,
          customerId: "cust-1",
          initialQuestion: "how many wounds does Melody Crist have",
        })
      );
    });
  });

  it("clears active thread when selected history thread cannot be loaded", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "/api/insights/models") {
        return okJson(modelResponse);
      }
      if (url === "/api/insights/conversation/thread-good") {
        return okJson({
          thread: { id: "thread-good", customerId: "cust-1" },
          messages: [
            {
              id: "u1",
              threadId: "thread-good",
              role: "user",
              content: "Good thread question",
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      if (url === "/api/insights/conversation/thread-missing") {
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
        };
      }
      if (url === "/api/insights/execute-cached") {
        return okJson({
          mode: "direct",
          question: "Replay question",
          thinking: [],
          sql: "SELECT 1",
          results: { rows: [], columns: ["value"] },
        });
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NewInsightPage />);

    await waitFor(() => {
      expect(hoisted.latestLayoutProps).toBeTruthy();
    });

    await act(async () => {
      hoisted.latestLayoutProps.setCustomerId("cust-1");
    });

    await act(async () => {
      await hoisted.latestLayoutProps.handleHistorySelect({
        id: "history-good",
        question: "Good thread question",
        mode: "direct",
        sql: "SELECT 1",
        semanticContext: {},
        conversationThreadId: "thread-good",
      });
    });

    expect(hoisted.latestLayoutProps.conversationThreadId).toBe("thread-good");

    await act(async () => {
      await hoisted.latestLayoutProps.handleHistorySelect({
        id: "history-missing",
        question: "Missing thread question",
        mode: "direct",
        sql: "SELECT 1",
        semanticContext: {},
        conversationThreadId: "thread-missing",
      });
    });

    expect(hoisted.latestLayoutProps.conversationThreadId).toBeUndefined();
  });
});

"use client";

import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface QueryHistoryItem {
  id: string;
  question: string;
  createdAt: Date;
  mode: "template" | "direct" | "funnel" | "error";
  recordCount?: number;
  sql?: string;
  semanticContext?: unknown;
  conversationThreadId?: string;
}

export interface QueryHistorySidebarValue {
  customerId: string;
  onSelect: (query: QueryHistoryItem) => void;
  refreshTrigger: number;
}

const QueryHistorySidebarContext = createContext<{
  value: QueryHistorySidebarValue | null;
  setValue: (v: QueryHistorySidebarValue | null) => void;
} | null>(null);

export function QueryHistorySidebarProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<QueryHistorySidebarValue | null>(null);
  return (
    <QueryHistorySidebarContext.Provider value={{ value, setValue }}>
      {children}
    </QueryHistorySidebarContext.Provider>
  );
}

export function useQueryHistorySidebar() {
  const ctx = useContext(QueryHistorySidebarContext);
  if (!ctx) return null;
  return ctx;
}

export function useSetQueryHistorySidebar(
  value: QueryHistorySidebarValue | null,
) {
  const ctx = useQueryHistorySidebar();
  const setValue = ctx?.setValue;
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const setValueRef = React.useRef(setValue);
  setValueRef.current = setValue;
  React.useEffect(() => {
    setValueRef.current?.(valueRef.current);
    // Intentionally no cleanup: resetting to `null` can unmount the sidebar
    // during refreshTrigger updates and break subsequent clicks.
  }, [
    value?.customerId ?? "",
    value?.refreshTrigger ?? 0,
    setValue,
  ]);
}

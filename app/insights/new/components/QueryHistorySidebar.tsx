"use client";

import { useState, useEffect } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useQueryHistorySidebar } from "@/lib/context/QueryHistorySidebarContext";
import { Clock, AlertCircle } from "lucide-react";
import type { QueryHistoryItem } from "@/lib/context/QueryHistorySidebarContext";

export function QueryHistorySidebar() {
  const ctx = useQueryHistorySidebar();
  const [queries, setQueries] = useState<QueryHistoryItem[]>([]);

  const customerId = ctx?.value?.customerId;
  const onSelect = ctx?.value?.onSelect;
  const refreshTrigger = ctx?.value?.refreshTrigger ?? 0;

  useEffect(() => {
    if (customerId) {
      fetchQueryHistory();
    } else {
      setQueries([]);
    }
  }, [customerId, refreshTrigger]);

  const fetchQueryHistory = async () => {
    if (!customerId) return;
    try {
      const response = await fetch(
        `/api/insights/history?customerId=${customerId}`,
      );
      if (!response.ok) {
        setQueries([]);
        return;
      }
      const data = await response.json();
      setQueries(Array.isArray(data) ? data : []);
    } catch {
      setQueries([]);
    }
  };

  if (!ctx?.value?.customerId || queries.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs text-sidebar-foreground/70">
        <Clock className="mr-2 h-3.5 w-3.5" />
        Query History
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {queries.map((q) => (
            <SidebarMenuItem key={q.id}>
              <SidebarMenuButton
                tooltip={q.question}
                className="h-auto min-h-[2.5rem] py-2 px-2 justify-start text-left"
                onClick={() => onSelect?.(q)}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {q.question}
                  </span>
                  <span className="text-xs text-sidebar-foreground/60">
                    {formatTimestamp(q.createdAt)}
                    {q.mode === "error" && " • Failed"}
                    {q.mode !== "error" &&
                      q.recordCount !== undefined &&
                      ` • ${q.recordCount} records`}
                  </span>
                </div>
                {q.mode === "error" && (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function formatTimestamp(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "Just now";
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

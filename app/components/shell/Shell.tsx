"use client";
import { PropsWithChildren, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";

export function Shell({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("ig.sidebar.collapsed");
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ig.sidebar.collapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  // Responsive grid: single column on small screens, two columns on md+
  const mdCols = collapsed ? "md:grid-cols-[3.5rem_1fr]" : "md:grid-cols-[11rem_1fr]";
  return (
    <div className={`grid grid-cols-1 ${mdCols} gap-6 min-h-[70vh]`}>
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>
      <section>{children}</section>
    </div>
  );
}

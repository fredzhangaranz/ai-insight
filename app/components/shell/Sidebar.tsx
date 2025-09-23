"use client";
import Link from "next/link";
import { MouseEventHandler } from "react";
import {
  HomeIcon,
  Squares2x2Icon,
  ClipboardDocumentIcon,
  SparklesIcon,
} from "@/components/heroicons";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const iconCls = "w-5 h-5";
const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: <HomeIcon className={iconCls} /> },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <Squares2x2Icon className={iconCls} />,
  },
  {
    href: "/insights",
    label: "Insights",
    icon: <ClipboardDocumentIcon className={iconCls} />,
  },
  {
    href: "/analysis",
    label: "Create Insight",
    icon: <SparklesIcon className={iconCls} />,
  },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: MouseEventHandler<HTMLButtonElement>;
}) {
  const widthClass = collapsed ? "w-14" : "w-44"; // slightly narrower
  return (
    <aside
      className={`bg-white border rounded p-3 ${widthClass} transition-[width] duration-200 overflow-hidden`}
      aria-label="Side navigation"
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className={`text-xs font-semibold text-slate-500 ${
            collapsed ? "sr-only" : ""
          }`}
        >
          Navigation
        </div>
        <button
          onClick={onToggle}
          className="text-slate-600 hover:text-slate-900 text-xs border rounded px-2 py-1"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>
      <nav className="space-y-1">
        {NAV_ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 rounded px-2 py-1.5 ${
              collapsed ? "justify-center" : ""
            }`}
            title={collapsed ? it.label : undefined}
          >
            <span aria-hidden>{it.icon}</span>
            {!collapsed && <span className="truncate">{it.label}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

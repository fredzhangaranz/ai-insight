"use client";

export const LAYOUT_STORAGE_KEY = "insights_chat_ui_layout";
export type LayoutMode = "classic" | "new";

interface LayoutToggleProps {
  value: LayoutMode;
  onChange: (value: LayoutMode) => void;
}

export function LayoutToggle({ value, onChange }: LayoutToggleProps) {
  const handleChange = (mode: LayoutMode) => {
    onChange(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    }
  };

  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      <button
        type="button"
        onClick={() => handleChange("classic")}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          value === "classic"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Classic
      </button>
      <button
        type="button"
        onClick={() => handleChange("new")}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          value === "new"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600 hover:text-slate-900"
        }`}
      >
        New
      </button>
    </div>
  );
}

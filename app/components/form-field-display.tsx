"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/heroicons";

interface FormFieldDisplayProps {
  fieldName: string;
  fieldType: string;
  options?: string[];
}

const getFieldTypeIcon = (fieldType: string) => {
  switch (fieldType) {
    case "Text":
      return { icon: "T", color: "bg-green-100 text-green-700" };
    case "Integer":
      return { icon: "123", color: "bg-blue-100 text-blue-700" };
    case "Boolean":
      return { icon: "✓", color: "bg-purple-100 text-purple-700" };
    case "SingleSelectList": // Changed from SingleSelect
      return { icon: "▼", color: "bg-orange-100 text-orange-700" };
    case "MultiSelectList": // Changed from MultiSelect
      return { icon: "☰", color: "bg-red-100 text-red-700" };
    case "File":
      return { icon: "📁", color: "bg-gray-100 text-gray-700" };
    default:
      return { icon: "?", color: "bg-gray-100 text-gray-700" };
  }
};

export function FormFieldDisplay({
  fieldName,
  fieldType,
  options = [],
}: FormFieldDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fieldTypeInfo = getFieldTypeIcon(fieldType);
  const hasOptions = options.length > 0;

  // *** THE FIX IS HERE ***
  // We now check for the correct names returned by the API.
  const isDropdownField =
    fieldType === "SingleSelectList" || fieldType === "MultiSelectList";

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 transition-all duration-200 hover:shadow-sm">
      <div
        className={`flex items-center justify-between ${
          isDropdownField && hasOptions ? "cursor-pointer" : ""
        }`}
        onClick={() =>
          isDropdownField && hasOptions && setIsExpanded(!isExpanded)
        }
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {/* Field Type Badge */}
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${fieldTypeInfo.color} flex-shrink-0`}
          >
            {fieldTypeInfo.icon}
          </div>

          {/* Field Name and Type */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900 truncate">
              {fieldName}
            </div>
            <div className="text-xs text-slate-500 flex items-center space-x-2">
              <span>{fieldType}</span>
              {hasOptions && (
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
                  {options.length} option{options.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expand/Collapse Icon for dropdown fields */}
        {isDropdownField && hasOptions && (
          <div className="flex-shrink-0 ml-2">
            {isExpanded ? (
              <ChevronDownIcon className="w-4 h-4 text-slate-400 transition-transform duration-200" />
            ) : (
              <ChevronRightIcon className="w-4 h-4 text-slate-400 transition-transform duration-200" />
            )}
          </div>
        )}
      </div>

      {/* Expandable Options List */}
      {isDropdownField && hasOptions && isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 animate-in fade-in duration-200">
          <div className="text-xs font-medium text-slate-600 mb-2">
            Available Options:
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {options.map((option, index) => (
              <div
                key={index}
                className="text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded border hover:bg-slate-100 transition-colors duration-150"
              >
                {option}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

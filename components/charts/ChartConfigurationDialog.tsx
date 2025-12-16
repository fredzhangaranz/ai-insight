import React, { useState, useEffect } from "react";
import type { ChartType } from "@/lib/chart-contracts";
import {
  ChartComponent,
  type ChartDataType,
} from "@/app/components/charts/chart-component";
import { shapeDataForChart } from "@/lib/data-shaper";
import { normalizeChartMapping } from "@/lib/chart-mapping-utils";
import { useErrorHandler } from "@/lib/error-handler";

interface ChartConfigurationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  queryResults: any[];
  chartType: ChartType;
  initialMapping?: Record<string, string>;
  title?: string;
  onSave?: (config: {
    chartType: ChartType;
    chartMapping: Record<string, string>;
  }) => void;
  saveButtonText?: string;
  allowTypeChange?: boolean;
  onTypeChange?: (chartType: ChartType) => void;
}

type ChartMapping = {
  [key: string]: string;
};

export const ChartConfigurationDialog: React.FC<
  ChartConfigurationDialogProps
> = ({
  isOpen,
  onClose,
  queryResults,
  chartType,
  initialMapping,
  title = "Configure Chart",
  onSave,
  saveButtonText = "Save",
  allowTypeChange = false,
  onTypeChange,
}) => {
  const { handleError } = useErrorHandler();

  const [step, setStep] = useState<"mapping" | "preview">("mapping");
  const [chartMapping, setChartMapping] = useState<ChartMapping>(
    initialMapping ?? {}
  );
  const [chartData, setChartData] = useState<ChartDataType | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  // Reset state when modal opens or chartType changes
  useEffect(() => {
    if (isOpen) {
      setStep("mapping");
      setChartData(null);

      const baseMapping = initialMapping ?? {};

      // Extract available fields from query results
      if (queryResults && queryResults.length > 0) {
        const fields = Object.keys(queryResults[0]);
        setAvailableFields(fields);
        
        // Initialize mapping with provided initial mapping or empty values
        const requiredFields = getRequiredFields(chartType);
        const newMapping: ChartMapping = { ...baseMapping };

        // Ensure all required fields have entries (even if empty)
        requiredFields.forEach((field) => {
          if (!(field in newMapping)) {
            newMapping[field] = "";
          }
        });

        setChartMapping(newMapping);
      }
    }
  }, [isOpen, queryResults, chartType, initialMapping]);

  const getRequiredFields = (chartType: ChartType): string[] => {
    switch (chartType) {
      case "bar":
        return ["category", "value"];
      case "line":
        return ["x", "y"];
      case "pie":
        return ["label", "value"];
      case "kpi":
        return ["label", "value"];
      case "table":
        return [];
      default:
        return [];
    }
  };

  const handleMappingChange = (chartField: string, dataField: string) => {
    setChartMapping((prev) => ({
      ...prev,
      [chartField]: dataField,
    }));
  };

  const handleGenerateChart = () => {
    if (!chartType) return;

    try {
      // Validate mapping
      const requiredFields = getRequiredFields(chartType);
      const missingFields = requiredFields.filter(
        (field) => !chartMapping[field]
      );

      if (missingFields.length > 0) {
        handleError(
          new Error(
            `Please map all required fields: ${missingFields.join(", ")}`
          ),
          "Chart Generation"
        );
        return;
      }

      // Generate chart data
      if (chartType === "table") {
        setChartData(queryResults);
      } else {
        const normalizedMapping = normalizeChartMapping(
          chartType,
          chartMapping
        );
        const shapedData = shapeDataForChart(
          queryResults,
          {
            chartType: chartType,
            mapping: normalizedMapping as any,
          },
          chartType
        );
        setChartData(shapedData);
        setChartMapping(normalizedMapping as ChartMapping);
      }

      setStep("preview");
    } catch (error: any) {
      handleError(error, "Chart Generation");
    }
  };

  const handleSave = async () => {
    try {
      if (!chartType) {
        throw new Error("Please select a chart type");
      }
      if (chartType !== "table") {
        const required = getRequiredFields(chartType);
        const missing = required.filter((f) => !chartMapping[f]);
        if (missing.length) {
          throw new Error(
            `Please map all required fields before saving: ${missing.join(
              ", "
            )}`
          );
        }
      }

      onSave?.({
        chartType: chartType,
        chartMapping: chartType === "table" ? {} : chartMapping,
      });
      onClose();
    } catch (err: any) {
      handleError(err, "Save Configuration");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === "mapping" && "Map Data Fields"}
            {step === "preview" && "Chart Preview"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === "mapping" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-700">
                    Chart Type:
                  </span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm capitalize">
                    {chartType}
                  </span>
                </div>
                {allowTypeChange && (
                  <button
                    onClick={() => onTypeChange?.(chartType)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Change Type
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Available Fields */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Available Data Fields
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {availableFields.map((field) => (
                      <div key={field} className="text-sm text-gray-800 py-1">
                        • {field}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart Mapping */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Chart Mapping
                  </h3>
                  <div className="space-y-3">
                    {getRequiredFields(chartType).map((field) => (
                      <div key={field} className="flex items-center space-x-3">
                        <label className="text-sm text-gray-600 w-20 capitalize">
                          {field}:
                        </label>
                        <select
                          key={`select-${field}`}
                          value={chartMapping[field] ?? ""}
                          onChange={(e) => {
                            handleMappingChange(field, e.target.value);
                          }}
                          className="flex-1 text-sm border border-gray-300 rounded px-3 py-2 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select field...</option>
                          {availableFields.map((availableField) => (
                            <option key={availableField} value={availableField}>
                              {availableField}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Data Preview */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Data Preview (first 5 rows)
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr className="border-b">
                        {availableFields.map((field) => (
                          <th key={field} className="text-left p-2 font-medium">
                            {field}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResults.slice(0, 5).map((row, index) => (
                        <tr key={index} className="border-b">
                          {availableFields.map((field) => (
                            <td key={field} className="p-2">
                              {String(row[field] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === "preview" && chartData && chartType && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-700">
                    Chart Type:
                  </span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm capitalize">
                    {chartType}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setStep("mapping")}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Edit Mapping
                  </button>
                  {allowTypeChange && (
                    <button
                      onClick={() => onTypeChange?.(chartType)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Change Type
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-y-auto max-h-[60vh]">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  {title}
                </h4>
                <div className="min-h-[320px]">
                  <ChartComponent
                    chartType={chartType}
                    data={chartData}
                    className="w-full h-[320px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t">
          <button
            onClick={() => {
              if (step === "preview") {
                setStep("mapping");
                setChartData(null);
              } else {
                onClose();
              }
            }}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            {step === "preview" ? "Back" : "Cancel"}
          </button>

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>

            {step === "mapping" && (
              <button
                onClick={handleGenerateChart}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Generate Preview
              </button>
            )}

            {step === "preview" && (
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              >
                {saveButtonText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

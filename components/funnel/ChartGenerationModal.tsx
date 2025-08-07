import React, { useState, useEffect } from "react";
import type { ChartType } from "@/lib/chart-contracts";
import {
  ChartComponent,
  type ChartDataType,
} from "@/app/components/charts/chart-component";
import { shapeDataForChart } from "@/lib/data-shaper";
import { useErrorHandler } from "@/lib/error-handler";

interface ChartGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  queryResults: any[];
  subQuestion: string;
}

type ChartMapping = {
  [key: string]: string;
};

const CHART_TYPE_DESCRIPTIONS = {
  bar: "Bar charts are best for comparing categories or showing distributions. Use when you have distinct categories with numeric values.",
  line: "Line charts are ideal for showing trends over time or continuous data. Use when you have date/time data on x-axis and numeric values on y-axis.",
  pie: "Pie charts show part-to-whole relationships and proportions. Use when you have categories that sum to a meaningful total.",
  kpi: "KPI cards display single important metrics or key performance indicators. Use when you have one primary value to highlight.",
  table:
    "Tables show detailed raw data when no clear visualization pattern exists. Use for complex data or when users need to see exact values.",
};

export const ChartGenerationModal: React.FC<ChartGenerationModalProps> = ({
  isOpen,
  onClose,
  queryResults,
  subQuestion,
}) => {
  const { handleError } = useErrorHandler();

  const [step, setStep] = useState<"type-selection" | "mapping" | "preview">(
    "type-selection"
  );
  const [selectedChartType, setSelectedChartType] = useState<ChartType | null>(
    null
  );
  const [chartMapping, setChartMapping] = useState<ChartMapping>({});
  const [chartData, setChartData] = useState<ChartDataType | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("type-selection");
      setSelectedChartType(null);
      setChartMapping({});
      setChartData(null);

      // Extract available fields from query results
      if (queryResults && queryResults.length > 0) {
        setAvailableFields(Object.keys(queryResults[0]));
      }
    }
  }, [isOpen, queryResults]);

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

  const handleChartTypeSelect = (chartType: ChartType) => {
    setSelectedChartType(chartType);
    setStep("mapping");

    // Initialize mapping with empty values
    const requiredFields = getRequiredFields(chartType);
    const initialMapping: ChartMapping = {};
    requiredFields.forEach((field) => {
      initialMapping[field] = "";
    });
    setChartMapping(initialMapping);
  };

  const handleMappingChange = (chartField: string, dataField: string) => {
    setChartMapping((prev) => ({
      ...prev,
      [chartField]: dataField,
    }));
  };

  const handleGenerateChart = () => {
    if (!selectedChartType) return;

    try {
      // Validate mapping
      const requiredFields = getRequiredFields(selectedChartType);
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
      if (selectedChartType === "table") {
        setChartData(queryResults);
      } else {
        const shapedData = shapeDataForChart(
          queryResults,
          {
            chartType: selectedChartType,
            mapping: chartMapping,
          },
          selectedChartType
        );
        setChartData(shapedData);
      }

      setStep("preview");
    } catch (error: any) {
      handleError(error, "Chart Generation");
    }
  };

  const handleBack = () => {
    if (step === "mapping") {
      setStep("type-selection");
      setSelectedChartType(null);
      setChartMapping({});
    } else if (step === "preview") {
      setStep("mapping");
      setChartData(null);
    }
  };

  const handleSaveChart = () => {
    // TODO: Save chart configuration to database
    console.log("Saving chart configuration:", {
      chartType: selectedChartType,
      mapping: chartMapping,
      data: chartData,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === "type-selection" && "Select Chart Type"}
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
          {step === "type-selection" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(CHART_TYPE_DESCRIPTIONS).map(
                  ([type, description]) => (
                    <div
                      key={type}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => handleChartTypeSelect(type as ChartType)}
                    >
                      <div className="text-center mb-3">
                        <div className="text-2xl mb-2">
                          {type === "bar" && "📊"}
                          {type === "line" && "📈"}
                          {type === "pie" && "🥧"}
                          {type === "kpi" && "📋"}
                          {type === "table" && "📋"}
                        </div>
                        <h3 className="font-medium text-gray-900 capitalize">
                          {type} Chart
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600">{description}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {step === "mapping" && selectedChartType && (
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700">
                  Chart Type:
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm capitalize">
                  {selectedChartType}
                </span>
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
                    {getRequiredFields(selectedChartType).map((field) => (
                      <div key={field} className="flex items-center space-x-3">
                        <label className="text-sm text-gray-600 w-20 capitalize">
                          {field}:
                        </label>
                        <select
                          value={chartMapping[field] || ""}
                          onChange={(e) =>
                            handleMappingChange(field, e.target.value)
                          }
                          className="flex-1 text-sm border border-gray-300 rounded px-3 py-2 bg-white"
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

          {step === "preview" && chartData && selectedChartType && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-700">
                    Chart Type:
                  </span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm capitalize">
                    {selectedChartType}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setStep("mapping")}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Edit Mapping
                  </button>
                  <button
                    onClick={() => setStep("type-selection")}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Change Type
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  {subQuestion}
                </h4>
                <div className="h-80">
                  <ChartComponent
                    chartType={selectedChartType}
                    data={chartData}
                    title={subQuestion}
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t">
          <button
            onClick={handleBack}
            className={`px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 ${
              step === "type-selection" ? "invisible" : ""
            }`}
          >
            Back
          </button>

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>

            {step === "type-selection" && (
              <button
                onClick={() => setStep("mapping")}
                disabled={!selectedChartType}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            )}

            {step === "mapping" && (
              <button
                onClick={handleGenerateChart}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Generate Chart
              </button>
            )}

            {step === "preview" && (
              <button
                onClick={handleSaveChart}
                className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              >
                Save Chart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  SparklesIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon,
} from "@/components/heroicons";
import { ChartComponent } from "./chart-component";
import { LoadingDots } from "./loading-dots";
import { CodeBlock } from "./code-block";
import { DataTable } from "./data-table";
import { FormFieldDisplay } from "./form-field-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// --- TYPE DEFINITIONS ---
type FormField = { fieldtype: string; options: string[] };
type AssessmentFormDefinition = { [key: string]: FormField };
type InsightQuestion = { text: string; type: "single-patient" | "all-patient" };
type InsightCategory = { category: string; questions: InsightQuestion[] };
type InsightsResponse = { insights: InsightCategory[] };

interface AnalysisPageProps {
  assessmentFormId: string;
  assessmentFormName: string;
  onBack: () => void;
}

// Redefined states to better match the new workflow
type AnalysisState = "loading" | "initial" | "insights" | "results" | "error";

// Mock data for the final results page
const mockChartData = [
  { name: "Diabetic", value: 145, percentage: 35 },
  { name: "Pressure Ulcer: Stage 2", value: 98, percentage: 24 },
];
const mockSqlQuery = `SELECT etiology, COUNT(*) as count FROM wound_assessments GROUP BY etiology;`;
const mockTableData = [
  { etiology: "Diabetic", count: 145 },
  { etiology: "Pressure Ulcer: Stage 2", count: 98 },
];

export default function AnalysisPage({
  assessmentFormId,
  assessmentFormName,
  onBack,
}: AnalysisPageProps) {
  const [state, setState] = useState<AnalysisState>("loading");
  const [selectedQuestion, setSelectedQuestion] = useState<string>("");
  const [definition, setDefinition] = useState<AssessmentFormDefinition | null>(
    null
  );
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Fetches data. The `regenerate` flag forces a new AI call.
   */
  const fetchData = async (regenerate = false) => {
    setState("loading");
    setErrorMessage(null);

    try {
      // We always need the definition, so fetch it regardless.
      const defPromise = fetch(
        `/api/assessment-forms/${assessmentFormId}/definition`
      );

      // Fetch insights with the appropriate URL
      const insightsUrl = `/api/assessment-forms/${assessmentFormId}/insights${
        regenerate ? "?regenerate=true" : ""
      }`;
      const insightsPromise = fetch(insightsUrl);

      const [defResponse, insightsResponse] = await Promise.all([
        defPromise,
        insightsPromise,
      ]);

      // Handle definition response
      if (!defResponse.ok) throw new Error("Failed to fetch form definition.");
      setDefinition(await defResponse.json());

      // Handle insights response
      if (insightsResponse.status === 204) {
        // *** NEW BEHAVIOR: No cached insights were found ***
        setInsights(null);
        setState("initial"); // Go to the state that shows the "Analyze" button
      } else if (insightsResponse.ok) {
        setInsights(await insightsResponse.json());
        setState("insights"); // Go to the state that shows the questions
      } else {
        const errorData = await insightsResponse.json();
        throw new Error(errorData.message || "Failed to get insights.");
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
      console.error("Analysis fetch error:", err);
    }
  };

  // Automatically fetch data on initial component mount
  useEffect(() => {
    fetchData(false); // Initial fetch is always a cache check
  }, [assessmentFormId]);

  const handleQuestionSelect = (question: string) => {
    setSelectedQuestion(question);
    setState("results");
  };

  // Helper to render the main content for the right panel
  const renderRightPanelContent = () => {
    switch (state) {
      case "loading":
        return (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <LoadingDots />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Fetching Analysis Data...
              </h3>
              <p className="text-slate-600">Please wait a moment.</p>
            </CardContent>
          </Card>
        );
      case "initial": // State for when no cached insights are found
        return (
          <Card className="border-slate-200 bg-white shadow-sm animate-in fade-in duration-300">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <SparklesIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">
                  No Insights Found
                </h3>
                <p className="text-slate-600">
                  Click the button below to generate AI-powered insights for
                  this form.
                </p>
              </div>
              <Button
                onClick={() => fetchData(true)}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <SparklesIcon className="w-5 h-5 mr-2" />
                Analyze with AI
              </Button>
            </CardContent>
          </Card>
        );
      case "insights":
        if (insights) {
          return (
            <Card className="border-slate-200 bg-white shadow-sm animate-in fade-in duration-500">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-xl text-slate-900">
                      AI-Generated Insights
                    </CardTitle>
                    <p className="text-slate-600 text-sm">
                      Select a question to explore your data
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchData(true)}
                  >
                    <ArrowPathIcon className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="space-y-2">
                  {insights.insights.map((cat, index) => (
                    <AccordionItem
                      key={index}
                      value={`item-${index}`}
                      className="border border-slate-200 rounded-lg px-4"
                    >
                      <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                        {cat.category}
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 pt-2">
                        {cat.questions.map((question, qIndex) => (
                          <div
                            key={qIndex}
                            onClick={() => handleQuestionSelect(question.text)}
                            className="p-3 rounded-lg bg-slate-50 hover:bg-blue-50 cursor-pointer transition-all duration-200 hover:scale-[1.01] border border-transparent hover:border-blue-200"
                          >
                            <p className="text-slate-700 hover:text-blue-700 font-medium">
                              {question.text}
                            </p>
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          );
        }
        return null;
      case "error":
        return (
          <Alert variant="destructive" className="text-left">
            <AlertTitle>An Error Occurred</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-6 text-slate-600 hover:text-slate-900"
      >
        ← Back to Forms
      </Button>
      {state === "results" ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {selectedQuestion}
            </h1>
            <p className="text-slate-600">
              Analysis based on {assessmentFormName} data
            </p>
          </div>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">
                Most Common Wound Etiologies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartComponent data={mockChartData} />
            </CardContent>
          </Card>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg text-slate-900">
                  Generated SQL
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(mockSqlQuery)}
                  className="text-slate-600 hover:text-slate-900"
                >
                  <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                  Copy SQL
                </Button>
              </CardHeader>
              <CardContent>
                <CodeBlock code={mockSqlQuery} />
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">
                  Raw Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable data={mockTableData} />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="border-slate-200 bg-slate-50/50 h-fit">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">
                {assessmentFormName} Definition
              </CardTitle>
              <p className="text-sm text-slate-600">
                Form fields available for analysis
              </p>
            </CardHeader>
            <CardContent>
              {definition ? (
                <div className="space-y-3 max-h-[32rem] overflow-y-auto">
                  {Object.entries(definition).map(([fieldName, fieldData]) => (
                    <FormFieldDisplay
                      key={fieldName}
                      fieldName={fieldName}
                      fieldType={fieldData.fieldtype}
                      options={fieldData.options}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center p-6">
                  <LoadingDots />
                  <p className="text-sm text-slate-600 mt-2">
                    Loading form definition...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="space-y-6">{renderRightPanelContent()}</div>
        </div>
      )}
    </div>
  );
}

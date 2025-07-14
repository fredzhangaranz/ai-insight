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
  UserIcon,
  BeakerIcon,
  CpuChipIcon,
} from "@/components/heroicons";
import { ChartComponent } from "./chart-component";
import { LoadingDots } from "./loading-dots";
import { CodeBlock } from "./code-block";
import { DataTable } from "./data-table";
import { FormFieldDisplay } from "./form-field-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PatientSelectionDialog } from "./patient-selection-dialog";
import ReactMarkdown from "react-markdown";

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

type AnalysisState =
  | "loading"
  | "loading" // Initial page load
  | "insights"
  | "generatingSql" // Loading after question selected
  | "sqlGenerated" // SQL + Explanation are shown
  | "fetchingData" // Loading after "Fetch Data" clicked
  | "results" // Final chart is shown
  | "error";

export default function AnalysisPage({
  assessmentFormId,
  assessmentFormName,
  onBack,
}: AnalysisPageProps) {
  const [state, setState] = useState<AnalysisState>("loading");
  const [definition, setDefinition] = useState<AssessmentFormDefinition | null>(
    null
  );
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State for the patient selection dialog
  const [isPatientDialogOpen, setIsPatientDialogOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] =
    useState<InsightQuestion | null>(null);
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);

  // New state for the multi-step result flow
  const [generatedSql, setGeneratedSql] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null); // For API 2.3
  const [recommendedChartType, setRecommendedChartType] = useState<
    string | null
  >(null);
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [tableData, setTableData] = useState<any[] | null>(null);

  const fetchData = async (regenerate = false) => {
    setState("loading");
    setErrorMessage(null);
    try {
      const defPromise = fetch(
        `/api/assessment-forms/${assessmentFormId}/definition`
      );
      const insightsUrl = `/api/assessment-forms/${assessmentFormId}/insights${
        regenerate ? "?regenerate=true" : ""
      }`;
      const insightsPromise = fetch(insightsUrl);
      const [defResponse, insightsResponse] = await Promise.all([
        defPromise,
        insightsPromise,
      ]);

      if (!defResponse.ok) throw new Error("Failed to fetch form definition.");
      setDefinition(await defResponse.json());

      if (insightsResponse.status === 204) {
        setInsights(null);
        setState("initial");
      } else if (insightsResponse.ok) {
        setInsights(await insightsResponse.json());
        setState("insights");
      } else {
        const errorData = await insightsResponse.json();
        throw new Error(errorData.message || "Failed to get insights.");
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    }
  };

  useEffect(() => {
    fetchData(false);
  }, [assessmentFormId]);

  const handleQuestionSelect = (question: InsightQuestion) => {
    setCurrentQuestion(question);
    setCurrentPatientId(null); // Reset patient ID on new question
    if (question.type === "single-patient") {
      setIsPatientDialogOpen(true);
    } else {
      // TODO: Implement the new multi-step flow for all-patient questions
      // For now, we will just log it.
      console.log("Selected all-patient question:", question.text);
      // In the new flow, this would trigger the "Generate SQL & Explanation" step
      handleGenerateSqlAndExplanation(question);
    }
  };

  const handleGenerateChartForPatient = (patientId: string) => {
    setIsPatientDialogOpen(false);
    setCurrentPatientId(patientId); // Store patient ID for regeneration
    if (currentQuestion) {
      handleGenerateSqlAndExplanation(currentQuestion, patientId);
    }
  };

  // --- NEW HANDLERS FOR MULTI-STEP FLOW ---
  const handleGenerateSqlAndExplanation = async (
    question: InsightQuestion,
    patientId?: string | null,
    regenerate = false
  ) => {
    setState("generatingSql");
    setErrorMessage(null);
    if (!definition) {
      setErrorMessage("Form definition is not loaded. Cannot generate query.");
      setState("error");
      return;
    }

    try {
      const requestBody: {
        assessmentFormId: string;
        assessmentFormDefinition: AssessmentFormDefinition;
        question: string;
        patientId?: string;
        regenerate: boolean;
      } = {
        assessmentFormId,
        assessmentFormDefinition: definition,
        question: question.text,
        regenerate,
      };

      if (patientId) {
        requestBody.patientId = patientId;
      }

      const response = await fetch("/api/ai/generate-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to generate analysis plan."
        );
      }

      const data = await response.json();
      setGeneratedSql(data.generatedSql);
      setExplanation(data.explanation);
      setRecommendedChartType(data.chartType);
      setState("sqlGenerated");
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    }
  };

  const handleFetchChartData = async () => {
    setState("fetchingData");
    setErrorMessage(null);

    // MOCK API: Simulate calling /generate-query?execute=true
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const isSinglePatient =
      !!currentQuestion && currentQuestion.type === "single-patient";
    const mockChartData = isSinglePatient
      ? [
          { name: "2023-01-15", value: 30 },
          { name: "2023-01-22", value: 25 },
          { name: "2023-01-29", value: 22 },
          { name: "2023-02-05", value: 18 },
        ]
      : [
          { name: "Diabetic", value: 145, percentage: 35 },
          { name: "Pressure Ulcer: Stage 2", value: 98, percentage: 24 },
          { name: "Venous Ulcer", value: 75, percentage: 18 },
          { name: "Surgical", value: 55, percentage: 13 },
          { name: "Arterial", value: 32, percentage: 8 },
        ];
    const mockTableData = isSinglePatient
      ? mockChartData.map((d) => ({
          assessmentDate: d.name,
          woundArea: d.value,
        }))
      : mockChartData.map((d) => ({ etiology: d.name, count: d.value }));

    setChartData(mockChartData);
    setTableData(mockTableData);
    setState("results");
  };

  const handleResetToInsights = () => {
    setState("insights");
    setCurrentQuestion(null);
    setCurrentPatientId(null);
    setGeneratedSql(null);
    setExplanation(null);
    setChartData(null);
    setTableData(null);
    setRecommendedChartType(null);
  };
  const renderLoadingState = (title: string, subtitle: string) => (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-8 text-center">
        <LoadingDots />
        <h3 className="text-xl font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600">{subtitle}</p>
      </CardContent>
    </Card>
  );

  const renderRightPanelContent = () => {
    switch (state) {
      case "loading":
        return renderLoadingState(
          "Fetching Analysis Data...",
          "Please wait while we load the form definition and insights."
        );
      case "generatingSql":
        return renderLoadingState(
          "Generating SQL...",
          "The AI is analyzing your question and preparing a query plan."
        );
      case "fetchingData":
        return renderLoadingState(
          "Fetching Data...",
          "Executing the SQL query and retrieving the results from the database."
        );
      case "initial":
        return (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <SparklesIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">
                  No Insights Found
                </h3>
                <p className="text-slate-600">
                  Click to generate AI-powered insights for this form.
                </p>
              </div>
              <Button
                onClick={() => fetchData(true)}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <SparklesIcon className="w-5 h-5 mr-2" />
                Analyze with AI
              </Button>
            </CardContent>
          </Card>
        );
      case "insights":
        return (
          insights && (
            <Card className="border-slate-200 bg-white shadow-sm">
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
                            onClick={() => handleQuestionSelect(question)}
                            className="p-3 rounded-lg bg-slate-50 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                          >
                            <p className="text-slate-700 hover:text-blue-700 font-medium flex-1">
                              {question.text}
                            </p>
                            {question.type === "single-patient" && (
                              <UserIcon className="w-5 h-5 text-slate-400 ml-4" />
                            )}
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )
        );
      case "sqlGenerated":
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-start space-x-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <BeakerIcon className="w-7 h-7 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900">
                    AI Query Plan
                  </CardTitle>
                  <p className="text-slate-600 text-sm">
                    The AI has generated a plan to answer your question. Review
                    the explanation and SQL before fetching the data.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-slate max-w-none prose-h3:mb-2 prose-h3:mt-4 prose-p:my-1">
                  {explanation && <ReactMarkdown>{explanation}</ReactMarkdown>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CpuChipIcon className="w-7 h-7 text-sky-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-slate-900">
                      Generated SQL
                    </CardTitle>
                    <p className="text-slate-600 text-sm">
                      This query will be executed against the database.
                    </p>
                  </div>
                </div>
                {generatedSql && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(generatedSql)}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                    Copy SQL
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {generatedSql && <CodeBlock code={generatedSql} />}
              </CardContent>
            </Card>

            <div className="flex justify-between items-center pt-4">
              <Button variant="ghost" onClick={handleResetToInsights}>
                ← Ask a different question
              </Button>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    currentQuestion &&
                    handleGenerateSqlAndExplanation(
                      currentQuestion,
                      currentPatientId,
                      true
                    )
                  }
                >
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Regenerate Plan
                </Button>
                <Button
                  size="lg"
                  onClick={handleFetchChartData}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Fetch Data & Generate Chart
                </Button>
              </div>
            </div>
          </div>
        );
      case "error":
        return (
          <Alert variant="destructive">
            <AlertTitle>An Error Occurred</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {currentQuestion && (
        <PatientSelectionDialog
          isOpen={isPatientDialogOpen}
          onClose={() => setIsPatientDialogOpen(false)}
          assessmentFormId={assessmentFormId}
          onPatientSelect={handleGenerateChartForPatient}
          question={currentQuestion.text}
        />
      )}
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-6 text-slate-600 hover:text-slate-900"
        >
          ← Back to Forms
        </Button>
        {state === "results" ? (
          // This block will now be the final step of your new flow
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                {currentQuestion?.text || "Analysis Results"}
              </h1>
              <p className="text-slate-600">
                Analysis based on {assessmentFormName} data
              </p>
            </div>
            {/* The final chart, rendered with real data */}
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-slate-900">
                  Data Visualization
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData && <ChartComponent data={chartData} />}
              </CardContent>
            </Card>
            <div className="grid lg:grid-cols-2 gap-6">
              {/* The verified SQL query */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg text-slate-900">
                    Generated SQL
                  </CardTitle>
                  {generatedSql && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigator.clipboard.writeText(generatedSql)
                      }
                      className="text-slate-600 hover:text-slate-900"
                    >
                      <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                      Copy SQL
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {generatedSql && <CodeBlock code={generatedSql} />}
                </CardContent>
              </Card>
              {/* The raw data table */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-900">
                    Raw Data
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {tableData && <DataTable data={tableData} />}
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
                    {Object.entries(definition).map(
                      ([fieldName, fieldData]) => (
                        <FormFieldDisplay
                          key={fieldName}
                          fieldName={fieldName}
                          fieldType={fieldData.fieldtype}
                          options={fieldData.options}
                        />
                      )
                    )}
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
    </>
  );
}

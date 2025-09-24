"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardDocumentIcon } from "@/components/heroicons";
import AnalysisPage from "./components/analysis-page";
import { LoadingDots } from "./components/loading-dots";
import { useLLMConfig } from "@/lib/hooks/use-llm-config";

// Define a type for our assessment form data
type AssessmentForm = {
  assessmentFormId: string; // Version-specific ID
  assessmentTypeId: string; // Type ID for patient listing
  assessmentFormName: string;
  definitionVersion: string;
};

// Define a type for the selected form state
type SelectedForm = {
  id: string; // Version-specific ID
  typeId: string; // Type ID for patient listing
  name: string;
} | null;

// Define a type for the current page state
type PageState = "form-selection" | "analysis";

export default function HomePage() {
  const router = useRouter();
  const { setupStatus, isSetupLoading, checkSetupStatus } = useLLMConfig();

  const [selectedForm, setSelectedForm] = useState<SelectedForm>(null);
  const [pageState, setPageState] = useState<PageState>("form-selection");
  const [forms, setForms] = useState<AssessmentForm[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check setup status on component mount
  useEffect(() => {
    const checkSetup = async () => {
      try {
        await checkSetupStatus();
      } catch (error) {
        console.error("Error checking setup status:", error);
      }
    };

    checkSetup();
  }, [checkSetupStatus]);

  // Redirect to setup if required
  useEffect(() => {
    if (setupStatus && setupStatus.isSetupRequired && !isSetupLoading) {
      router.push("/setup");
    }
  }, [setupStatus, isSetupLoading, router]);

  useEffect(() => {
    const fetchAssessmentForms = async () => {
      try {
        const response = await fetch("/api/assessment-forms");
        if (!response.ok) {
          throw new Error("Failed to fetch assessment forms.");
        }
        const data: AssessmentForm[] = await response.json();
        setForms(data);
      } catch (err: any) {
        setError(err.message);
        console.error("Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch forms if setup is not required
    if (setupStatus && !setupStatus.isSetupRequired) {
      fetchAssessmentForms();
    }
  }, [setupStatus]);

  // If a form is selected, render the AnalysisPage with both IDs
  if (selectedForm) {
    return (
      <AnalysisPage
        assessmentFormId={selectedForm.id}
        assessmentTypeId={selectedForm.typeId}
        assessmentFormName={selectedForm.name}
        onBack={() => setSelectedForm(null)}
      />
    );
  }

  // Show loading while checking setup status
  if (isSetupLoading || (setupStatus && setupStatus.isSetupRequired)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingDots />
          <p className="text-slate-600 mt-4">
            {isSetupLoading
              ? "Checking setup status..."
              : "Redirecting to setup..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-8">
        <div className="flex justify-end mb-4">
          <a
            href="/admin"
            className="text-sm text-slate-600 hover:text-slate-900 underline"
          >
            Admin Panel
          </a>
        </div>
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Select an Assessment Form to Analyze
          </h1>
          <p className="text-lg text-slate-600">
            Choose a form to unlock AI-powered insights from your clinical data
          </p>
        </div>

        {isLoading ? (
          <div className="text-center">
            <LoadingDots />
            <p className="text-slate-600">Loading forms from database...</p>
          </div>
        ) : error ? (
          <div className="text-center text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">
            <p className="font-bold">An Error Occurred</p>
            <p>{error}</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <Card
                key={form.assessmentFormId}
                className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] border-slate-200 bg-white"
                onClick={() =>
                  setSelectedForm({
                    id: form.assessmentFormId, // Version-specific ID for form definition
                    typeId: form.assessmentTypeId, // Type ID for patient listing
                    name: form.assessmentFormName,
                  })
                }
              >
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <ClipboardDocumentIcon className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {form.assessmentFormName} - v{form.definitionVersion}
                      </h3>
                      <p className="text-sm text-slate-600">
                        Analyze clinical data and track healing progression.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

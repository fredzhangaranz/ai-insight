"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardDocumentIcon } from "@/components/heroicons";
import AnalysisPage from "./components/analysis-page";
import { LoadingDots } from "./components/loading-dots";

// Define a type for our assessment form data
type AssessmentForm = {
  assessmentFormId: string;
  assessmentFormName: string;
  definitionVersion: string;
};

// Define a type for the selected form state, which can be an object or null
type SelectedForm = {
  id: string;
  name: string;
} | null;

export default function HomePage() {
  const [selectedForm, setSelectedForm] = useState<SelectedForm>(null);
  const [forms, setForms] = useState<AssessmentForm[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

    fetchAssessmentForms();
  }, []);

  // If a form is selected, render the AnalysisPage with the necessary props
  if (selectedForm) {
    return (
      <AnalysisPage
        assessmentFormId={selectedForm.id}
        assessmentFormName={selectedForm.name}
        onBack={() => setSelectedForm(null)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
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
              // Update onClick to set the selected form object with both id and name
              onClick={() =>
                setSelectedForm({
                  id: form.assessmentFormId,
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
  );
}

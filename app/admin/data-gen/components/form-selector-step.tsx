"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FormVersionInfo } from "@/lib/services/data-gen/generation-spec.types";

export interface SelectedForm {
  assessmentFormId: string;
  assessmentFormName: string;
}

interface FormSelectorStepProps {
  customerId: string;
  patientCount: number;
  onFormSelected: (form: SelectedForm) => void;
  onBack: () => void;
}

export function FormSelectorStep({
  customerId,
  patientCount,
  onFormSelected,
  onBack,
}: FormSelectorStepProps) {
  const [forms, setForms] = useState<FormVersionInfo[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/data-gen/schema/forms?customerId=${encodeURIComponent(customerId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch forms");
        return res.json();
      })
      .then((data: FormVersionInfo[]) => {
        setForms(data ?? []);
        if (data?.length > 0 && !selectedFormId) {
          setSelectedFormId(data[0].assessmentFormId);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load forms"))
      .finally(() => setLoading(false));
  }, [customerId]);

  const handleContinue = () => {
    const form = forms.find((f) => f.assessmentFormId === selectedFormId);
    if (form) {
      onFormSelected({
        assessmentFormId: form.assessmentFormId,
        assessmentFormName: form.assessmentFormName,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Select Assessment Form</CardTitle>
        <CardDescription>
          Choose which assessment form to generate for {patientCount} selected patient
          {patientCount !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading forms...</p>
        ) : forms.length === 0 ? (
          <Alert>
            <AlertDescription>No assessment forms found. Please ensure forms are published.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium">Assessment form</label>
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {forms.map((form) => (
                <label
                  key={form.assessmentFormId}
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/50 ${
                    selectedFormId === form.assessmentFormId ? "bg-muted" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="form"
                    value={form.assessmentFormId}
                    checked={selectedFormId === form.assessmentFormId}
                    onChange={() => setSelectedFormId(form.assessmentFormId)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{form.assessmentFormName}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      ({form.fieldCount} fields)
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button
            onClick={handleContinue}
            disabled={loading || forms.length === 0 || !selectedFormId}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

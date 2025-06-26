"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline"
import AnalysisPage from "./components/analysis-page"

export default function HomePage() {
  const [selectedForm, setSelectedForm] = useState<string | null>(null)

  if (selectedForm) {
    return <AnalysisPage formName={selectedForm} onBack={() => setSelectedForm(null)} />
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Select an Assessment Form to Analyze</h1>
        <p className="text-lg text-slate-600">Choose a form to unlock AI-powered insights from your clinical data</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] border-slate-200 bg-white"
          onClick={() => setSelectedForm("Wound Assessment")}
        >
          <CardContent className="p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ClipboardDocumentIcon className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Wound Assessment</h3>
                <p className="text-sm text-slate-600">
                  Analyze clinical data from wound assessments and track healing progression
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

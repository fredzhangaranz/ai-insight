import React from "react";
import { KpiCard } from "../kpi-card";
import type { KpiData } from "@/lib/chart-contracts";

// Sample KPI data for wound healing metrics
const healingTimeKpi: KpiData = {
  label: "Average Healing Time",
  value: 45.5,
  unit: "days",
  trend: {
    direction: "down",
    value: 12.3,
  },
  comparison: {
    label: "Previous Month",
    value: 57.8,
  },
};

const patientCountKpi: KpiData = {
  label: "Active Patients",
  value: 1234,
  trend: {
    direction: "up",
    value: 56,
  },
};

const healingRateKpi: KpiData = {
  label: "Healing Success Rate",
  value: 92.5,
  unit: "%",
  trend: {
    direction: "neutral",
    value: 0.2,
  },
  comparison: {
    label: "Target",
    value: 90,
  },
};

const revenueKpi: KpiData = {
  label: "Monthly Revenue",
  value: 1234567,
  unit: "$",
  trend: {
    direction: "up",
    value: 45678,
  },
  comparison: {
    label: "Previous Month",
    value: 1188889,
  },
};

export function KpiCardExample() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-6">KPI Dashboard</h2>

      {/* Grid of KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Standard size with all features */}
        <KpiCard data={healingTimeKpi} title="Healing Metrics" size="md" />

        {/* Large size with trend only */}
        <KpiCard data={patientCountKpi} title="Patient Statistics" size="lg" />

        {/* Small size with percentage */}
        <KpiCard data={healingRateKpi} title="Success Metrics" size="sm" />

        {/* Standard size with large number formatting */}
        <KpiCard data={revenueKpi} title="Financial Metrics" size="md" />
      </div>

      {/* Examples of different layouts */}
      <div className="mt-8 space-y-6">
        <h3 className="text-xl font-semibold mb-4">Alternative Layouts</h3>

        {/* Horizontal layout example */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <KpiCard data={healingTimeKpi} title="Compact View" size="sm" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <KpiCard data={patientCountKpi} title="Compact View" size="sm" />
          </div>
        </div>

        {/* Single large KPI example */}
        <div className="max-w-xl">
          <KpiCard
            data={healingRateKpi}
            title="Featured Metric"
            size="lg"
            className="bg-slate-50"
          />
        </div>
      </div>
    </div>
  );
}

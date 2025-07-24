import {
  shapeDataForChart,
  ChartDataMapping,
  KpiDataMapping,
} from "../data-shaper";

describe("shapeDataForChart", () => {
  describe("Bar Chart Data Shaping", () => {
    const barChartMapping: ChartDataMapping = {
      chartType: "bar",
      mapping: {
        category: "etiology",
        value: "count",
        label: "description",
      },
    };

    const rawBarData = [
      { etiology: "Diabetic", count: 145, description: "Type 2 Diabetes" },
      { etiology: "Pressure Ulcer", count: 98, description: "Stage 2" },
    ];

    it("shapes bar chart data correctly", () => {
      const shaped = shapeDataForChart(rawBarData, barChartMapping, "bar");
      expect(shaped).toEqual([
        {
          category: "Diabetic",
          value: 145,
          id: "bar-0",
          label: "Type 2 Diabetes",
        },
        {
          category: "Pressure Ulcer",
          value: 98,
          id: "bar-1",
          label: "Stage 2",
        },
      ]);
    });
  });

  describe("Line Chart Data Shaping", () => {
    const lineChartMapping: ChartDataMapping = {
      chartType: "line",
      mapping: {
        x: "date",
        y: "area",
        label: "note",
      },
    };

    const rawLineData = [
      { date: "2024-01-01", area: 45.5, note: "Initial" },
      { date: "2024-01-15", area: 42.3, note: "Follow-up" },
    ];

    it("shapes line chart data correctly", () => {
      const shaped = shapeDataForChart(rawLineData, lineChartMapping, "line");
      expect(shaped).toEqual([
        {
          x: "2024-01-01",
          y: 45.5,
          id: "point-0",
          label: "Initial",
        },
        {
          x: "2024-01-15",
          y: 42.3,
          id: "point-1",
          label: "Follow-up",
        },
      ]);
    });
  });

  describe("Pie Chart Data Shaping", () => {
    const pieChartMapping: ChartDataMapping = {
      chartType: "pie",
      mapping: {
        label: "type",
        value: "count",
      },
    };

    const rawPieData = [
      { type: "Diabetic", count: 100 },
      { type: "Venous", count: 100 },
    ];

    it("shapes pie chart data correctly and calculates percentages", () => {
      const shaped = shapeDataForChart(rawPieData, pieChartMapping, "pie");
      expect(shaped).toEqual([
        {
          label: "Diabetic",
          value: 100,
          id: "slice-0",
          percentage: 50,
        },
        {
          label: "Venous",
          value: 100,
          id: "slice-1",
          percentage: 50,
        },
      ]);
    });
  });

  describe("KPI Data Shaping", () => {
    const kpiMapping: ChartDataMapping = {
      chartType: "kpi",
      mapping: {
        label: "metricName",
        value: "currentValue",
        unit: "unit",
        trend: {
          direction: "trendDirection",
          value: "trendValue",
        },
        comparison: {
          label: "comparisonLabel",
          value: "comparisonValue",
        },
      } as KpiDataMapping,
    };

    const rawKpiData = [
      {
        metricName: "Average Healing Time",
        currentValue: 45.5,
        unit: "days",
        trendDirection: "down",
        trendValue: 12.3,
        comparisonLabel: "Previous Month",
        comparisonValue: 57.8,
      },
    ];

    it("shapes KPI data correctly", () => {
      const shaped = shapeDataForChart(rawKpiData, kpiMapping, "kpi");
      expect(shaped).toEqual({
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
      });
    });

    it("throws error when no data is available for KPI", () => {
      expect(() => {
        shapeDataForChart([], kpiMapping, "kpi");
      }).toThrow("No data available for KPI");
    });
  });

  describe("Data Processing Options", () => {
    const mapping: ChartDataMapping = {
      chartType: "bar",
      mapping: {
        category: "name",
        value: "count",
      },
      options: {
        sortBy: "count",
        sortDirection: "desc",
        limit: 2,
      },
    };

    const rawData = [
      { name: "C", count: 10 },
      { name: "A", count: 30 },
      { name: "B", count: 20 },
    ];

    it("applies sorting and limit correctly", () => {
      const shaped = shapeDataForChart(rawData, mapping, "bar");
      expect(shaped).toEqual([
        {
          category: "A",
          value: 30,
          id: "bar-0",
        },
        {
          category: "B",
          value: 20,
          id: "bar-1",
        },
      ]);
    });
  });

  describe("Error Handling", () => {
    it("throws error for unsupported chart type", () => {
      expect(() => {
        shapeDataForChart(
          [],
          {
            chartType: "unknown" as any,
            mapping: { category: "dummy", value: "dummy" },
          },
          "unknown" as any
        );
      }).toThrow("Unsupported chart type: unknown");
    });

    it("throws error for table data type", () => {
      expect(() => {
        shapeDataForChart(
          [],
          {
            chartType: "table",
            mapping: { category: "dummy", value: "dummy" },
          },
          "table"
        );
      }).toThrow("Table data does not need shaping");
    });
  });
});

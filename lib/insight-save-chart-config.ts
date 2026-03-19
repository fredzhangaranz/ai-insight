import type { ChartType } from "@/lib/chart-contracts";
import type { InsightArtifact } from "@/lib/types/insight-artifacts";

export type SaveChartConfig = {
  chartType: ChartType;
  chartMapping: Record<string, string>;
};

/**
 * Picks the chart to persist with a saved insight: primary chart artifact if any,
 * otherwise the first chart artifact. Applies per-index overrides from the UI
 * (e.g. ChartConfigurationDialog).
 */
export function getChartConfigForSave(
  artifacts: InsightArtifact[] | undefined,
  overrides?: Record<number, SaveChartConfig>,
): SaveChartConfig | null {
  if (!artifacts?.length) return null;

  const chartIndices: number[] = [];
  for (let i = 0; i < artifacts.length; i++) {
    if (artifacts[i].kind === "chart") chartIndices.push(i);
  }
  if (chartIndices.length === 0) return null;

  const primaryIndex = chartIndices.find(
    (i) => artifacts[i].kind === "chart" && artifacts[i].primary === true,
  );
  const idx = primaryIndex ?? chartIndices[0];
  const artifact = artifacts[idx];
  if (artifact.kind !== "chart") return null;

  const override = overrides?.[idx];
  return {
    chartType: override?.chartType ?? artifact.chartType,
    chartMapping: override?.chartMapping ?? artifact.mapping,
  };
}

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ChartType } from "@/lib/chart-contracts";
import { ChartGenerationModal } from "../ChartGenerationModal";

vi.mock("@/components/charts/ChartConfigurationDialog", () => ({
  ChartConfigurationDialog: ({ isOpen, onClose, onSave }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="chart-config-dialog">
        <button onClick={() => onSave?.({ chartType: "bar", chartMapping: { category: "col1", value: "col2" } })}>
          save-config
        </button>
        <button onClick={onClose}>close-config</button>
      </div>
    );
  },
}));

describe("ChartGenerationModal", () => {
  const sampleResults = [
    { col1: "A", col2: 1 },
    { col1: "B", col2: 2 },
  ];

  it("enables Continue after selecting a chart type in create mode", async () => {
    render(
      <ChartGenerationModal
        isOpen
        onClose={() => {}}
        queryResults={sampleResults}
        subQuestion="Test question"
        canSave
        onRequestSave={() => {}}
      />
    );

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);

    const barCard = screen.getByText(/Bar charts are best/i).parentElement;
    expect(barCard).not.toBeNull();
    fireEvent.click(barCard!);

    await waitFor(() =>
      expect((continueButton as HTMLButtonElement).disabled).toBe(false)
    );
  });

  it("opens configuration dialog and forwards saves in edit mode", async () => {
    const handleSave = vi.fn();
    const handleClose = vi.fn();

    render(
      <ChartGenerationModal
        isOpen
        onClose={handleClose}
        queryResults={sampleResults}
        subQuestion="Edit question"
        canSave
        onRequestSave={handleSave}
        editMode
        initialChartType={"line" as ChartType}
        initialChartMapping={{ x: "col1", y: "col2" }}
      />
    );

    expect(screen.queryByTestId("chart-config-dialog")).not.toBeNull();

    fireEvent.click(screen.getByText("save-config"));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith({
        chartType: "bar",
        chartMapping: { category: "col1", value: "col2" },
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });
});

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { ResultsTable } from "../ResultsTable";

describe("ResultsTable", () => {
  it("formats decimal values with two fractional digits", () => {
    render(
      <ResultsTable
        columns={["name", "score", "scoreText"]}
        rows={[{ name: "A", score: 1.2345, scoreText: "7.1" }]}
      />
    );

    expect(screen.getByText("1.23")).toBeInTheDocument();
    expect(screen.getByText("7.10")).toBeInTheDocument();
  });

  it("renders date-only values without midnight timestamps", () => {
    render(
      <ResultsTable
        columns={["assessmentDate", "dateOfBirth", "createdAt"]}
        rows={[
          {
            assessmentDate: "2026-03-31T00:00:00.000Z",
            dateOfBirth: "1960-01-01T13:00:00+13:00",
            createdAt: "2026-03-31T15:45:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getAllByText("2026-03-31")).toHaveLength(1);
    expect(screen.getByText("1960-01-01")).toBeInTheDocument();
    expect(screen.getByText("2026-03-31T15:45:00.000Z")).toBeInTheDocument();
    expect(screen.queryByText("2026-03-31T00:00:00.000Z")).not.toBeInTheDocument();
  });

  it("supports paging through table results", () => {
    render(
      <ResultsTable
        columns={["rowLabel"]}
        rows={Array.from({ length: 12 }, (_, index) => ({
          rowLabel: `Row ${index + 1}`,
        }))}
        maxRows={10}
      />
    );

    expect(screen.getByText("Showing 1-10 of 12 rows")).toBeInTheDocument();
    expect(screen.getByText("Row 1")).toBeInTheDocument();
    expect(screen.queryByText("Row 11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Showing 11-12 of 12 rows")).toBeInTheDocument();
    expect(screen.getByText("Row 11")).toBeInTheDocument();
    expect(screen.queryByText("Row 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(screen.getByText("Showing 1-10 of 12 rows")).toBeInTheDocument();
    expect(screen.getByText("Row 1")).toBeInTheDocument();
  });
});

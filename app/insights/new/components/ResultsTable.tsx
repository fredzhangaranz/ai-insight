"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatResultValue } from "./result-value-format";

interface ResultsTableProps {
  columns: string[];
  rows: any[];
  maxRows?: number;
}

export function ResultsTable({
  columns,
  rows,
  maxRows = 10,
}: ResultsTableProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / maxRows));
  const pageStart = (page - 1) * maxRows;
  const pageEnd = pageStart + maxRows;
  const displayRows = rows.slice(pageStart, pageEnd);
  const hasPagination = rows.length > maxRows;

  useEffect(() => {
    setPage(1);
  }, [rows, columns, maxRows]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (columns.length === 0) {
    return (
      <div className="overflow-x-auto">
        <div className="text-sm text-slate-500 py-4">
          No results returned.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {displayRows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col} className="px-4 py-3 text-sm text-gray-900">
                  {row[col] !== null && row[col] !== undefined
                    ? formatResultValue(row[col], col)
                    : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="text-sm text-slate-500 mt-4 text-center py-2 bg-gray-50 rounded">
          0 rows returned.
        </div>
      )}
      {hasPagination && (
        <div className="mt-4 flex flex-col gap-3 rounded bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <div>
            Showing {pageStart + 1}-{Math.min(pageEnd, rows.length)} of {rows.length} rows
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="min-w-20 text-center">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

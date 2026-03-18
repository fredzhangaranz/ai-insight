"use client";

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
  const displayRows = rows.slice(0, maxRows);
  const hasMore = rows.length > maxRows;

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
                    ? String(row[col])
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
      {hasMore && (
        <div className="text-sm text-gray-500 mt-4 text-center py-2 bg-gray-50 rounded">
          Showing first {maxRows} of {rows.length} rows
        </div>
      )}
    </div>
  );
}

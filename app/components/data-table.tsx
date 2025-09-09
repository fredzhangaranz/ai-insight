"use client";

interface DataTableProps {
  data: Array<Record<string, any>>;
  className?: string;
}

export function DataTable({ data, className = "" }: DataTableProps) {
  if (!data || data.length === 0) return null;

  const columns = Object.keys(data[0]);

  return (
    <div className={`w-full h-full overflow-auto ${className}`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 z-10">
          <tr className="border-b border-slate-200">
            {columns.map((column) => (
              <th
                key={column}
                className="text-left py-3 px-4 font-semibold text-slate-900 bg-slate-50"
              >
                {column
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className={`border-b border-slate-100 ${
                index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
              }`}
            >
              {columns.map((column) => (
                <td key={column} className="py-3 px-4 text-slate-700">
                  {typeof row[column] === "number" && column === "percentage"
                    ? `${row[column]}%`
                    : row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

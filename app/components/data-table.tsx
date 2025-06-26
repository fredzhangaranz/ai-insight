"use client"

interface DataTableProps {
  data: Array<Record<string, any>>
}

export function DataTable({ data }: DataTableProps) {
  if (!data || data.length === 0) return null

  const columns = Object.keys(data[0])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((column) => (
              <th key={column} className="text-left py-3 px-4 font-semibold text-slate-900 bg-slate-50">
                {column.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index} className={`border-b border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
              {columns.map((column) => (
                <td key={column} className="py-3 px-4 text-slate-700">
                  {typeof row[column] === "number" && column === "percentage" ? `${row[column]}%` : row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

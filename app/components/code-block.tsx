"use client"

interface CodeBlockProps {
  code: string
}

export function CodeBlock({ code }: CodeBlockProps) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
        <code className="language-sql">
          {code.split("\n").map((line, index) => (
            <div key={index} className="table-row">
              <span className="table-cell text-slate-500 pr-4 select-none text-right w-8">{index + 1}</span>
              <span className="table-cell">
                {line
                  .split(
                    /(\bSELECT\b|\bFROM\b|\bWHERE\b|\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|\bCOUNT\b|\bROUND\b|\bDATEADD\b|\bGETDATE\b)/,
                  )
                  .map((part, i) => {
                    if (
                      [
                        "SELECT",
                        "FROM",
                        "WHERE",
                        "GROUP BY",
                        "ORDER BY",
                        "LIMIT",
                        "COUNT",
                        "ROUND",
                        "DATEADD",
                        "GETDATE",
                      ].includes(part)
                    ) {
                      return (
                        <span key={i} className="text-blue-400 font-semibold">
                          {part}
                        </span>
                      )
                    }
                    return <span key={i}>{part}</span>
                  })}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Copy, Check } from "lucide-react";
import type { MessageMetadata } from "@/lib/types/conversation";

const KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "WITH",
  "AS",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "FULL",
  "ON",
  "GROUP",
  "BY",
  "ORDER",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "DISTINCT",
  "UNION",
  "ALL",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "IN",
  "IS",
  "NULL",
  "NOT",
  "EXISTS",
]);

interface SQLPreviewProps {
  sql: string;
  compositionStrategy?: MessageMetadata["compositionStrategy"];
  messageId: string;
}

export function SQLPreview({ sql, compositionStrategy, messageId }: SQLPreviewProps) {
  const [copied, setCopied] = useState(false);
  const cteName = useMemo(() => getCteName(sql), [sql]);
  const highlightedLines = useMemo(() => highlightSql(sql), [sql]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy SQL:", error);
    }
  };

  return (
    <div
      id={`sql-preview-${messageId}`}
      className="rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Generated SQL
          {compositionStrategy === "cte" && cteName && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              CTE: {cteName}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-72 overflow-x-auto whitespace-pre bg-slate-950 px-4 py-3 text-xs text-slate-100">
        <code>
          {highlightedLines.map((line, index) => (
            <span key={`line-${index}`} className="leading-relaxed">
              {line}
              {index < highlightedLines.length - 1 ? "\n" : ""}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function getCteName(sql: string): string | null {
  const match = sql.match(/^\s*with\s+([a-zA-Z0-9_]+)/i);
  return match?.[1] ?? null;
}

function highlightSql(sql: string): ReactNode[] {
  return sql.split("\n").map((line, lineIndex) => {
    const [code, comment] = splitLineComment(line);
    const tokens = code.split(/(\s+)/).filter((token) => token.length > 0);

    return (
      <span key={`sql-line-${lineIndex}`}>
        {tokens.map((token, tokenIndex) => {
          if (token.trim().length === 0) {
            return <span key={`ws-${tokenIndex}`}>{token}</span>;
          }

          const cleaned = token.replace(/^[("`]+|[),;`]+$/g, "");
          const upper = cleaned.toUpperCase();
          const isKeyword = KEYWORDS.has(upper);
          const isNumber = /^-?\d+(\.\d+)?$/.test(cleaned);
          const isString =
            token.startsWith("'") ||
            token.startsWith("\"") ||
            token.startsWith("`");

          const className = isKeyword
            ? "text-pink-300 font-semibold"
            : isString
            ? "text-emerald-300"
            : isNumber
            ? "text-amber-200"
            : "text-slate-100";

          return (
            <span key={`tok-${tokenIndex}`} className={className}>
              {token}
            </span>
          );
        })}
        {comment && <span className="text-slate-400">{comment}</span>}
      </span>
    );
  });
}

function splitLineComment(line: string): [string, string] {
  const commentIndex = line.indexOf("--");
  if (commentIndex === -1) {
    return [line, ""];
  }
  return [line.slice(0, commentIndex), line.slice(commentIndex)];
}

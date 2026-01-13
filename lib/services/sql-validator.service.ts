/**
 * Runtime SQL validation for GROUP BY / ORDER BY correctness (Task 4.S23).
 *
 * This service parses generated SQL (heuristic tokenizer) and ensures that:
 * - ORDER BY expressions reference grouped columns or aggregates
 * - Aggregates aren't nested (COUNT(MAX(...)) is rejected)
 *
 * The validator intentionally focuses on the final SELECT statement and
 * tolerates SQL Server specific syntax (TOP, CTEs, bracketed identifiers).
 */

export type SQLValidationErrorType =
  | "GROUP_BY_VIOLATION"
  | "ORDER_BY_VIOLATION"
  | "AGGREGATE_VIOLATION";

export interface SQLValidationError {
  type: SQLValidationErrorType;
  message: string;
  suggestion: string;
  expression?: string;
}

export interface SQLValidationResult {
  isValid: boolean;
  errors: SQLValidationError[];
  warnings: string[];
  analyzedAt: string;
  metadata?: {
    groupedExpressions: string[];
    orderByExpressions: string[];
    selectAliases: string[];
  };
}

interface IdentifierInfo {
  raw: string;
  normalized: string;
  columnOnly: string;
}

interface ParsedExpression {
  raw: string;
  normalized: string;
  identifiers: IdentifierInfo[];
  isSimpleIdentifier: boolean;
}

interface SelectItem extends ParsedExpression {
  alias?: string;
  aliasKey?: string;
  isAggregate: boolean;
  isGrouped: boolean;
}

interface OrderByItem extends ParsedExpression {
  direction?: "ASC" | "DESC";
  usesNumericPosition: boolean;
  aliasKey?: string;
}

interface ParsedQuery {
  selectItems: SelectItem[];
  groupByExpressions: ParsedExpression[];
  orderByItems: OrderByItem[];
}

const AGGREGATE_FUNCTIONS = [
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "STRING_AGG",
  "PERCENTILE_CONT",
  "PERCENTILE_DISC",
  "VAR",
  "VARP",
  "STDEV",
  "STDDEV",
];

const KEYWORDS = new Set(
  [
    "select",
    "from",
    "where",
    "group",
    "by",
    "having",
    "order",
    "with",
    "case",
    "when",
    "then",
    "else",
    "end",
    "join",
    "inner",
    "left",
    "right",
    "full",
    "outer",
    "on",
    "and",
    "or",
    "not",
    "asc",
    "desc",
    "nulls",
    "first",
    "last",
    "distinct",
    "top",
    "limit",
    "offset",
    "fetch",
    "rows",
    "row",
    "partition",
    "over",
    "into",
    "union",
    "all",
    "as",
    "cast",
    "convert",
    "like",
    "in",
    "exists",
    "between",
    "is",
    "null",
    "coalesce",
    "datediff",
    "dateadd",
    "year",
  ].concat(AGGREGATE_FUNCTIONS.map((fn) => fn.toLowerCase()))
);

export class SQLValidator {
  validate(sql: string | undefined | null): SQLValidationResult {
    const result: SQLValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      analyzedAt: new Date().toISOString(),
    };

    if (!sql || !sql.trim()) {
      return result;
    }

    const sanitized = this.stripComments(sql);
    const mainQuery = this.extractMainQuery(sanitized);
    if (!mainQuery) {
      return result;
    }

    const parsed = this.parseQuery(mainQuery);
    if (!parsed) {
      return result;
    }

    result.metadata = {
      groupedExpressions: parsed.groupByExpressions.map((expr) => expr.raw),
      orderByExpressions: parsed.orderByItems.map((order) => order.raw),
      selectAliases: parsed.selectItems
        .filter((item) => Boolean(item.alias))
        .map((item) => item.alias!),
    };

    const nestedAggregateErrors = this.detectNestedAggregates(mainQuery);
    for (const nestedError of nestedAggregateErrors) {
      result.errors.push({
        type: "AGGREGATE_VIOLATION",
        message: nestedError,
        suggestion:
          "Avoid nesting aggregate functions. Replace inner aggregate with raw columns or move logic into a subquery.",
      });
    }

    if (result.errors.length > 0) {
      result.isValid = false;
      return result;
    }

    if (parsed.groupByExpressions.length === 0) {
      // Nothing more to validate if query is not grouped
      return result;
    }

    const aliasLookup = new Map<string, SelectItem>();
    for (const item of parsed.selectItems) {
      if (item.aliasKey) {
        aliasLookup.set(item.aliasKey, item);
      }
    }

    const groupNormalizedSet = new Set(
      parsed.groupByExpressions.map((expr) => expr.normalized)
    );
    const simpleGroupColumnSet = new Set(
      parsed.groupByExpressions
        .filter((expr) => expr.isSimpleIdentifier)
        .map((expr) => this.normalizeIdentifier(expr.raw))
    );
    const simpleGroupColumnNameSet = new Set(
      parsed.groupByExpressions
        .filter((expr) => expr.isSimpleIdentifier)
        .map((expr) => this.extractColumnOnly(expr.raw))
    );

    for (const order of parsed.orderByItems) {
      if (order.usesNumericPosition) {
        continue;
      }

      const aliasMatch = aliasLookup.get(order.aliasKey || "");
      if (aliasMatch) {
        if (aliasMatch.isAggregate || aliasMatch.isGrouped) {
          continue;
        }

        result.errors.push({
          type: "ORDER_BY_VIOLATION",
          expression: order.raw,
          message: `ORDER BY "${aliasMatch.alias}" references a column/expression that is not part of the GROUP BY clause.`,
          suggestion: this.buildSuggestionForExpression(
            aliasMatch.alias || order.raw
          ),
        });
        continue;
      }

      if (order.isSimpleIdentifier) {
        const normalized = this.normalizeExpression(order.raw);
        const columnOnly = this.extractColumnOnly(order.raw);

        const matchesGroup =
          groupNormalizedSet.has(normalized) ||
          simpleGroupColumnSet.has(normalized) ||
          (columnOnly !== order.raw.toLowerCase() &&
            simpleGroupColumnNameSet.has(columnOnly));

        if (matchesGroup) {
          continue;
        }

        result.errors.push({
          type: "GROUP_BY_VIOLATION",
          expression: order.raw,
          message: `ORDER BY "${order.raw.trim()}" is not grouped or aggregated.`,
          suggestion: this.buildSuggestionForExpression(order.raw.trim()),
        });
        continue;
      }

      if (order.identifiers.length > 0) {
        const missing = order.identifiers.filter(
          (identifier) =>
            !simpleGroupColumnNameSet.has(identifier.columnOnly) &&
            !simpleGroupColumnSet.has(identifier.normalized)
        );

        if (missing.length > 0) {
          result.errors.push({
            type: "GROUP_BY_VIOLATION",
            expression: order.raw,
            message: `ORDER BY expression references ungrouped column(s): ${missing
              .map((m) => m.raw)
              .join(", ")}`,
            suggestion: this.buildSuggestionForExpression(order.raw.trim()),
          });
        }
      }
    }

    if (result.errors.length > 0) {
      result.isValid = false;
    }

    return result;
  }

  private parseQuery(sql: string): ParsedQuery | null {
    const upper = sql.toUpperCase();
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;

    const clauseIndex = {
      select: 0,
      from: -1,
      groupBy: -1,
      having: -1,
      orderBy: -1,
    };

    for (let i = 0; i < upper.length; i++) {
      const char = upper[i];
      const next = upper[i + 1];

      if (!inSingle && !inDouble && !inBracket) {
        if (char === "'" && !inSingle) {
          inSingle = true;
        } else if (char === '"' && !inDouble) {
          inDouble = true;
        } else if (char === "[" && !inBracket) {
          inBracket = true;
        }
      } else if (inSingle && char === "'" && next === "'") {
        i++;
        continue;
      } else if (inSingle && char === "'") {
        inSingle = false;
      } else if (inDouble && char === '"' && next === '"') {
        i++;
        continue;
      } else if (inDouble && char === '"') {
        inDouble = false;
      } else if (inBracket && char === "]") {
        inBracket = false;
      }

      if (inSingle || inDouble || inBracket) {
        continue;
      }

      if (char === "(") {
        depth++;
        continue;
      }
      if (char === ")" && depth > 0) {
        depth--;
        continue;
      }

      if (depth !== 0) {
        continue;
      }

      if (
        clauseIndex.from === -1 &&
        this.matchesKeyword(upper, i, "FROM")
      ) {
        clauseIndex.from = i;
        i += 3;
        continue;
      }

      if (
        clauseIndex.groupBy === -1 &&
        this.matchesKeyword(upper, i, "GROUP BY")
      ) {
        clauseIndex.groupBy = i;
        i += 6;
        continue;
      }

      if (
        clauseIndex.having === -1 &&
        this.matchesKeyword(upper, i, "HAVING")
      ) {
        clauseIndex.having = i;
        i += 5;
        continue;
      }

      if (
        clauseIndex.orderBy === -1 &&
        this.matchesKeyword(upper, i, "ORDER BY")
      ) {
        clauseIndex.orderBy = i;
        break;
      }
    }

    if (clauseIndex.from === -1) {
      return {
        selectItems: this.parseSelectItems(sql),
        groupByExpressions: [],
        orderByItems: [],
      };
    }

    const selectClause = sql
      .slice(clauseIndex.select + 6, clauseIndex.from)
      .trim();
    const groupClause =
      clauseIndex.groupBy !== -1
        ? sql
            .slice(
              clauseIndex.groupBy + 8,
              clauseIndex.having !== -1
                ? clauseIndex.having
                : clauseIndex.orderBy !== -1
                ? clauseIndex.orderBy
                : sql.length
            )
            .trim()
        : "";
    const orderClause =
      clauseIndex.orderBy !== -1
        ? sql.slice(clauseIndex.orderBy + 8).trim()
        : "";

    return {
      selectItems: this.parseSelectItems(selectClause),
      groupByExpressions: this.parseGroupExpressions(groupClause),
      orderByItems: this.parseOrderExpressions(orderClause),
    };
  }

  private parseSelectItems(clause: string): SelectItem[] {
    if (!clause) {
      return [];
    }

    let normalized = clause.trim();
    normalized = normalized.replace(/^DISTINCT\s+/i, "");
    normalized = normalized.replace(/^ALL\s+/i, "");
    normalized = normalized.replace(/^TOP\s+\(?\s*\d+\s*\)?\s*/i, "");

    const parts = this.splitExpressions(normalized);
    return parts.map((part) => {
      const { expression, alias } = this.extractAlias(part);
      const normalizedExpression = this.normalizeExpression(expression);

      const item: SelectItem = {
        raw: part.trim(),
        alias,
        aliasKey: alias ? this.normalizeIdentifier(alias) : undefined,
        normalized: normalizedExpression,
        identifiers: this.extractIdentifiers(expression),
        isAggregate: this.isAggregateExpression(expression),
        isGrouped: false,
        isSimpleIdentifier: this.isSimpleIdentifier(expression),
      };

      return item;
    });
  }

  private parseGroupExpressions(clause: string): ParsedExpression[] {
    if (!clause) {
      return [];
    }
    const parts = this.splitExpressions(clause);
    return parts.map((raw) => ({
      raw: raw.trim(),
      normalized: this.normalizeExpression(raw),
      identifiers: this.extractIdentifiers(raw),
      isSimpleIdentifier: this.isSimpleIdentifier(raw),
    }));
  }

  private parseOrderExpressions(clause: string): OrderByItem[] {
    if (!clause) {
      return [];
    }

    const expressions = this.splitExpressions(clause.replace(/;+\s*$/, ""));
    return expressions.map((raw) => {
      const trimmed = raw.trim();
      const { expression, direction } = this.extractOrderDirection(trimmed);
      const normalized = this.normalizeExpression(expression);
      const isNumeric = /^\d+$/.test(expression.trim());
      const isSimpleIdentifier = this.isSimpleIdentifier(expression);
      const hasTableQualifier =
        isSimpleIdentifier && expression.includes(".");

      return {
        raw: trimmed,
        direction,
        usesNumericPosition: isNumeric,
        normalized,
        identifiers: this.extractIdentifiers(expression),
        isSimpleIdentifier,
        isAggregate: this.isAggregateExpression(expression),
        aliasKey:
          isSimpleIdentifier && !hasTableQualifier
            ? this.normalizeIdentifier(expression)
            : undefined,
      };
    });
  }

  private splitExpressions(clause: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;
    let current = "";

    for (let i = 0; i < clause.length; i++) {
      const char = clause[i];
      const next = clause[i + 1];

      if (!inDouble && !inBracket && char === "'" && next === "'") {
        current += "''";
        i++;
        continue;
      }
      if (!inSingle && !inBracket && char === '"' && next === '"') {
        current += '""';
        i++;
        continue;
      }

      if (!inDouble && !inBracket && char === "'" && !inSingle) {
        inSingle = true;
        current += char;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        current += char;
        continue;
      }

      if (!inSingle && !inBracket && char === '"' && !inDouble) {
        inDouble = true;
        current += char;
        continue;
      }
      if (inDouble && char === '"') {
        inDouble = false;
        current += char;
        continue;
      }

      if (!inSingle && !inDouble && char === "[" && !inBracket) {
        inBracket = true;
        current += char;
        continue;
      }
      if (inBracket && char === "]") {
        inBracket = false;
        current += char;
        continue;
      }

      if (inSingle || inDouble || inBracket) {
        current += char;
        continue;
      }

      if (char === "(") {
        depth++;
        current += char;
        continue;
      }
      if (char === ")" && depth > 0) {
        depth--;
        current += char;
        continue;
      }

      if (char === "," && depth === 0) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  private extractAlias(expression: string): {
    expression: string;
    alias?: string;
  } {
    const trimmed = expression.trim();
    const upper = trimmed.toUpperCase();

    // Look for explicit AS alias at top level
    const asIndex = this.findTopLevelKeyword(upper, "AS");
    if (asIndex !== -1) {
      const alias = trimmed.slice(asIndex + 2).trim();
      return {
        expression: trimmed.slice(0, asIndex).trim(),
        alias,
      };
    }

    // Implicit alias: look for trailing identifier
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;

    for (let i = trimmed.length - 1; i >= 0; i--) {
      const char = trimmed[i];
      const prev = trimmed[i - 1];

      if (!inDouble && !inBracket && char === "'" && prev === "'") {
        i--;
        continue;
      }
      if (!inSingle && !inBracket && char === '"' && prev === '"') {
        i--;
        continue;
      }

      if (!inDouble && !inBracket && char === "'" && !inSingle) {
        inSingle = true;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        continue;
      }

      if (!inSingle && !inBracket && char === '"' && !inDouble) {
        inDouble = true;
        continue;
      }
      if (inDouble && char === '"') {
        inDouble = false;
        continue;
      }

      if (!inSingle && !inDouble && char === "]" && !inBracket) {
        inBracket = true;
        continue;
      }
      if (inBracket && char === "[") {
        inBracket = false;
        continue;
      }

      if (inSingle || inDouble || inBracket) {
        continue;
      }

      if (char === ")") {
        depth++;
        continue;
      }
      if (char === "(" && depth > 0) {
        depth--;
        continue;
      }

      if (depth === 0 && /\s/.test(char)) {
        const aliasCandidate = trimmed.slice(i).trim();
        const expressionPart = trimmed.slice(0, i).trim();
        if (
          aliasCandidate &&
          /^[\[\]\w\.]+$/i.test(aliasCandidate) &&
          expressionPart
        ) {
          return {
            expression: expressionPart,
            alias: aliasCandidate,
          };
        }
        break;
      }
    }

    return {
      expression: trimmed,
    };
  }

  private extractOrderDirection(expression: string): {
    expression: string;
    direction?: "ASC" | "DESC";
  } {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;

    for (let i = expression.length - 1; i >= 0; i--) {
      const char = expression[i];
      const prev = expression[i - 1];

      if (!inDouble && !inBracket && char === "'" && prev === "'") {
        i--;
        continue;
      }
      if (!inSingle && !inBracket && char === '"' && prev === '"') {
        i--;
        continue;
      }

      if (!inDouble && !inBracket && char === "'" && !inSingle) {
        inSingle = true;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        continue;
      }

      if (!inSingle && !inBracket && char === '"' && !inDouble) {
        inDouble = true;
        continue;
      }
      if (inDouble && char === '"') {
        inDouble = false;
        continue;
      }

      if (!inSingle && !inDouble && char === "]" && !inBracket) {
        inBracket = true;
        continue;
      }
      if (inBracket && char === "[") {
        inBracket = false;
        continue;
      }

      if (inSingle || inDouble || inBracket) {
        continue;
      }

      if (char === ")") {
        depth++;
        continue;
      }
      if (char === "(" && depth > 0) {
        depth--;
        continue;
      }

      if (depth === 0 && /\s/.test(char)) {
        const candidate = expression.slice(i).trim().toUpperCase();
        if (candidate === "ASC" || candidate === "DESC") {
          return {
            expression: expression.slice(0, i).trim(),
            direction: candidate,
          };
        }
      }
    }

    return {
      expression: expression.trim(),
    };
  }

  private detectNestedAggregates(sql: string): string[] {
    const errors: string[] = [];
    const stripped = this.stripStringLiterals(sql);
    const upper = stripped.toUpperCase();

    let depth = 0;
    const pendingAggregates: string[] = [];
    const aggregateStack: { name: string; depth: number }[] = [];

    for (let i = 0; i < upper.length; i++) {
      const char = upper[i];
      const next = upper[i + 1];

      if (char === "'" && next === "'") {
        i++;
        continue;
      }

      const aggregate = AGGREGATE_FUNCTIONS.find((fn) =>
        this.matchesKeyword(upper, i, fn)
      );

      if (aggregate) {
        pendingAggregates.push(aggregate);
        i += aggregate.length - 1;
        continue;
      }

      if (char === "(") {
        depth++;
        if (pendingAggregates.length > 0) {
          const agg = pendingAggregates.pop()!;
          aggregateStack.push({ name: agg, depth });
          if (aggregateStack.length > 1) {
            const outer = aggregateStack[aggregateStack.length - 2];
            errors.push(
              `Nested aggregate detected: ${outer.name}(... ${agg}(...))`
            );
          }
        }
        continue;
      }

      if (char === ")" && depth > 0) {
        const top = aggregateStack[aggregateStack.length - 1];
        if (top && top.depth === depth) {
          aggregateStack.pop();
        }
        depth--;
      }
    }

    return errors;
  }

  private buildSuggestionForExpression(expression: string): string {
    return `Either add "${expression}" to the GROUP BY clause or wrap it with an aggregate such as MIN("${expression}") based on how you want the rows sorted.`;
  }

  private stripComments(sql: string): string {
    let result = "";
    let inLine = false;
    let inBlock = false;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const next = sql[i + 1];

      if (!inSingle && !inDouble && !inBracket) {
        if (!inBlock && !inLine && char === "-" && next === "-") {
          inLine = true;
          i++;
          continue;
        }
        if (!inBlock && !inLine && char === "/" && next === "*") {
          inBlock = true;
          i++;
          continue;
        }
      }

      if (inLine && (char === "\n" || char === "\r")) {
        inLine = false;
        result += char;
        continue;
      }
      if (inBlock && char === "*" && next === "/") {
        inBlock = false;
        i++;
        continue;
      }
      if (inLine || inBlock) {
        continue;
      }

      if (!inDouble && !inBracket && char === "'" && next === "'") {
        result += "''";
        i++;
        continue;
      }
      if (!inSingle && !inBracket && char === '"' && next === '"') {
        result += '""';
        i++;
        continue;
      }

      if (!inDouble && !inBracket && char === "'" && !inSingle) {
        inSingle = true;
        result += char;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        result += char;
        continue;
      }

      if (!inSingle && !inBracket && char === '"' && !inDouble) {
        inDouble = true;
        result += char;
        continue;
      }
      if (inDouble && char === '"') {
        inDouble = false;
        result += char;
        continue;
      }

      if (!inSingle && !inDouble && char === "[" && !inBracket) {
        inBracket = true;
        result += char;
        continue;
      }
      if (inBracket && char === "]") {
        inBracket = false;
        result += char;
        continue;
      }

      result += char;
    }

    return result;
  }

  private extractMainQuery(sql: string): string {
    const trimmed = sql.trim();
    if (!trimmed) {
      return "";
    }
    const upper = trimmed.toUpperCase();
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;

    for (let i = 0; i < upper.length; i++) {
      const char = upper[i];
      const next = upper[i + 1];

      if (!inDouble && !inBracket && char === "'" && next === "'") {
        i++;
        continue;
      }
      if (!inSingle && !inBracket && char === '"' && next === '"') {
        i++;
        continue;
      }

      if (!inDouble && !inBracket && char === "'" && !inSingle) {
        inSingle = true;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        continue;
      }

      if (!inSingle && !inBracket && char === '"' && !inDouble) {
        inDouble = true;
        continue;
      }
      if (inDouble && char === '"') {
        inDouble = false;
        continue;
      }

      if (!inSingle && !inDouble && char === "[" && !inBracket) {
        inBracket = true;
        continue;
      }
      if (inBracket && char === "]") {
        inBracket = false;
        continue;
      }

      if (inSingle || inDouble || inBracket) {
        continue;
      }

      if (char === "(") {
        depth++;
        continue;
      }
      if (char === ")" && depth > 0) {
        depth--;
        continue;
      }

      if (
        depth === 0 &&
        this.matchesKeyword(upper, i, "SELECT")
      ) {
        return trimmed.slice(i);
      }
    }

    return trimmed;
  }

  private stripStringLiterals(sql: string): string {
    let result = "";
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const next = sql[i + 1];

      if (!inDouble && char === "'" && next === "'") {
        i++;
        continue;
      }
      if (!inSingle && char === '"' && next === '"') {
        i++;
        continue;
      }

      if (!inDouble && char === "'" && !inSingle) {
        inSingle = true;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        continue;
      }

      if (!inSingle && char === '"' && !inDouble) {
        inDouble = true;
        continue;
      }
      if (inDouble && char === '"') {
        inDouble = false;
        continue;
      }

      if (!inSingle && !inDouble) {
        result += char;
      }
    }

    return result;
  }

  private extractIdentifiers(expression: string): IdentifierInfo[] {
    const withoutStrings = this.stripStringLiterals(expression);
    const normalizedExpr = this.stripIdentifierQuotes(withoutStrings);
    const matches =
      normalizedExpr.match(
        /\b[a-zA-Z_][\w]*\b(?:\s*\.\s*\b[a-zA-Z_][\w]*\b)?/g
      ) || [];

    const identifiers: IdentifierInfo[] = [];
    for (const match of matches) {
      const cleaned = match.trim();
      const lower = cleaned.toLowerCase();
      if (KEYWORDS.has(lower)) {
        continue;
      }

      identifiers.push({
        raw: cleaned,
        normalized: this.normalizeIdentifier(cleaned),
        columnOnly: this.extractColumnOnly(cleaned),
      });
    }

    return identifiers;
  }

  private isSimpleIdentifier(expression: string): boolean {
    const stripped = this.stripIdentifierQuotes(expression).trim();
    return /^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)?$/.test(stripped);
  }

  private isAggregateExpression(expression: string): boolean {
    const sanitized = this.stripStringLiterals(expression).toUpperCase();
    return AGGREGATE_FUNCTIONS.some((fn) =>
      sanitized.includes(`${fn}(`)
    );
  }

  private normalizeExpression(expression: string): string {
    let normalized = this.stripIdentifierQuotes(expression)
      .replace(/\s+/g, " ")
      .trim();

    while (normalized.startsWith("(") && normalized.endsWith(")")) {
      normalized = normalized.slice(1, -1).trim();
    }

    return normalized.toLowerCase();
  }

  private stripIdentifierQuotes(value: string): string {
    return value.replace(/[\[\]`"]/g, "");
  }

  private normalizeIdentifier(identifier: string): string {
    return this.stripIdentifierQuotes(identifier)
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  private extractColumnOnly(identifier: string): string {
    const cleaned = this.stripIdentifierQuotes(identifier)
      .split(".")
      .pop();
    return cleaned ? cleaned.trim().toLowerCase() : "";
  }

  private matchesKeyword(source: string, index: number, keyword: string) {
    if (index < 0) {
      return false;
    }
    const target = keyword.toUpperCase();
    if (source.slice(index, index + target.length) !== target) {
      return false;
    }
    const before = source[index - 1];
    const after = source[index + target.length];
    const beforeOk =
      before === undefined || /[\s,(]/.test(before);
    const afterOk =
      after === undefined || /[\s,);(]/.test(after);
    return beforeOk && afterOk;
  }

  private findTopLevelKeyword(source: string, keyword: string): number {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;
    const target = keyword.toUpperCase();

    for (let i = 0; i <= source.length - target.length; i++) {
      const char = source[i];
      const next = source[i + 1];

      if (!inDouble && !inBracket && char === "'" && next === "'") {
        i++;
        continue;
      }
      if (!inSingle && !inBracket && char === '"' && next === '"') {
        i++;
        continue;
      }

      if (!inDouble && !inBracket && char === "'" && !inSingle) {
        inSingle = true;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        continue;
      }

      if (!inSingle && !inBracket && char === '"' && !inDouble) {
        inDouble = true;
        continue;
      }
      if (inDouble && char === '"') {
        inDouble = false;
        continue;
      }

      if (!inSingle && !inDouble && char === "[" && !inBracket) {
        inBracket = true;
        continue;
      }
      if (inBracket && char === "]") {
        inBracket = false;
        continue;
      }

      if (inSingle || inDouble || inBracket) {
        continue;
      }

      if (char === "(") {
        depth++;
        continue;
      }
      if (char === ")" && depth > 0) {
        depth--;
        continue;
      }

      if (depth === 0 && this.matchesKeyword(source, i, target.trim())) {
        return i;
      }
    }

    return -1;
  }
}

let validatorInstance: SQLValidator | null = null;

export function getSQLValidator(): SQLValidator {
  if (!validatorInstance) {
    validatorInstance = new SQLValidator();
  }
  return validatorInstance;
}

export function resetSQLValidator(): void {
  validatorInstance = null;
}

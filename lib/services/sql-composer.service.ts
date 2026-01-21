import type { BaseProvider } from "@/lib/ai/providers/base-provider";

export interface ComposedQuery {
  sql: string;
  strategy: "cte" | "merged_where" | "fresh";
  isBuildingOnPrevious: boolean;
  reasoning?: string;
}

export interface CompositionDecision {
  shouldCompose: boolean;
  reasoning: string;
  confidence: number;
}

export class SqlComposerService {
  /**
   * Use AI to determine if current question builds on previous query.
   */
  async shouldComposeQuery(
    currentQuestion: string,
    previousQuestion: string,
    previousSql: string,
    provider: BaseProvider
  ): Promise<CompositionDecision> {
    const prompt = this.buildCompositionDecisionPrompt(
      previousQuestion,
      currentQuestion,
      previousSql
    );

    try {
      const response = await provider.complete({
        system: this.getCompositionDecisionSystemPrompt(),
        userMessage: prompt,
        temperature: 0.0,
      });

      return this.parseCompositionDecision(response);
    } catch (error) {
      const errorContext = {
        previousQuestion: previousQuestion.slice(0, 100),
        currentQuestion: currentQuestion.slice(0, 100),
        error: error instanceof Error ? error.message : String(error),
      };
      console.error(
        "[SqlComposerService] Failed to determine composition:",
        errorContext
      );
      return {
        shouldCompose: false,
        reasoning:
          "Error determining relationship; generating fresh query for safety",
        confidence: 0.0,
      };
    }
  }

  private buildCompositionDecisionPrompt(
    previousQuestion: string,
    currentQuestion: string,
    previousSql: string
  ): string {
    return `
You are analyzing a conversation about healthcare data to determine query relationships.

**Previous question:** "${previousQuestion}"

**Previous SQL:**
\`\`\`sql
${previousSql}
\`\`\`

**Current question:** "${currentQuestion}"

**Task:** Determine if the current question BUILDS ON the previous question's results, or is an INDEPENDENT question.

**BUILDS ON (shouldCompose: true):**
- Filtering previous results: "Show female patients" → "Which ones are older than 40?"
- Aggregating previous results: "Show patients with wounds" → "What's their average age?"
- Refining previous query: "List all assessments" → "Only show from last month"
- Using pronouns referencing previous: "Show patients" → "Which ones have diabetes?"

**INDEPENDENT (shouldCompose: false):**
- Different subset of same entity: "Show female patients" → "Show male patients"
- Completely different entity: "How many patients?" → "How many clinics?"
- Different time period (new analysis): "Show Q1 data" → "Show Q2 data"
- Parallel question (not building): "Count active wounds" → "Count healed wounds"

Return JSON with your analysis:
{
  "shouldCompose": boolean,
  "reasoning": "brief explanation of why you chose this",
  "confidence": number between 0.0 and 1.0
}
`;
  }

  private getCompositionDecisionSystemPrompt(): string {
    return `You are a SQL query relationship analyzer for healthcare data conversations.

Your task is to determine if a current question builds upon (filters/aggregates/refines) previous query results, 
or is an independent question requiring fresh data retrieval.

Key principles:
- Questions with pronouns (which ones, those, they) almost always build on previous
- Questions with vague aggregations (what's the average?, how many?) without entity names likely build on previous
- Questions with explicit entity names (show male patients, count clinics) are usually independent
- Time period shifts without pronouns are usually independent (Q1 → Q2)

Return ONLY a valid JSON object. No markdown, no explanations outside JSON.`;
  }

  private parseCompositionDecision(response: string): CompositionDecision {
    let parsed: any;

    try {
      // First, try to clean markdown wrapper if present (e.g., ```json ... ```)
      const cleaned = response
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "");

      // Try parsing cleaned response directly
      parsed = JSON.parse(cleaned.trim());
      return this.validateCompositionDecision(parsed);
    } catch {
      // Fallback: extract JSON object (handles cases with surrounding text)
      const jsonMatch = response.match(/\{[\s\S]*?\}\s*(?=[,\]}]|$)/);
      if (!jsonMatch) {
        throw new Error(
          "No valid JSON object found in composition decision response"
        );
      }

      try {
        parsed = JSON.parse(jsonMatch[0]);
        return this.validateCompositionDecision(parsed);
      } catch (parseError) {
        throw new Error(
          `Failed to parse composition decision JSON: ${parseError instanceof Error ? parseError.message : "unknown error"}`
        );
      }
    }
  }

  private validateCompositionDecision(
    parsed: any
  ): CompositionDecision {
    if (typeof parsed.shouldCompose !== "boolean") {
      throw new Error(
        "Invalid composition decision: missing shouldCompose boolean"
      );
    }

    return {
      shouldCompose: parsed.shouldCompose,
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: parsed.confidence || 1.0,
    };
  }

  /**
   * Compose SQL that builds on previous query.
   * Returns composed query with validation to ensure safety constraints are met.
   */
  async composeQuery(
    previousSql: string,
    previousQuestion: string,
    currentQuestion: string,
    provider: BaseProvider
  ): Promise<ComposedQuery> {
    const prompt = this.buildCompositionPrompt(
      previousSql,
      previousQuestion,
      currentQuestion
    );

    const response = await provider.complete({
      system: this.getCompositionSystemPrompt(),
      userMessage: prompt,
      temperature: 0.1,
    });

    const composed = this.parseCompositionResponse(response);

    // Validate composed SQL before returning
    const validation = this.validateComposedSql(composed.sql);
    if (!validation.valid) {
      const errorMsg = `Composed SQL failed safety validation: ${validation.errors.join("; ")}`;
      console.error("[SqlComposerService]", errorMsg);
      throw new Error(errorMsg);
    }

    return composed;
  }

  private buildCompositionPrompt(
    previousSql: string,
    previousQuestion: string,
    currentQuestion: string
  ): string {
    return `
Previous question: "${previousQuestion}"
Previous SQL:
\`\`\`sql
${previousSql}
\`\`\`

Current question: "${currentQuestion}"

Task: Generate SQL that builds on the previous query.

**Composition Strategies:**

1. **CTE Composition** (preferred): Wrap previous query in CTE
   Example:
   WITH previous_result AS (
     ${previousSql}
   )
   SELECT * FROM previous_result WHERE <additional_filters>

2. **Merged WHERE**: Add to existing WHERE clause
   Use when previous query can be extended simply

3. **Fresh Query**: Generate new SQL if unrelated

Return JSON:
{
  "strategy": "cte" | "merged_where" | "fresh",
  "sql": "...",
  "reasoning": "why this strategy was chosen"
}
`;
  }

  private getCompositionSystemPrompt(): string {
    return `You are a SQL query composer for healthcare data analysis.

Your task is to generate SQL that builds upon previous queries in a conversation.

**Context Carryover Rules:**

1. When user says "which ones", "those", "they":
   → Build on previous query using CTE
   
2. When user asks aggregation on previous results:
   → Wrap previous query, then aggregate
   
3. When user asks completely different question:
   → Generate fresh SQL (ignore previous)

4. Efficiency rules:
   → Don't nest CTEs more than 3 levels
   → If composition gets complex, merge WHERE clauses instead
   → Never use temp tables or result storage

**Privacy Requirements:**
- NEVER suggest storing query results
- NEVER suggest CREATE TEMP TABLE
- Always use CTEs for composition

**Output Format:**
Return ONLY the JSON object. No markdown, no explanation outside the JSON.
`;
  }

  private parseCompositionResponse(response: string): ComposedQuery {
    let parsed: any;

    try {
      // First, try to clean markdown wrapper if present
      const cleaned = response
        .replace(/^```(?:sql|json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "");

      // Try parsing cleaned response directly
      parsed = JSON.parse(cleaned.trim());
    } catch {
      // Fallback: extract JSON object
      const jsonMatch = response.match(/\{[\s\S]*?\}\s*(?=[,\]}]|$)/);
      if (!jsonMatch) {
        throw new Error("Invalid composition response: no valid JSON found");
      }

      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        throw new Error(
          `Failed to parse composition response JSON: ${parseError instanceof Error ? parseError.message : "unknown error"}`
        );
      }
    }

    if (
      !parsed.sql ||
      typeof parsed.sql !== "string" ||
      !["cte", "merged_where", "fresh"].includes(parsed.strategy)
    ) {
      throw new Error(
        "Invalid composition response: missing or invalid sql/strategy"
      );
    }

    return {
      sql: parsed.sql,
      strategy: parsed.strategy,
      isBuildingOnPrevious: parsed.strategy !== "fresh",
      reasoning: parsed.reasoning || "No reasoning provided",
    };
  }

  /**
   * Validate composed SQL for safety constraints.
   * Checks for forbidden patterns (temp tables) and composition limits (CTE depth).
   */
  validateComposedSql(sql: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (/CREATE\s+TEMP/i.test(sql)) {
      errors.push("Temporary tables are not allowed");
    }

    if (/INTO\s+TEMP/i.test(sql)) {
      errors.push("Cannot insert into temporary tables");
    }

    // Count top-level CTEs (not nested in subqueries)
    const cteChainCount = this.countTopLevelCtes(sql);
    if (cteChainCount > 3) {
      errors.push(
        `Too many CTEs in chain (${cteChainCount}, max 3). ` +
          `Consider simplifying or using merged WHERE clauses instead.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Count top-level CTEs in a WITH clause chain.
   * Example: WITH a AS (...), b AS (...), c AS (...) SELECT ... → returns 3
   */
  private countTopLevelCtes(sql: string): number {
    const trimmed = sql.trim();

    // Must start with WITH
    if (!trimmed.match(/^\s*WITH\s+/i)) {
      return 0;
    }

    // Split into words and track depth
    let depth = 0;
    let cteCount = 0;
    let seenSelectAtDepthZero = false;

    // Simple state machine: count "name AS (" at depth 0
    const words = trimmed.split(/(\s+|\(|\)|,)/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i].trim().toUpperCase();

      // Track parenthesis depth
      depth += (words[i].match(/\(/g) || []).length;
      depth -= (words[i].match(/\)/g) || []).length;

      // At depth 0, "SELECT" marks end of CTE list
      if (word === "SELECT" && depth === 0) {
        seenSelectAtDepthZero = true;
        break;
      }

      // At depth 0, commas separate CTEs
      if (words[i].includes(",") && depth === 0 && !seenSelectAtDepthZero) {
        cteCount++;
      }
    }

    // If we started with WITH and found at least one CTE, return count + 1
    if (trimmed.match(/^\s*WITH\s+/i)) {
      return cteCount + 1;
    }

    return 0;
  }
}

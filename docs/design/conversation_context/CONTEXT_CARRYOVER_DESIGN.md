# Conversation Context Carryover - Implementation Design

**Version:** 2.0  
**Last Updated:** 2026-01-14  
**Parent Document:** `CONVERSATION_UI_REDESIGN.md`  
**Related:** `auditing-improvement-todo.md`  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [AI Vendor Native Context](#ai-vendor-native-context)
3. [SQL Query Composition Strategy](#sql-query-composition-strategy)
4. [Save Insight Integration](#save-insight-integration)
5. [Audit Trail Integration](#audit-trail-integration)
6. [Implementation Guide](#implementation-guide)

---

## Executive Summary

### Design Principles

1. ✅ **Use AI vendor native context** (Claude prompt caching, Gemini context caching)
2. ✅ **No result storage in database** (privacy + size concerns)
3. ✅ **Compound SQL approach** (build on previous queries)
4. ✅ **Last SQL matters** for Save Insight
5. ✅ **Full audit trail** integrated with existing system

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Claude Prompt Caching** | 90% cost reduction, native support |
| **Gemini Context Caching** | Similar benefits, official API |
| **CTE-based SQL composition** | Clean, efficient, no temp tables |
| **Save last SQL only** | User intent = final query |
| **Extend QueryHistory** | Track conversation lineage |

---

## AI Vendor Native Context

### Strategy 1: Claude with Prompt Caching

Claude Sonnet 3.5/3.7 supports prompt caching for repeated context.

#### Implementation

```typescript
// lib/ai/providers/claude-provider.ts

import Anthropic from "@anthropic-ai/sdk";

export class ClaudeProvider extends BaseProvider {
  private anthropic: Anthropic;

  async completeWithConversation(
    messages: ConversationMessage[],
    currentQuestion: string
  ): Promise<string> {
    // Build system prompt with caching
    const systemPrompt = [
      {
        type: "text" as const,
        text: this.buildSchemaContext(),  // Database schema
        cache_control: { type: "ephemeral" as const }  // ← Cache this
      },
      {
        type: "text" as const,
        text: this.buildOntologyContext(), // Ontology definitions
        cache_control: { type: "ephemeral" as const }  // ← Cache this
      },
      {
        type: "text" as const,
        text: this.buildInstructionsPrompt(), // SQL generation rules
        cache_control: { type: "ephemeral" as const }  // ← Cache this
      }
    ];

    // Build conversation history (NOT cached - changes each time)
    const conversationPrompt = this.buildConversationHistory(messages);

    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: conversationPrompt + "\n\nCurrent question: " + currentQuestion
        }
      ]
    });

    return response.content[0].text;
  }

  /**
   * Build conversation history with SQL context (not result data!)
   */
  private buildConversationHistory(
    messages: ConversationMessage[]
  ): string {
    let history = "Previous conversation:\n\n";

    // Only include last 5 messages to control token usage
    const recent = messages.slice(-5);

    for (const msg of recent) {
      if (msg.role === "user") {
        history += `User: "${msg.content}"\n`;
      } else if (msg.role === "assistant") {
        const meta = msg.metadata;
        
        // Include SQL query (not results!)
        if (meta.sql) {
          history += `Assistant: Generated SQL query:\n`;
          history += `\`\`\`sql\n${meta.sql}\n\`\`\`\n`;
          history += `Returned ${meta.resultSummary?.rowCount || 0} records.\n`;
          history += `Columns: ${meta.resultSummary?.columns.join(", ")}\n\n`;
        }
      }
    }

    return history;
  }

  /**
   * Token usage with caching:
   * - First message: Full tokens (schema + ontology + instructions)
   * - Subsequent: Only conversation history tokens
   * - Savings: 90% on cached content
   */
}
```

**Token Usage Example:**

```
Message 1:
- System (cached): 5000 tokens → Write: 5000, Read: 0
- Conversation: 200 tokens
- Total: 5200 tokens

Message 2:
- System (cached): 5000 tokens → Write: 0, Read: 5000 (90% discount)
- Conversation: 400 tokens (more history)
- Total: 500 tokens (90% cached)

Message 3:
- System (cached): 5000 tokens → Write: 0, Read: 5000 (90% discount)
- Conversation: 600 tokens
- Total: 600 tokens (90% cached)

10-message conversation:
- Total: 5200 + (9 × ~600) = ~10,600 tokens
- Cost: ~$0.11 (vs $1.06 without caching)
- Savings: 90%
```

### Strategy 2: Gemini with Context Caching

Gemini 2.0/2.5 Pro supports context caching via `cachedContent` API.

#### Implementation

```typescript
// lib/ai/providers/gemini-provider.ts

import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiProvider extends BaseProvider {
  private genAI: GoogleGenerativeAI;

  async completeWithConversation(
    messages: ConversationMessage[],
    currentQuestion: string
  ): Promise<string> {
    // Create or retrieve cached content
    const cacheKey = this.getCacheKey(); // Based on schema version
    
    let cachedContent = await this.getCachedContent(cacheKey);
    
    if (!cachedContent) {
      // First time: Create cached content
      cachedContent = await this.genAI.cacheManager.create({
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: this.buildSchemaContext() },
              { text: this.buildOntologyContext() },
              { text: this.buildInstructionsPrompt() }
            ]
          }
        ],
        ttlSeconds: 3600,  // Cache for 1 hour
        displayName: `schema-${cacheKey}`
      });
      
      await this.storeCacheReference(cacheKey, cachedContent.name);
    }

    // Use cached content as base
    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      cachedContent: cachedContent.name
    });

    // Build conversation prompt
    const conversationPrompt = this.buildConversationHistory(messages);
    const fullPrompt = conversationPrompt + "\n\nCurrent question: " + currentQuestion;

    const result = await model.generateContent(fullPrompt);
    return result.response.text();
  }

  /**
   * Cache management:
   * - Cache TTL: 1 hour (refresh if schema changes)
   * - Store cache reference in Redis with schema version
   * - Invalidate when ontology/schema updates
   */
  private async getCachedContent(cacheKey: string) {
    const cacheName = await redis.get(`gemini:cache:${cacheKey}`);
    if (!cacheName) return null;

    try {
      return await this.genAI.cacheManager.get(cacheName);
    } catch (error) {
      // Cache expired or invalid
      await redis.del(`gemini:cache:${cacheKey}`);
      return null;
    }
  }

  private getCacheKey(): string {
    // Include schema version and ontology version
    return `${process.env.SCHEMA_VERSION || 'v1'}_${process.env.ONTOLOGY_VERSION || 'v1'}`;
  }
}
```

**Token Usage Example:**

```
Similar to Claude:
- First message: Full context stored in cache
- Subsequent: Reference cached content (free read access)
- Conversation history: Only incremental tokens

10-message conversation:
- Total: ~8,000 tokens (vs ~35,000 without caching)
- Cost: ~$0.08 (vs $0.35 without caching)
- Savings: 77%
```

---

## SQL Query Composition Strategy

### ❌ What We DON'T Do

```sql
-- DON'T: Store results in temp tables
CREATE TEMP TABLE previous_result AS
SELECT * FROM Patient WHERE gender = 'Female';  -- Privacy issue!

SELECT * FROM previous_result WHERE age > 40;   -- Depends on temp table
```

**Problems:**
- Privacy: Patient data in temp storage
- Size: What if query returns 10,000 rows?
- Staleness: What if new data added?
- Cleanup: Who deletes temp tables?

### ✅ What We DO: CTE Composition

```sql
-- DO: Use CTEs to compose queries
WITH previous_query AS (
  SELECT * FROM Patient WHERE gender = 'Female'
)
SELECT * FROM previous_query WHERE age > 40;
```

**Benefits:**
- ✅ No data storage (CTE is just query composition)
- ✅ Always fresh (re-executed each time)
- ✅ Efficient (database optimizes)
- ✅ Clean (single SQL statement)

### Implementation: SQL Composer Service

```typescript
// lib/services/sql-composer.service.ts

export class SqlComposerService {
  
  /**
   * Compose follow-up query on top of previous query
   */
  composeSql(
    previousSql: string,
    followUpConstraints: string
  ): string {
    // Extract the main query from previous SQL
    const cleanedPreviousSql = this.removeTrailingSemicolon(previousSql);

    // Wrap previous query in CTE
    const composedSql = `
-- Base query from previous question
WITH previous_result AS (
  ${cleanedPreviousSql}
)
-- Follow-up filter
SELECT * FROM previous_result
WHERE ${followUpConstraints}
`.trim();

    return composedSql;
  }

  /**
   * Alternative: Merge WHERE clauses (simpler but less flexible)
   */
  mergeWhereClause(
    previousSql: string,
    additionalWhere: string
  ): string {
    // Find WHERE clause in previous SQL
    const whereMatch = previousSql.match(/WHERE\s+(.+?)(?:ORDER BY|GROUP BY|$)/is);
    
    if (whereMatch) {
      // Add to existing WHERE
      return previousSql.replace(
        whereMatch[0],
        `WHERE (${whereMatch[1]}) AND (${additionalWhere})`
      );
    } else {
      // Add new WHERE before ORDER BY or at end
      if (previousSql.includes("ORDER BY")) {
        return previousSql.replace(
          /ORDER BY/i,
          `WHERE ${additionalWhere}\nORDER BY`
        );
      } else {
        return previousSql + `\nWHERE ${additionalWhere}`;
      }
    }
  }

  /**
   * Smart composition: Let LLM decide strategy
   */
  async composeWithAI(
    previousSql: string,
    previousQuestion: string,
    currentQuestion: string,
    provider: BaseProvider
  ): Promise<string> {
    const prompt = `
Previous question: "${previousQuestion}"
Previous SQL:
\`\`\`sql
${previousSql}
\`\`\`

Current question: "${currentQuestion}"

Task: Generate SQL that builds on the previous query.

Options:
1. If filtering previous results: Use CTE composition
2. If completely different query: Generate fresh SQL
3. If adding aggregation: Wrap previous in subquery

Return ONLY the SQL, no explanation.
`;

    const response = await provider.complete({
      system: this.buildCompositionInstructions(),
      userMessage: prompt,
      temperature: 0.1  // Low temperature for deterministic SQL
    });

    return this.extractSql(response);
  }

  /**
   * Example outputs:
   * 
   * Q1: "Show female patients"
   * SQL1: SELECT * FROM Patient WHERE gender = 'Female'
   * 
   * Q2: "Which ones are older than 40?"
   * SQL2: WITH previous_result AS (
   *         SELECT * FROM Patient WHERE gender = 'Female'
   *       )
   *       SELECT * FROM previous_result WHERE age > 40
   * 
   * Q3: "Show their average age by clinic"
   * SQL3: WITH previous_result AS (
   *         WITH base AS (
   *           SELECT * FROM Patient WHERE gender = 'Female'
   *         )
   *         SELECT * FROM base WHERE age > 40
   *       )
   *       SELECT clinicId, AVG(age) as avg_age
   *       FROM previous_result
   *       GROUP BY clinicId
   */
}
```

### Enhanced LLM Prompt for SQL Composition

```typescript
// lib/prompts/sql-composition.prompt.ts

export const SQL_COMPOSITION_PROMPT = `
You are a SQL query composer. Your task is to generate SQL that builds upon previous queries in a conversation.

# Context Carryover Rules

1. **When user says "which ones", "those", "they":**
   - Build on the previous query using CTE
   - Example:
     Previous: SELECT * FROM Patient WHERE infected = 1
     Current: "Which ones are improving?"
     Output: WITH previous AS (SELECT * FROM Patient WHERE infected = 1)
             SELECT * FROM previous WHERE areaReduction > 0.25

2. **When user asks aggregation on previous results:**
   - Wrap previous query, then aggregate
   - Example:
     Previous: SELECT * FROM Patient WHERE age > 40
     Current: "Show average wound size"
     Output: WITH previous AS (SELECT * FROM Patient WHERE age > 40)
             SELECT AVG(w.area) FROM previous p
             JOIN Wound w ON p.id = w.patientId

3. **When user asks completely different question:**
   - Generate fresh SQL (ignore previous)
   - Example:
     Previous: SELECT * FROM Patient WHERE gender = 'F'
     Current: "How many clinics do we have?"
     Output: SELECT COUNT(*) FROM Clinic

4. **Efficiency rules:**
   - Don't nest CTEs more than 3 levels deep
   - If composition gets complex, merge WHERE clauses instead
   - Example (merged):
     Instead of: WITH a AS (...) WITH b AS (SELECT * FROM a WHERE ...) SELECT * FROM b WHERE ...
     Do: SELECT * FROM Patient WHERE (condition1) AND (condition2) AND (condition3)

# Output Format

Return ONLY the SQL query. No markdown, no explanation.

# Examples

Example 1 - Filter refinement:
Previous Q: "Show patients with wounds"
Previous SQL: SELECT * FROM Patient WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = Patient.id)
Current Q: "Which ones have infections?"
Output SQL:
WITH previous_result AS (
  SELECT * FROM Patient WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = Patient.id)
)
SELECT * FROM previous_result
WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = previous_result.id AND infected = 1)

Example 2 - Aggregation on previous:
Previous Q: "Show female patients"
Previous SQL: SELECT * FROM Patient WHERE gender = 'Female'
Current Q: "What's their average age?"
Output SQL:
WITH previous_result AS (
  SELECT * FROM Patient WHERE gender = 'Female'
)
SELECT AVG(age) as average_age FROM previous_result

Example 3 - Fresh query:
Previous Q: "Show patients older than 60"
Previous SQL: SELECT * FROM Patient WHERE age > 60
Current Q: "How many clinics are there?"
Output SQL:
SELECT COUNT(*) as clinic_count FROM Clinic
`;
```

---

## Save Insight Integration

### Design: Save Only Final Composed SQL

```typescript
// lib/services/save-insight.service.ts

export class SaveInsightService {
  
  async saveFromConversation(
    threadId: string,
    messageId: string,  // The message user clicked "Save" on
    customerId: string,
    userId: number
  ): Promise<SavedInsight> {
    // Load the specific message
    const message = await this.loadMessage(messageId);
    
    if (!message.metadata?.sql) {
      throw new Error("No SQL found for this message");
    }

    // The SQL in this message is ALREADY composed
    // It includes all previous context via CTEs
    const finalSql = message.metadata.sql;

    // Generate meaningful title from conversation
    const title = await this.generateTitle(threadId, messageId);

    // Save with conversation metadata
    const insight = await pool.query(`
      INSERT INTO "SavedInsights" 
      (title, sql, customerId, userId, executionMode, conversationThreadId, conversationMessageId)
      VALUES ($1, $2, $3, $4, 'contextual', $5, $6)
      RETURNING *
    `, [title, finalSql, customerId, userId, threadId, messageId]);

    return insight.rows[0];
  }

  /**
   * Generate title from conversation context
   */
  private async generateTitle(
    threadId: string,
    messageId: string
  ): Promise<string> {
    // Load conversation up to this message
    const messages = await pool.query(`
      SELECT content, role 
      FROM "ConversationMessages" 
      WHERE "threadId" = $1 
        AND "createdAt" <= (SELECT "createdAt" FROM "ConversationMessages" WHERE id = $2)
      ORDER BY "createdAt" ASC
    `, [threadId, messageId]);

    // Build title from progression
    const userQuestions = messages.rows
      .filter(m => m.role === 'user')
      .map(m => m.content);

    if (userQuestions.length === 1) {
      return userQuestions[0].slice(0, 100);
    }

    // Multiple questions: show progression
    return `${userQuestions[0].slice(0, 40)} → ${userQuestions[userQuestions.length - 1].slice(0, 40)}`;
  }
}
```

### Example: Save Insight from Conversation

```typescript
// Conversation:
// Q1: "Show female patients"
//     SQL1: SELECT * FROM Patient WHERE gender = 'Female'
//     Result: 150 patients

// Q2: "Which ones are older than 40?"
//     SQL2: WITH previous AS (
//             SELECT * FROM Patient WHERE gender = 'Female'
//           )
//           SELECT * FROM previous WHERE age > 40
//     Result: 63 patients

// User clicks "Save" on Q2 result

// Saved Insight:
{
  title: "Show female patients → Which ones are older than 40?",
  sql: `WITH previous AS (
          SELECT * FROM Patient WHERE gender = 'Female'
        )
        SELECT * FROM previous WHERE age > 40`,
  executionMode: "contextual",
  conversationThreadId: "thread-uuid",
  conversationMessageId: "message-uuid"
}

// When re-run on dashboard:
// Executes the FULL composed SQL (no context needed!)
// Returns same results: 63 female patients older than 40
```

### Display on Dashboard

```typescript
// app/dashboard/components/InsightCard.tsx

export function InsightCard({ insight }: { insight: SavedInsight }) {
  const isFromConversation = insight.executionMode === "contextual";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{insight.title}</CardTitle>
        {isFromConversation && (
          <Badge variant="secondary">
            From Conversation
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {/* SQL preview with CTE highlighting */}
        <SqlPreview sql={insight.sql} highlightCtes />
        
        {isFromConversation && (
          <Button 
            variant="link" 
            onClick={() => viewConversation(insight.conversationThreadId)}
          >
            View Original Conversation →
          </Button>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={() => runInsight(insight.id)}>
          Run Query
        </Button>
      </CardFooter>
    </Card>
  );
}
```

---

## Audit Trail Integration

### Extended Database Schema

```sql
-- Add conversation tracking to QueryHistory
ALTER TABLE "QueryHistory"
ADD COLUMN "conversationThreadId" UUID REFERENCES "ConversationThreads"(id),
ADD COLUMN "conversationMessageId" UUID REFERENCES "ConversationMessages"(id),
ADD COLUMN "isComposedQuery" BOOLEAN DEFAULT false,
ADD COLUMN "compositionStrategy" VARCHAR(50),  -- 'cte', 'merged_where', 'fresh'
ADD COLUMN "parentQueryId" INTEGER REFERENCES "QueryHistory"(id);

-- Index for conversation lineage
CREATE INDEX IF NOT EXISTS idx_query_history_conversation
ON "QueryHistory" ("conversationThreadId", "createdAt");

CREATE INDEX IF NOT EXISTS idx_query_history_parent
ON "QueryHistory" ("parentQueryId", "createdAt");

COMMENT ON COLUMN "QueryHistory"."isComposedQuery" IS 'True if SQL builds on previous query';
COMMENT ON COLUMN "QueryHistory"."parentQueryId" IS 'References previous query in conversation chain';
```

### Audit Logging Integration

```typescript
// lib/services/conversation-audit.service.ts

export class ConversationAuditService {
  
  /**
   * Log query with conversation context
   */
  async logConversationQuery(params: {
    threadId: string;
    messageId: string;
    question: string;
    sql: string;
    customerId: string;
    userId: number;
    parentQueryHistoryId?: number;
    compositionStrategy: 'cte' | 'merged_where' | 'fresh';
    resultCount: number;
    executionTimeMs: number;
  }): Promise<number> {
    const result = await pool.query(`
      INSERT INTO "QueryHistory" 
      (
        question,
        sql,
        customerId,
        userId,
        conversationThreadId,
        conversationMessageId,
        isComposedQuery,
        compositionStrategy,
        parentQueryId,
        resultCount,
        executionTimeMs,
        mode,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'conversation', 'success')
      RETURNING id
    `, [
      params.question,
      params.sql,
      params.customerId,
      params.userId,
      params.threadId,
      params.messageId,
      params.parentQueryHistoryId !== null,
      params.compositionStrategy,
      params.parentQueryHistoryId || null,
      params.resultCount,
      params.executionTimeMs
    ]);

    return result.rows[0].id;
  }

  /**
   * Get conversation query lineage
   */
  async getConversationLineage(
    threadId: string
  ): Promise<QueryLineage[]> {
    const result = await pool.query(`
      WITH RECURSIVE lineage AS (
        -- Base case: all queries in this thread
        SELECT 
          id,
          question,
          sql,
          parentQueryId,
          compositionStrategy,
          createdAt,
          1 as depth
        FROM "QueryHistory"
        WHERE "conversationThreadId" = $1
          AND parentQueryId IS NULL
        
        UNION ALL
        
        -- Recursive case: child queries
        SELECT 
          q.id,
          q.question,
          q.sql,
          q.parentQueryId,
          q.compositionStrategy,
          q.createdAt,
          l.depth + 1
        FROM "QueryHistory" q
        INNER JOIN lineage l ON q.parentQueryId = l.id
      )
      SELECT * FROM lineage ORDER BY depth, createdAt
    `, [threadId]);

    return result.rows;
  }

  /**
   * Metrics: Conversation effectiveness
   */
  async getConversationMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<ConversationMetrics> {
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT "conversationThreadId") as total_conversations,
        AVG(query_count) as avg_questions_per_conversation,
        AVG(composition_rate) as avg_composition_rate
      FROM (
        SELECT 
          "conversationThreadId",
          COUNT(*) as query_count,
          SUM(CASE WHEN "isComposedQuery" THEN 1 ELSE 0 END)::float / COUNT(*) as composition_rate
        FROM "QueryHistory"
        WHERE "conversationThreadId" IS NOT NULL
          AND "createdAt" BETWEEN $1 AND $2
        GROUP BY "conversationThreadId"
      ) thread_stats
    `, [startDate, endDate]);

    return result.rows[0];
  }
}
```

### Admin Dashboard Integration

```typescript
// app/api/admin/audit/conversations/route.ts

export async function GET(req: NextRequest) {
  // Extend existing audit dashboard with conversation view
  
  const searchParams = req.nextUrl.searchParams;
  const threadId = searchParams.get("threadId");

  if (threadId) {
    // Show lineage for specific conversation
    const lineage = await conversationAuditService.getConversationLineage(threadId);
    
    return NextResponse.json({
      thread: lineage,
      visualization: buildLineageVisualization(lineage)
    });
  }

  // List all conversations with metrics
  const conversations = await pool.query(`
    SELECT 
      ct.id,
      ct.title,
      ct."customerId",
      c."customerName",
      COUNT(qh.id) as query_count,
      SUM(CASE WHEN qh."isComposedQuery" THEN 1 ELSE 0 END) as composed_count,
      MIN(qh."createdAt") as started_at,
      MAX(qh."createdAt") as last_query_at,
      SUM(qh."executionTimeMs") as total_execution_time_ms
    FROM "ConversationThreads" ct
    LEFT JOIN "QueryHistory" qh ON qh."conversationThreadId" = ct.id
    LEFT JOIN "Customer" c ON ct."customerId" = c.id
    WHERE ct."isActive" = true
    GROUP BY ct.id, c."customerName"
    ORDER BY last_query_at DESC
    LIMIT 50
  `);

  return NextResponse.json({
    conversations: conversations.rows
  });
}
```

### Visualization Example

```
Admin Dashboard > Audit > Conversation Detail

Conversation: "Female patients analysis"
Thread ID: abc-123-def
Customer: ABC Clinic
Duration: 3 minutes
Total Queries: 3

Query Flow:
┌─────────────────────────────────────────┐
│ Q1: "Show female patients"              │
│ Strategy: Fresh                         │
│ SQL: SELECT * FROM Patient              │
│      WHERE gender = 'Female'            │
│ Results: 150 patients                   │
│ Time: 1.2s                              │
└─────────────────────────────────────────┘
              ↓ (CTE composition)
┌─────────────────────────────────────────┐
│ Q2: "Which ones are older than 40?"     │
│ Strategy: CTE                           │
│ SQL: WITH previous AS (...)             │
│      SELECT * FROM previous             │
│      WHERE age > 40                     │
│ Results: 63 patients                    │
│ Time: 0.8s                              │
└─────────────────────────────────────────┘
              ↓ (CTE composition)
┌─────────────────────────────────────────┐
│ Q3: "Show average wound size"           │
│ Strategy: CTE                           │
│ SQL: WITH previous AS (...)             │
│      SELECT AVG(w.area)                 │
│      FROM previous p                    │
│      JOIN Wound w ON ...                │
│ Results: 1 row (avg = 12.5 cm²)        │
│ Time: 0.5s                              │
│ [Saved as Insight] ✓                    │
└─────────────────────────────────────────┘

Metrics:
- Composition Rate: 67% (2/3 queries built on previous)
- Avg Query Time: 0.83s
- Total Execution Time: 2.5s
- Context Carryover Efficiency: 90% (inferred from questions)
```

---

## Implementation Guide

### Phase 1: AI Provider Integration (Week 1)

#### Task 1.1: Claude Prompt Caching

```typescript
// lib/ai/providers/claude-provider.ts

export class ClaudeProvider extends BaseProvider {
  async completeWithConversation(
    conversationHistory: ConversationMessage[],
    currentQuestion: string
  ): Promise<LLMResponse> {
    // Build cached system prompt
    const systemPrompt = [
      {
        type: "text",
        text: await this.buildSchemaContext(),
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: await this.buildOntologyContext(),
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: SQL_COMPOSITION_PROMPT,
        cache_control: { type: "ephemeral" }
      }
    ];

    // Build conversation history (not cached)
    const conversationPrompt = this.buildConversationHistory(conversationHistory);
    const fullPrompt = conversationPrompt + "\n\n" + currentQuestion;

    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: fullPrompt }]
    });

    return this.parseLLMResponse(response.content[0].text);
  }
}
```

#### Task 1.2: Gemini Context Caching

```typescript
// lib/ai/providers/gemini-provider.ts

export class GeminiProvider extends BaseProvider {
  async completeWithConversation(
    conversationHistory: ConversationMessage[],
    currentQuestion: string
  ): Promise<LLMResponse> {
    // Get or create cached content
    const cacheKey = this.getCacheKey();
    let cachedContent = await this.getCachedContent(cacheKey);

    if (!cachedContent) {
      cachedContent = await this.createCachedContent(cacheKey);
    }

    // Use cached content
    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      cachedContent: cachedContent.name
    });

    const conversationPrompt = this.buildConversationHistory(conversationHistory);
    const fullPrompt = conversationPrompt + "\n\n" + currentQuestion;

    const result = await model.generateContent(fullPrompt);
    return this.parseLLMResponse(result.response.text());
  }

  private async createCachedContent(cacheKey: string) {
    const cachedContent = await this.genAI.cacheManager.create({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: await this.buildSchemaContext() },
            { text: await this.buildOntologyContext() },
            { text: SQL_COMPOSITION_PROMPT }
          ]
        }
      ],
      ttlSeconds: 3600,
      displayName: `schema-${cacheKey}`
    });

    // Store reference in Redis
    await redis.set(
      `gemini:cache:${cacheKey}`,
      cachedContent.name,
      "EX",
      3600
    );

    return cachedContent;
  }
}
```

### Phase 2: SQL Composition (Week 1)

#### Task 2.1: SQL Composer Service

```typescript
// lib/services/sql-composer.service.ts

export class SqlComposerService {
  async composeQuery(
    previousSql: string,
    previousQuestion: string,
    currentQuestion: string,
    provider: BaseProvider
  ): Promise<ComposedQuery> {
    // Ask LLM to determine composition strategy
    const response = await provider.complete({
      system: SQL_COMPOSITION_PROMPT,
      userMessage: `
Previous Q: "${previousQuestion}"
Previous SQL: ${previousSql}

Current Q: "${currentQuestion}"

Determine strategy and generate SQL.
Return JSON: { strategy: 'cte' | 'merged' | 'fresh', sql: '...' }
      `,
      temperature: 0.1
    });

    const parsed = JSON.parse(response);

    return {
      sql: parsed.sql,
      strategy: parsed.strategy,
      isBuildingOnPrevious: parsed.strategy !== 'fresh'
    };
  }
}
```

#### Task 2.2: Integration with Orchestrator

```typescript
// lib/services/semantic/three-mode-orchestrator.service.ts

export class ThreeModeOrchestrator {
  async askInConversation(
    question: string,
    customerId: string,
    conversationHistory: ConversationMessage[],
    modelId?: string
  ): Promise<InsightResult> {
    // Check if this builds on previous query
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const shouldCompose = this.shouldComposeQuery(question, lastMessage);

    if (shouldCompose && lastMessage?.metadata?.sql) {
      // Compose on previous SQL
      const composed = await this.sqlComposer.composeQuery(
        lastMessage.metadata.sql,
        lastMessage.content,
        question,
        await getAIProvider(modelId)
      );

      // Execute composed SQL
      const results = await this.executeSQL(composed.sql, customerId);

      return {
        mode: "conversation",
        question,
        sql: composed.sql,
        results,
        compositionStrategy: composed.strategy,
        thinking: this.buildThinkingSteps(composed)
      };
    } else {
      // Fresh query (normal flow)
      return this.ask(question, customerId, modelId);
    }
  }

  private shouldComposeQuery(
    question: string,
    lastMessage?: ConversationMessage
  ): boolean {
    if (!lastMessage?.metadata?.sql) return false;

    // Check for reference pronouns
    const referenceWords = /\b(which ones?|those|they|them|these|that)\b/i;
    if (referenceWords.test(question)) return true;

    // Check for aggregation on previous
    const aggregationWords = /\b(average|total|count|sum|how many)\b/i;
    if (aggregationWords.test(question)) {
      // Check if question is vague (likely referencing previous)
      const hasExplicitEntity = /\bpatient|wound|assessment|clinic\b/i.test(question);
      return !hasExplicitEntity;
    }

    return false;
  }
}
```

### Phase 3: Audit Integration (Week 2)

#### Task 3.1: Extend QueryHistory Schema

```sql
-- database/migration/046_conversation_audit_tracking.sql

BEGIN;

-- Add conversation tracking columns
ALTER TABLE "QueryHistory"
ADD COLUMN IF NOT EXISTS "conversationThreadId" UUID 
  REFERENCES "ConversationThreads"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "conversationMessageId" UUID
  REFERENCES "ConversationMessages"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "isComposedQuery" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "compositionStrategy" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "parentQueryId" INTEGER
  REFERENCES "QueryHistory"(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_query_history_conversation_thread
ON "QueryHistory" ("conversationThreadId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_query_history_parent_query
ON "QueryHistory" ("parentQueryId");

CREATE INDEX IF NOT EXISTS idx_query_history_composed
ON "QueryHistory" ("isComposedQuery", "createdAt" DESC)
WHERE "isComposedQuery" = true;

-- Comments
COMMENT ON COLUMN "QueryHistory"."conversationThreadId" 
IS 'Links to conversation thread (if query was part of conversation)';

COMMENT ON COLUMN "QueryHistory"."isComposedQuery" 
IS 'True if this SQL builds on previous query (CTE composition)';

COMMENT ON COLUMN "QueryHistory"."compositionStrategy" 
IS 'How SQL was composed: cte, merged_where, or fresh';

COMMENT ON COLUMN "QueryHistory"."parentQueryId" 
IS 'References previous query in conversation chain';

COMMIT;
```

#### Task 3.2: Update Audit Service

```typescript
// lib/services/audit/query-history-audit.service.ts

export class QueryHistoryAuditService {
  async logConversationQuery(params: {
    question: string;
    sql: string;
    customerId: string;
    userId: number;
    threadId: string;
    messageId: string;
    parentQueryHistoryId?: number;
    compositionStrategy?: 'cte' | 'merged_where' | 'fresh';
    // ... other existing params
  }): Promise<number> {
    const result = await pool.query(`
      INSERT INTO "QueryHistory" (
        question,
        sql,
        customerId,
        userId,
        conversationThreadId,
        conversationMessageId,
        isComposedQuery,
        compositionStrategy,
        parentQueryId,
        mode,
        status,
        -- ... other fields
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'conversation', 'success', ...)
      RETURNING id
    `, [
      params.question,
      params.sql,
      params.customerId,
      params.userId,
      params.threadId,
      params.messageId,
      params.parentQueryHistoryId !== undefined,
      params.compositionStrategy || 'fresh',
      params.parentQueryHistoryId || null,
      // ... other values
    ]);

    return result.rows[0].id;
  }
}
```

#### Task 3.3: Dashboard Metrics

```typescript
// app/api/admin/audit/conversation-metrics/route.ts

export async function GET(req: NextRequest) {
  // Conversation-specific metrics for P0.3 dashboard

  const metrics = await pool.query(`
    SELECT 
      -- Conversation engagement
      COUNT(DISTINCT "conversationThreadId") as total_conversations,
      AVG(queries_per_conversation) as avg_queries_per_conversation,
      
      -- Composition effectiveness
      SUM(CASE WHEN "isComposedQuery" THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as composition_rate_pct,
      
      -- Composition strategy breakdown
      COUNT(*) FILTER (WHERE "compositionStrategy" = 'cte') as cte_count,
      COUNT(*) FILTER (WHERE "compositionStrategy" = 'merged_where') as merged_count,
      COUNT(*) FILTER (WHERE "compositionStrategy" = 'fresh') as fresh_count,
      
      -- Performance
      AVG("executionTimeMs") FILTER (WHERE "isComposedQuery") as avg_composed_time_ms,
      AVG("executionTimeMs") FILTER (WHERE NOT "isComposedQuery") as avg_fresh_time_ms
    FROM (
      SELECT 
        qh.*,
        COUNT(*) OVER (PARTITION BY "conversationThreadId") as queries_per_conversation
      FROM "QueryHistory" qh
      WHERE "conversationThreadId" IS NOT NULL
        AND "createdAt" >= NOW() - INTERVAL '7 days'
    ) conversation_queries
  `);

  return NextResponse.json(metrics.rows[0]);
}
```

---

## Summary: Complete Solution

### Token Efficiency

| Approach | First Message | Subsequent | 10 Messages | Savings |
|----------|---------------|------------|-------------|---------|
| **No caching** | 5200 tokens | 5200 tokens | 52,000 tokens | Baseline |
| **Claude caching** | 5200 tokens | 500 tokens | 9,700 tokens | **81%** |
| **Gemini caching** | 5200 tokens | 600 tokens | 10,600 tokens | **80%** |

### Privacy & Security

✅ **No patient data stored** in database  
✅ **SQL composition** via CTEs (no temp tables)  
✅ **Fresh execution** every time (no stale data)  
✅ **Audit trail** tracks query lineage  

### Save Insight

✅ **Last SQL saved** (fully composed with CTEs)  
✅ **Self-contained** (no conversation context needed to re-run)  
✅ **Traceable** (links back to original conversation)  
✅ **Dashboard-ready** (works like any other saved insight)  

### Audit Integration

✅ **QueryHistory extended** with conversation tracking  
✅ **Composition strategy** logged for analysis  
✅ **Parent-child** query relationships tracked  
✅ **Dashboard metrics** show conversation effectiveness  

---

**Next Steps:**
1. Implement Claude/Gemini caching (Week 1)
2. Build SQL composer service (Week 1)
3. Extend audit schema (Week 2)
4. Update dashboard (Week 2)

/**
 * File: lib/services/audit/clarification-audit.service.ts
 * Purpose: Fire-and-forget logging service for clarification audit trail
 * Related: Task P0.1 - Clarification Audit Trail
 * Dependencies: QueryHistory table, ClarificationAudit table (migration 043)
 */

import { getInsightGenDbPool } from "@/lib/db";

/**
 * Response type for clarification outcomes
 */
export type ClarificationResponseType = 'accepted' | 'custom' | 'abandoned';

/**
 * Input structure for logging a clarification event
 */
export interface LogClarificationInput {
  // Link to query (optional - may not exist if user abandoned before execution)
  queryHistoryId?: number;
  
  // Clarification context
  placeholderSemantic: string;       // e.g., 'assessment_type', 'time_window'
  promptText: string;                // Question shown to user
  optionsPresented: string[];        // Options offered
  
  // User response
  responseType: ClarificationResponseType;
  acceptedValue?: any;               // What user selected/entered
  
  // Timing
  timeSpentMs?: number;              // Client-measured time
  presentedAt?: Date;
  respondedAt?: Date;
  
  // Template context (optional)
  templateName?: string;
  templateSummary?: string;
}

/**
 * Batch input for logging multiple clarifications at once
 */
export interface LogClarificationBatchInput {
  queryHistoryId?: number;
  clarifications: Omit<LogClarificationInput, 'queryHistoryId'>[];
}

/**
 * Input for logging clarification presentation (without response)
 */
export interface LogClarificationPresentedInput {
  placeholderSemantic: string;
  promptText: string;
  optionsPresented: string[];
  presentedAt?: Date;
  templateName?: string;
  templateSummary?: string;
}

/**
 * Input for updating clarification response by audit ID
 */
export interface LogClarificationResponseUpdate {
  auditId: number;
  responseType: ClarificationResponseType;
  acceptedValue: any;
  timeSpentMs?: number;
}

/**
 * Service for logging clarification audit trail
 * Uses fire-and-forget pattern to avoid blocking query execution
 */
export class ClarificationAuditService {
  /**
   * Log a single clarification event
   * Fire-and-forget: errors are logged but don't throw
   */
  static async logClarification(input: LogClarificationInput): Promise<void> {
    try {
      const pool = await getInsightGenDbPool();
      
      await pool.query(
        `
        INSERT INTO "ClarificationAudit" (
          "queryHistoryId",
          "placeholderSemantic",
          "promptText",
          "optionsPresented",
          "responseType",
          "acceptedValue",
          "timeSpentMs",
          "presentedAt",
          "respondedAt",
          "templateName",
          "templateSummary"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          input.queryHistoryId ?? null,
          input.placeholderSemantic,
          input.promptText,
          JSON.stringify(input.optionsPresented),
          input.responseType,
          input.acceptedValue ? JSON.stringify(input.acceptedValue) : null,
          input.timeSpentMs ?? null,
          input.presentedAt ?? new Date(),
          input.respondedAt ?? null,
          input.templateName ?? null,
          input.templateSummary ?? null,
        ]
      );
      
      console.log('[ClarificationAudit] Logged clarification:', {
        placeholderSemantic: input.placeholderSemantic,
        responseType: input.responseType,
        hasQueryHistory: !!input.queryHistoryId,
      });
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      console.error('[ClarificationAudit] Failed to log clarification (non-blocking):', error);
    }
  }
  
  /**
   * Log multiple clarifications in a batch (more efficient)
   * Fire-and-forget: errors are logged but don't throw
   */
  static async logClarificationBatch(input: LogClarificationBatchInput): Promise<void> {
    if (!input.clarifications || input.clarifications.length === 0) {
      return;
    }
    
    try {
      const pool = await getInsightGenDbPool();
      
      // Build multi-row insert
      const values: any[] = [];
      const placeholders: string[] = [];
      
      input.clarifications.forEach((clarification, index) => {
        const baseIndex = index * 11;
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
        );
        
        values.push(
          input.queryHistoryId ?? null,
          clarification.placeholderSemantic,
          clarification.promptText,
          JSON.stringify(clarification.optionsPresented),
          clarification.responseType,
          clarification.acceptedValue ? JSON.stringify(clarification.acceptedValue) : null,
          clarification.timeSpentMs ?? null,
          clarification.presentedAt ?? new Date(),
          clarification.respondedAt ?? null,
          clarification.templateName ?? null,
          clarification.templateSummary ?? null
        );
      });
      
      const query = `
        INSERT INTO "ClarificationAudit" (
          "queryHistoryId",
          "placeholderSemantic",
          "promptText",
          "optionsPresented",
          "responseType",
          "acceptedValue",
          "timeSpentMs",
          "presentedAt",
          "respondedAt",
          "templateName",
          "templateSummary"
        )
        VALUES ${placeholders.join(', ')}
      `;
      
      await pool.query(query, values);
      
      console.log('[ClarificationAudit] Logged clarification batch:', {
        count: input.clarifications.length,
        hasQueryHistory: !!input.queryHistoryId,
      });
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      console.error('[ClarificationAudit] Failed to log clarification batch (non-blocking):', error);
    }
  }
  
  /**
   * Log when clarification modal is presented (before user responds)
   * This captures abandonment cases where user never responds
   */
  static async logClarificationPresented(
    placeholderSemantic: string,
    promptText: string,
    optionsPresented: string[],
    templateName?: string,
    templateSummary?: string
  ): Promise<number | null> {
    try {
      const pool = await getInsightGenDbPool();
      
      const result = await pool.query(
        `
        INSERT INTO "ClarificationAudit" (
          "placeholderSemantic",
          "promptText",
          "optionsPresented",
          "responseType",
          "presentedAt",
          "templateName",
          "templateSummary"
        )
        VALUES ($1, $2, $3, 'abandoned', NOW(), $4, $5)
        RETURNING id
        `,
        [
          placeholderSemantic,
          promptText,
          JSON.stringify(optionsPresented),
          templateName ?? null,
          templateSummary ?? null,
        ]
      );
      
      const auditId = result.rows[0]?.id;
      console.log('[ClarificationAudit] Logged clarification presentation:', {
        auditId,
        placeholderSemantic,
      });
      
      return auditId;
    } catch (error) {
      console.error('[ClarificationAudit] Failed to log clarification presentation (non-blocking):', error);
      return null;
    }
  }

  /**
   * Log multiple clarification presentations and return audit IDs
   */
  static async logClarificationPresentedBatch(
    clarifications: LogClarificationPresentedInput[]
  ): Promise<Array<{ id: number; placeholderSemantic: string }>> {
    if (!clarifications || clarifications.length === 0) {
      return [];
    }

    try {
      const pool = await getInsightGenDbPool();

      const values: any[] = [];
      const placeholders: string[] = [];

      clarifications.forEach((clarification, index) => {
        const baseIndex = index * 7;
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7})`
        );

        values.push(
          clarification.placeholderSemantic,
          clarification.promptText,
          JSON.stringify(clarification.optionsPresented),
          'abandoned',
          clarification.presentedAt ?? new Date(),
          clarification.templateName ?? null,
          clarification.templateSummary ?? null
        );
      });

      const query = `
        INSERT INTO "ClarificationAudit" (
          "placeholderSemantic",
          "promptText",
          "optionsPresented",
          "responseType",
          "presentedAt",
          "templateName",
          "templateSummary"
        )
        VALUES ${placeholders.join(', ')}
        RETURNING id, "placeholderSemantic"
      `;

      const result = await pool.query(query, values);
      console.log('[ClarificationAudit] Logged clarification presentations:', {
        count: clarifications.length,
      });

      return result.rows.map((row: any) => ({
        id: row.id,
        placeholderSemantic: row.placeholderSemantic,
      }));
    } catch (error) {
      console.error('[ClarificationAudit] Failed to log clarification presentations (non-blocking):', error);
      return [];
    }
  }
  
  /**
   * Update clarification audit when user responds
   * Called after user selects an option or provides custom input
   */
  static async updateClarificationResponse(
    auditId: number,
    responseType: ClarificationResponseType,
    acceptedValue: any,
    timeSpentMs?: number
  ): Promise<void> {
    try {
      const pool = await getInsightGenDbPool();
      
      await pool.query(
        `
        UPDATE "ClarificationAudit"
        SET 
          "responseType" = $1,
          "acceptedValue" = $2,
          "timeSpentMs" = $3,
          "respondedAt" = NOW()
        WHERE id = $4
        `,
        [
          responseType,
          JSON.stringify(acceptedValue),
          timeSpentMs ?? null,
          auditId,
        ]
      );
      
      console.log('[ClarificationAudit] Updated clarification response:', {
        auditId,
        responseType,
      });
    } catch (error) {
      console.error('[ClarificationAudit] Failed to update clarification response (non-blocking):', error);
    }
  }

  /**
   * Update multiple clarification responses by audit ID
   */
  static async updateClarificationResponsesBatch(
    updates: LogClarificationResponseUpdate[]
  ): Promise<void> {
    if (!updates || updates.length === 0) {
      return;
    }

    await Promise.all(
      updates.map((update) =>
        ClarificationAuditService.updateClarificationResponse(
          update.auditId,
          update.responseType,
          update.acceptedValue,
          update.timeSpentMs
        )
      )
    );
  }
  
  /**
   * Link clarification audit to query history after query executes
   * Called when query is successfully saved to QueryHistory
   */
  static async linkClarificationToQuery(
    auditId: number,
    queryHistoryId: number
  ): Promise<void> {
    try {
      const pool = await getInsightGenDbPool();
      
      await pool.query(
        `
        UPDATE "ClarificationAudit"
        SET "queryHistoryId" = $1
        WHERE id = $2
        `,
        [queryHistoryId, auditId]
      );
      
      console.log('[ClarificationAudit] Linked clarification to query:', {
        auditId,
        queryHistoryId,
      });
    } catch (error) {
      console.error('[ClarificationAudit] Failed to link clarification to query (non-blocking):', error);
    }
  }

  /**
   * Link multiple clarification audits to a query history record
   */
  static async linkClarificationsToQuery(
    auditIds: number[],
    queryHistoryId: number
  ): Promise<void> {
    if (!auditIds || auditIds.length === 0) {
      return;
    }

    try {
      const pool = await getInsightGenDbPool();
      await pool.query(
        `
        UPDATE "ClarificationAudit"
        SET "queryHistoryId" = $1
        WHERE id = ANY($2::int[])
        `,
        [queryHistoryId, auditIds]
      );

      console.log('[ClarificationAudit] Linked clarifications to query:', {
        queryHistoryId,
        count: auditIds.length,
      });
    } catch (error) {
      console.error('[ClarificationAudit] Failed to link clarifications to query (non-blocking):', error);
    }
  }
}

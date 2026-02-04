import type { Pool } from "pg";
import type {
  QueryMetrics,
  AIResponseMetrics,
  CacheMetrics,
} from "./prompts/types";
import type { FilterMetricsSummary } from "./types/filter-metrics";
import { getInsightGenDbPool } from "./db";

/**
 * Utility class for monitoring and logging system metrics
 */
export class MetricsMonitor {
  private static instance: MetricsMonitor | null = null;
  private pool: Pool | null = null;

  private constructor() {}

  public static getInstance(): MetricsMonitor {
    if (!MetricsMonitor.instance) {
      MetricsMonitor.instance = new MetricsMonitor();
    }
    return MetricsMonitor.instance;
  }

  /**
   * Reset the singleton instance and clear the database pool
   * This is useful when switching database connections
   */
  public static resetInstance(): void {
    if (MetricsMonitor.instance && MetricsMonitor.instance.pool) {
      MetricsMonitor.instance.pool.end();
      MetricsMonitor.instance.pool = null;
    }
    MetricsMonitor.instance = null;
  }

  private async ensurePool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await getInsightGenDbPool();
    }
    return this.pool;
  }

  /**
   * Log query execution metrics
   */
  public async logQueryMetrics(metrics: QueryMetrics): Promise<void> {
    try {
      const pool = await this.ensurePool();
      const query = `
        INSERT INTO "QueryMetrics" 
        ("queryId", "executionTime", "resultSize", "timestamp", "cached", "sql", "parameters")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      const values = [
        metrics.queryId,
        metrics.executionTime,
        metrics.resultSize,
        metrics.timestamp,
        metrics.cached,
        metrics.sql,
        JSON.stringify(metrics.parameters),
      ];
      await pool.query(query, values);
    } catch (error) {
      console.error("Failed to log query metrics:", error);
    }
  }

  /**
   * Log AI response metrics
   */
  public async logAIMetrics(metrics: AIResponseMetrics): Promise<void> {
    try {
      const pool = await this.ensurePool();
      const query = `
        INSERT INTO "AIMetrics" 
        ("promptTokens", "completionTokens", "totalTokens", "latency", "success", "errorType", "model", "timestamp")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      const values = [
        metrics.promptTokens,
        metrics.completionTokens,
        metrics.totalTokens,
        metrics.latency,
        metrics.success,
        metrics.errorType || null,
        metrics.model,
        metrics.timestamp,
      ];
      await pool.query(query, values);
    } catch (error) {
      console.error("Failed to log AI metrics:", error);
    }
  }

  /**
   * Log cache performance metrics
   */
  public async logCacheMetrics(metrics: CacheMetrics): Promise<void> {
    try {
      const pool = await this.ensurePool();
      const query = `
        INSERT INTO "CacheMetrics" 
        ("cacheHits", "cacheMisses", "cacheInvalidations", "averageHitLatency", "timestamp")
        VALUES ($1, $2, $3, $4, $5)
      `;
      const values = [
        metrics.cacheHits,
        metrics.cacheMisses,
        metrics.cacheInvalidations,
        metrics.averageHitLatency,
        metrics.timestamp,
      ];
      await pool.query(query, values);
    } catch (error) {
      console.error("Failed to log cache metrics:", error);
    }
  }

  /**
   * Get query performance report
   */
  public async getQueryPerformanceReport(
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      const pool = await this.ensurePool();
      const query = `
        SELECT 
          AVG("executionTime") as avgExecutionTime,
          MAX("executionTime") as maxExecutionTime,
          AVG("resultSize") as avgResultSize,
          COUNT(*) as totalQueries,
          SUM(CASE WHEN "cached" = true THEN 1 ELSE 0 END) as cachedQueries
        FROM "QueryMetrics"
        WHERE "timestamp" BETWEEN $1 AND $2
      `;
      const result = await pool.query(query, [startDate, endDate]);
      return result.rows[0];
    } catch (error) {
      console.error("Failed to get query performance report:", error);
      return null;
    }
  }

  /**
   * Get AI performance report
   */
  public async getAIPerformanceReport(
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      const pool = await this.ensurePool();
      const query = `
        SELECT 
          AVG("latency") as avgLatency,
          AVG("totalTokens") as avgTokens,
          COUNT(*) as totalRequests,
          SUM(CASE WHEN "success" = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as successRate,
          "model",
          COUNT(DISTINCT "errorType") as uniqueErrors
        FROM "AIMetrics"
        WHERE "timestamp" BETWEEN $1 AND $2
        GROUP BY "model"
      `;
      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("Failed to get AI performance report:", error);
      return null;
    }
  }

  public async logQueryPerformanceMetrics(metrics: QueryPerformanceLog): Promise<void> {
    try {
      const pool = await this.ensurePool();
      const filterMetrics = metrics.filterMetrics;
      const overrideRate =
        filterMetrics && filterMetrics.totalFilters > 0
          ? (filterMetrics.overrides / filterMetrics.totalFilters)
          : null;
      const mappingConfidence =
        filterMetrics && filterMetrics.avgMappingConfidence !== null
          ? filterMetrics.avgMappingConfidence
          : null;

      const query = `
        INSERT INTO "QueryPerformanceMetrics"
          ("question", "customerId", "mode", "totalDurationMs",
           "filterValueOverrideRate", "filterValidationErrors", "filterAutoCorrections",
           "filterMappingConfidence", "filterUnresolvedWarnings", "clarificationRequested", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      const values = [
        metrics.question,
        metrics.customerId,
        metrics.mode,
        metrics.totalDurationMs,
        overrideRate,
        filterMetrics?.validationErrors ?? 0,
        filterMetrics?.autoCorrections ?? 0,
        mappingConfidence,
        filterMetrics?.unresolvedWarnings ?? 0,
        metrics.clarificationRequested ?? false,
        metrics.timestamp ?? new Date(),
      ];

      await pool.query(query, values);
    } catch (error) {
      console.error("Failed to log query performance metrics:", error);
    }
  }
}

export interface QueryPerformanceLog {
  question: string;
  customerId: string;
  mode: string;
  totalDurationMs: number;
  filterMetrics?: FilterMetricsSummary;
  clarificationRequested?: boolean;
  timestamp?: Date;
}

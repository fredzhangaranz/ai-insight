import * as sql from "mssql";
import type {
  QueryMetrics,
  AIResponseMetrics,
  CacheMetrics,
} from "./prompts/types";
import { getSilhouetteDbPool } from "./db";

/**
 * Utility class for monitoring and logging system metrics
 */
export class MetricsMonitor {
  private static instance: MetricsMonitor;
  private pool: sql.ConnectionPool | null = null;

  private constructor() {}

  public static getInstance(): MetricsMonitor {
    if (!MetricsMonitor.instance) {
      MetricsMonitor.instance = new MetricsMonitor();
    }
    return MetricsMonitor.instance;
  }

  private async ensurePool(): Promise<sql.ConnectionPool> {
    if (!this.pool) {
      this.pool = await getSilhouetteDbPool();
    }
    return this.pool;
  }

  /**
   * Log query execution metrics
   */
  public async logQueryMetrics(metrics: QueryMetrics): Promise<void> {
    try {
      const pool = await this.ensurePool();
      await pool
        .request()
        .input("queryId", sql.NVarChar, metrics.queryId)
        .input("executionTime", sql.Int, metrics.executionTime)
        .input("resultSize", sql.Int, metrics.resultSize)
        .input("timestamp", sql.DateTime, metrics.timestamp)
        .input("cached", sql.Bit, metrics.cached ? 1 : 0)
        .input("sql", sql.NVarChar(sql.MAX), metrics.sql)
        .input(
          "parameters",
          sql.NVarChar(sql.MAX),
          JSON.stringify(metrics.parameters)
        ).query(`
          INSERT INTO SilhouetteAIDashboard.QueryMetrics 
          (queryId, executionTime, resultSize, timestamp, cached, sql, parameters)
          VALUES (@queryId, @executionTime, @resultSize, @timestamp, @cached, @sql, @parameters)
        `);
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
      await pool
        .request()
        .input("promptTokens", sql.Int, metrics.promptTokens)
        .input("completionTokens", sql.Int, metrics.completionTokens)
        .input("totalTokens", sql.Int, metrics.totalTokens)
        .input("latency", sql.Int, metrics.latency)
        .input("success", sql.Bit, metrics.success ? 1 : 0)
        .input("errorType", sql.NVarChar, metrics.errorType || null)
        .input("model", sql.NVarChar, metrics.model)
        .input("timestamp", sql.DateTime, metrics.timestamp).query(`
          INSERT INTO SilhouetteAIDashboard.AIMetrics 
          (promptTokens, completionTokens, totalTokens, latency, success, errorType, model, timestamp)
          VALUES (@promptTokens, @completionTokens, @totalTokens, @latency, @success, @errorType, @model, @timestamp)
        `);
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
      await pool
        .request()
        .input("cacheHits", sql.Int, metrics.cacheHits)
        .input("cacheMisses", sql.Int, metrics.cacheMisses)
        .input("cacheInvalidations", sql.Int, metrics.cacheInvalidations)
        .input("averageHitLatency", sql.Float, metrics.averageHitLatency)
        .input("timestamp", sql.DateTime, metrics.timestamp).query(`
          INSERT INTO SilhouetteAIDashboard.CacheMetrics 
          (cacheHits, cacheMisses, cacheInvalidations, averageHitLatency, timestamp)
          VALUES (@cacheHits, @cacheMisses, @cacheInvalidations, @averageHitLatency, @timestamp)
        `);
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
      const result = await pool
        .request()
        .input("startDate", sql.DateTime, startDate)
        .input("endDate", sql.DateTime, endDate).query(`
          SELECT 
            AVG(executionTime) as avgExecutionTime,
            MAX(executionTime) as maxExecutionTime,
            AVG(resultSize) as avgResultSize,
            COUNT(*) as totalQueries,
            SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) as cachedQueries
          FROM SilhouetteAIDashboard.QueryMetrics
          WHERE timestamp BETWEEN @startDate AND @endDate
        `);
      return result.recordset[0];
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
      const result = await pool
        .request()
        .input("startDate", sql.DateTime, startDate)
        .input("endDate", sql.DateTime, endDate).query(`
          SELECT 
            AVG(latency) as avgLatency,
            AVG(totalTokens) as avgTokens,
            COUNT(*) as totalRequests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as successRate,
            model,
            COUNT(DISTINCT errorType) as uniqueErrors
          FROM SilhouetteAIDashboard.AIMetrics
          WHERE timestamp BETWEEN @startDate AND @endDate
          GROUP BY model
        `);
      return result.recordset;
    } catch (error) {
      console.error("Failed to get AI performance report:", error);
      return null;
    }
  }
}

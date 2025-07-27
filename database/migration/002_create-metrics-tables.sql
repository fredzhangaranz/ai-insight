-- Create metrics tables for monitoring
USE SilhouetteAIDashboard;

-- Query Metrics Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'QueryMetrics' AND schema_id = SCHEMA_ID('rpt'))
BEGIN
    CREATE TABLE rpt.QueryMetrics (
        id INT IDENTITY(1,1) PRIMARY KEY,
        queryId NVARCHAR(100) NOT NULL,
        executionTime INT NOT NULL,
        resultSize INT NOT NULL,
        timestamp DATETIME NOT NULL,
        cached BIT NOT NULL,
        sql NVARCHAR(MAX) NOT NULL,
        parameters NVARCHAR(MAX) NULL,
        CONSTRAINT CK_QueryMetrics_ExecutionTime CHECK (executionTime >= 0),
        CONSTRAINT CK_QueryMetrics_ResultSize CHECK (resultSize >= 0)
    );

    CREATE INDEX IX_QueryMetrics_Timestamp ON rpt.QueryMetrics(timestamp);
    CREATE INDEX IX_QueryMetrics_QueryId ON rpt.QueryMetrics(queryId);
END

-- AI Metrics Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AIMetrics' AND schema_id = SCHEMA_ID('rpt'))
BEGIN
    CREATE TABLE rpt.AIMetrics (
        id INT IDENTITY(1,1) PRIMARY KEY,
        promptTokens INT NOT NULL,
        completionTokens INT NOT NULL,
        totalTokens INT NOT NULL,
        latency INT NOT NULL,
        success BIT NOT NULL,
        errorType NVARCHAR(100) NULL,
        model NVARCHAR(100) NOT NULL,
        timestamp DATETIME NOT NULL,
        CONSTRAINT CK_AIMetrics_Tokens CHECK (
            promptTokens >= 0 AND 
            completionTokens >= 0 AND 
            totalTokens >= 0
        ),
        CONSTRAINT CK_AIMetrics_Latency CHECK (latency >= 0)
    );

    CREATE INDEX IX_AIMetrics_Timestamp ON rpt.AIMetrics(timestamp);
    CREATE INDEX IX_AIMetrics_Model ON rpt.AIMetrics(model);
END

-- Cache Metrics Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CacheMetrics' AND schema_id = SCHEMA_ID('rpt'))
BEGIN
    CREATE TABLE rpt.CacheMetrics (
        id INT IDENTITY(1,1) PRIMARY KEY,
        cacheHits INT NOT NULL,
        cacheMisses INT NOT NULL,
        cacheInvalidations INT NOT NULL,
        averageHitLatency FLOAT NOT NULL,
        timestamp DATETIME NOT NULL,
        CONSTRAINT CK_CacheMetrics_Counts CHECK (
            cacheHits >= 0 AND 
            cacheMisses >= 0 AND 
            cacheInvalidations >= 0
        ),
        CONSTRAINT CK_CacheMetrics_Latency CHECK (averageHitLatency >= 0)
    );

    CREATE INDEX IX_CacheMetrics_Timestamp ON rpt.CacheMetrics(timestamp);
END

-- Add cleanup procedure
IF NOT EXISTS (SELECT * FROM sys.procedures WHERE name = 'CleanupMetrics' AND schema_id = SCHEMA_ID('rpt'))
BEGIN
    EXEC('
    CREATE PROCEDURE rpt.CleanupMetrics
        @daysToKeep INT = 30
    AS
    BEGIN
        SET NOCOUNT ON;
        
        DECLARE @cutoffDate DATETIME = DATEADD(DAY, -@daysToKeep, GETUTCDATE());
        
        DELETE FROM rpt.QueryMetrics WHERE timestamp < @cutoffDate;
        DELETE FROM rpt.AIMetrics WHERE timestamp < @cutoffDate;
        DELETE FROM rpt.CacheMetrics WHERE timestamp < @cutoffDate;
    END
    ');
END 
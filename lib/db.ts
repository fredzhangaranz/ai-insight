/**
 * File: /src/lib/db.ts
 *
 * Description: Manages a singleton, shared connection pool for MS SQL Server. This
 * approach prevents connection errors from parallel API requests by creating one
 * persistent pool that the entire application shares.
 *
 * ### The Problem: Race Conditions on Initial Connection
 *
 * In a serverless environment, multiple API requests can be processed concurrently.
 * If several requests arrive simultaneously when the application is "cold" (i.e.,
 * no connection pool exists), they will all try to create a new connection pool
 * at the same time. This leads to a race condition:
 *
 * 1. Request A calls `getDbPool()`, sees `poolPromise` is null, and starts creating a new pool.
 * 2. Before Request A's `pool.connect()` finishes, Request B calls `getDbPool()`.
 * 3. A naive implementation might return the not-yet-connected pool object to Request B.
 * 4. Request B tries to use the pool, resulting in a "Connection is closed" error.
 *
 * ### The Solution: Storing the Connection Promise
 *
 * This implementation solves the race condition by storing the *promise* of the
 * connection pool (`poolPromise`) in the module's scope, not the pool object itself.
 *
 * 1. The first call to `getDbPool()` creates the connection promise and immediately
 *    assigns it to the `poolPromise` variable.
 * 2. Any subsequent, concurrent calls to `getDbPool()` will find that `poolPromise`
 *    is no longer null and will return the *existing promise*.
 * 3. All callers then `await` the same promise, ensuring that they all wait for the
 *    initial connection to complete before proceeding. This guarantees the pool is
 *    only created once.
 */

import * as sql from "mssql";
import { Pool, PoolConfig } from "pg";

// Store the connection promise for the Insight Gen database (PostgreSQL)
let insightGenDbPoolPromise: Promise<Pool> | null = null;

// Store the connection promise for the customer database (MS SQL)
let silhouetteDbPoolPromise: Promise<sql.ConnectionPool> | null = null;

/**
 * Returns a shared instance of the PostgreSQL connection pool for the Insight Gen database.
 * If the pool doesn't exist, it creates one.
 * @returns {Promise<Pool>} The active connection pool.
 */
export function getInsightGenDbPool(): Promise<Pool> {
  if (insightGenDbPoolPromise) {
    return insightGenDbPoolPromise;
  }

  if (!process.env.INSIGHT_GEN_DB_URL) {
    const err = new Error(
      "Insight Gen database connection string is not configured in environment variables."
    );
    console.error(`Missing INSIGHT_GEN_DB_URL environment variable`);
    return Promise.reject(err);
  }

  insightGenDbPoolPromise = (async () => {
    try {
      const dbConfig: PoolConfig = {
        connectionString: process.env.INSIGHT_GEN_DB_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };

      const pool = new Pool(dbConfig);

      pool.on("error", (err) => {
        console.error("Connection pool error:", err);
        pool.end();
        insightGenDbPoolPromise = null;
      });

      await pool.connect();
      console.log(
        "Insight Gen database connection pool created and connected."
      );
      return pool;
    } catch (err) {
      insightGenDbPoolPromise = null;
      console.error("Insight Gen Database Connection Failed:", err);
      throw err;
    }
  })();

  return insightGenDbPoolPromise;
}

/**
 * Returns a shared instance of the MS SQL connection pool for the customer database.
 * If the pool doesn't exist, it creates one.
 * @returns {Promise<sql.ConnectionPool>} The active connection pool.
 */
export function getSilhouetteDbPool(): Promise<sql.ConnectionPool> {
  if (silhouetteDbPoolPromise) {
    return silhouetteDbPoolPromise;
  }

  if (!process.env.SILHOUETTE_DB_URL) {
    const err = new Error(
      "Silhouette database connection string is not configured in environment variables."
    );
    return Promise.reject(err);
  }

  silhouetteDbPoolPromise = (async () => {
    try {
      const connectionString = process.env.SILHOUETTE_DB_URL!;
      const params = connectionString.split(";").reduce((acc, part) => {
        const eqIndex = part.indexOf("=");
        if (eqIndex > -1) {
          const key = part.substring(0, eqIndex).trim().toLowerCase();
          let value = part.substring(eqIndex + 1).trim();
          if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      // Parse server and port from server parameter if it contains both
      let server = params.server;
      let port = params.port ? Number(params.port) : 1433;

      if (server && server.includes(":")) {
        const [serverHost, serverPort] = server.split(":");
        server = serverHost;
        port = Number(serverPort);
      }

      const dbConfig: sql.config = {
        user: params["user id"] || params.user,
        password: params.password,
        server: server,
        port: port,
        database: params.database,
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
          acquireTimeoutMillis: 30000,
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 200,
        },
        options: {
          encrypt: params.encrypt
            ? params.encrypt.toLowerCase() === "true"
            : true,
          trustServerCertificate: params.trustservercertificate
            ? params.trustservercertificate.toLowerCase() === "true"
            : true,
          requestTimeout: 30000,
          connectTimeout: 30000,
          cancelTimeout: 30000,
          enableArithAbort: true,
          maxRetriesOnTransientErrors: 3,
        },
      };
      const pool = new sql.ConnectionPool(dbConfig);

      pool.on("error", (err) => {
        console.error("Silhouette database connection pool error:", err);
        pool.close();
        silhouetteDbPoolPromise = null;
      });

      await pool.connect();
      console.log("Silhouette database connection pool created and connected.");
      return pool;
    } catch (err) {
      silhouetteDbPoolPromise = null;
      console.error("Silhouette Database Connection Failed:", err);
      throw err;
    }
  })();

  return silhouetteDbPoolPromise;
}

/**
 * Get the Silhouette database name from the connection string
 * This is useful for constructing database-agnostic queries when needed
 */
export function getSilhouetteDatabaseName(): string | null {
  const connectionString = process.env.SILHOUETTE_DB_URL;
  if (!connectionString) return null;

  const params = connectionString.split(";").reduce((acc, part) => {
    const eqIndex = part.indexOf("=");
    if (eqIndex > -1) {
      const key = part.substring(0, eqIndex).trim().toLowerCase();
      let value = part.substring(eqIndex + 1).trim();
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);

  return params.database || null;
}

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

import sql from "mssql";

// Store the connection promise, not the pool object itself, to prevent race conditions.
let poolPromise: Promise<sql.ConnectionPool> | null = null;

/**
 * Returns a shared instance of the MS SQL connection pool.
 * If the pool doesn't exist, it creates one.
 * @returns {Promise<sql.ConnectionPool>} The active connection pool.
 */
export function getDbPool(): Promise<sql.ConnectionPool> {
  if (poolPromise) {
    // If the pool promise already exists, return it.
    return poolPromise;
  }

  if (!process.env.DATABASE_URL) {
    const err = new Error(
      "Database connection string is not configured in environment variables."
    );
    return Promise.reject(err);
  }

  // If the pool promise doesn't exist, create it.
  // Store the promise in the shared variable immediately to handle concurrent requests.
  poolPromise = (async () => {
    try {
      // The user's connection string is not a URL, but a series of key-value pairs.
      // We need to parse it to build the config object that `mssql` expects,
      // as it cannot handle mixed configuration (e.g. connectionString + other properties).
      const connectionString = process.env.DATABASE_URL!;
      const params = connectionString.split(";").reduce((acc, part) => {
        const eqIndex = part.indexOf("=");
        if (eqIndex > -1) {
          const key = part.substring(0, eqIndex).trim().toLowerCase();
          let value = part.substring(eqIndex + 1).trim();
          // Remove surrounding quotes from value, which can be present in passwords
          if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      const dbConfig: sql.config = {
        user: params["user id"] || params.user,
        password: params.password,
        server: params.server,
        port: params.port ? Number(params.port) : 1433,
        database: "SilhouetteAIDashboard", // Always use the correct database for this app
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
        options: {
          encrypt: params.encrypt
            ? params.encrypt.toLowerCase() === "true"
            : true,
          trustServerCertificate: params.trustservercertificate
            ? params.trustservercertificate.toLowerCase() === "true"
            : true,
        },
      };
      const pool = new sql.ConnectionPool(dbConfig);

      // Attach an error handler to the pool to clean up on unexpected errors.
      pool.on("error", (err) => {
        console.error("Database connection pool error:", err);
        // Close the pool and reset the promise to allow for a new connection attempt.
        pool.close();
        poolPromise = null;
      });

      await pool.connect();
      console.log("Database connection pool created and connected.");
      return pool;
    } catch (err) {
      // If connection fails, reset the promise to null so the next request can try again.
      poolPromise = null;
      console.error("Database Connection Failed:", err);
      throw err;
    }
  })();

  return poolPromise;
}

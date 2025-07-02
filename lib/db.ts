/**
 * File: /src/lib/db.ts
 *
 * Description: Manages a singleton, shared connection pool for MS SQL Server.
 * This approach prevents connection errors from parallel API requests by creating
 * one persistent pool that the entire application shares.
 */

import sql from "mssql";

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};

// Declare the pool variable in a broader scope.
let pool: sql.ConnectionPool | null = null;

/**
 * Returns a shared instance of the MS SQL connection pool.
 * If the pool doesn't exist, it creates one.
 * @returns {Promise<sql.ConnectionPool>} The active connection pool.
 */
export async function getDbPool(): Promise<sql.ConnectionPool> {
  if (pool) {
    // If the pool already exists, return it.
    return pool;
  }

  if (!dbConfig.connectionString) {
    throw new Error(
      "Database connection string is not configured in environment variables."
    );
  }

  // If the pool doesn't exist, create it and connect.
  // We store the promise in the pool variable to handle concurrent requests.
  try {
    pool = new sql.ConnectionPool(dbConfig.connectionString);
    const connectPromise = pool.connect();
    await connectPromise;
    console.log("Database connection pool created and connected.");
    return pool;
  } catch (err) {
    // If connection fails, reset the pool to null so the next request can try again.
    pool = null;
    console.error("Database Connection Failed:", err);
    throw err;
  }
}

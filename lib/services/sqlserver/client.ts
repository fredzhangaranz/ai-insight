import * as sql from "mssql";

import { parseSqlServerConnectionString } from "@/lib/utils/sqlserver";

type PoolKey = string;

const pools = new Map<PoolKey, sql.ConnectionPool>();

function getPoolKey(connectionString: string): PoolKey {
  return connectionString.trim();
}

/**
 * Create or reuse a SQL Server connection pool for a customer Silhouette database.
 * Follows guidance in docs/design/semantic_layer/semantic_layer_design.md §6.3.
 */
export async function getSqlServerPool(connectionString: string): Promise<sql.ConnectionPool> {
  const key = getPoolKey(connectionString);
  const existing = pools.get(key);

  if (existing && existing.connected) {
    return existing;
  }

  const config = parseSqlServerConnectionString(connectionString);

  const pool = new sql.ConnectionPool({
    ...config,
    pool: {
      max: config.pool?.max ?? 10,
      min: config.pool?.min ?? 0,
      idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 30000,
    },
  });

  pool.on("error", (err) => {
    console.error("Silhouette pool error:", err);
    pool.close().catch(() => undefined);
    pools.delete(key);
  });

  await pool.connect();
  pools.set(key, pool);
  return pool;
}

export async function closeSqlServerPool(connectionString: string): Promise<void> {
  const key = getPoolKey(connectionString);
  const pool = pools.get(key);
  if (pool) {
    await pool.close();
    pools.delete(key);
  }
}

export async function disposeAllSqlServerPools(): Promise<void> {
  const closeOperations = Array.from(pools.values()).map((pool) => pool.close().catch(() => undefined));
  pools.clear();
  await Promise.all(closeOperations);
}

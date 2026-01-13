import * as sql from "mssql";

export type SqlServerConnectionConfig = sql.config;

/**
 * Parse an ADO-style SQL Server connection string into a configuration object.
 * Supports formats documented in docs/design/semantic_layer/database_schema.md.
 */
export function parseSqlServerConnectionString(connectionString: string): SqlServerConnectionConfig {
  const params = connectionString.split(";").reduce((acc, part) => {
    const eqIndex = part.indexOf("=");
    if (eqIndex > -1) {
      const key = part.substring(0, eqIndex).trim().toLowerCase();
      let value = part.substring(eqIndex + 1).trim();
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      if (key) acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);

  let server = params["server"] ?? params["data source"];
  let port = params["port"] ? Number(params["port"]) : 1433;

  if (server && server.includes(",")) {
    const [host, portPart] = server.split(",");
    server = host;
    port = Number(portPart);
  } else if (server && server.includes(":")) {
    const [host, portPart] = server.split(":");
    server = host;
    port = Number(portPart);
  }

  return {
    user: params["user id"] || params.user,
    password: params.password,
    server,
    port,
    database: params.database,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: params.encrypt ? params.encrypt.toLowerCase() === "true" : true,
      trustServerCertificate: params.trustservercertificate
        ? params.trustservercertificate.toLowerCase() === "true"
        : true,
      requestTimeout: 30000,
      connectTimeout: 30000,
    },
  };
}

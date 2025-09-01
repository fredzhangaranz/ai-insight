const sql = require("mssql");

// Test SQL Server connection
async function testConnection() {
  try {
    const config = {
      user: "sa",
      password: "yourStrong(!)Password",
      server: "localhost",
      port: 1433,
      database: "Silhouette",
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    console.log("Attempting to connect to SQL Server...");
    const pool = await sql.connect(config);
    console.log("✅ Connected successfully!");

    const result = await sql.query`SELECT name FROM sys.databases`;
    console.log(
      "Available databases:",
      result.recordset.map((db) => db.name)
    );

    await pool.close();
    console.log("Connection closed.");
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
    console.error("Error details:", err);
  }
}

testConnection();

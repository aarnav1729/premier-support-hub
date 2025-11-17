// importEmp.cjs
// Usage: node importEmp.cjs
require("dotenv").config();
const path = require("path");
const sql = require("mssql");
const xlsx = require("xlsx");

// --- MSSQL config (same as server.cjs) ---
const mssqlConfig = {
  user: process.env.MSSQL_USER || "SPOT_USER",
  password: process.env.MSSQL_PASSWORD || "Marvik#72@",
  server: process.env.MSSQL_SERVER || "10.0.40.10",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: process.env.MSSQL_DB || "admin",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

async function main() {
  console.log("[EMP-IMPORT] Connecting to MSSQL...");
  const pool = await sql.connect(mssqlConfig);

  console.log("[EMP-IMPORT] Dropping and recreating dbo.emp...");
  await pool.request().batch(`
IF OBJECT_ID('dbo.emp','U') IS NOT NULL
  DROP TABLE dbo.emp;

CREATE TABLE dbo.emp (
  empid NVARCHAR(50) NOT NULL PRIMARY KEY,
  empemail NVARCHAR(255) NOT NULL UNIQUE,
  empname NVARCHAR(255) NULL,
  dept NVARCHAR(100) NULL,
  subdept NVARCHAR(100) NULL,
  emplocation NVARCHAR(100) NULL,
  designation NVARCHAR(100) NULL,
  activeflag BIT NOT NULL DEFAULT 1,
  managerid NVARCHAR(50) NULL
);
  `);

  const filePath = path.join(__dirname, "emp.xlsx");
  console.log("[EMP-IMPORT] Loading Excel:", filePath);

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // rows as 2D array
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true });
  console.log(`[EMP-IMPORT] Found ${rows.length} row(s) in sheet "${sheetName}"`);

  let inserted = 0;

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    // Expected format:
    // 0: empid
    // 1: empemail
    // 2: empname
    // 3: dept
    // 4: subdept
    // 5: emplocation
    // 6: designation
    // 7: activeflag
    // 8: managerid
    const [
      empidRaw,
      empemailRaw,
      empnameRaw,
      deptRaw,
      subdeptRaw,
      emplocationRaw,
      designationRaw,
      activeflagRaw,
      manageridRaw,
    ] = row;

    // Skip if no id or email
    if (!empidRaw || !empemailRaw) {
      continue;
    }

    const empid = String(empidRaw).trim();
    const empemail = String(empemailRaw).trim().toLowerCase();
    const empname = empnameRaw != null ? String(empnameRaw).trim() : null;
    const dept = deptRaw != null ? String(deptRaw).trim() : null;
    const subdept = subdeptRaw != null ? String(subdeptRaw).trim() : null;
    const emplocation =
      emplocationRaw != null ? String(emplocationRaw).trim() : null;
    const designation =
      designationRaw != null ? String(designationRaw).trim() : null;
    const managerid =
      manageridRaw != null ? String(manageridRaw).trim() : null;

    // Default activeflag to 1 unless explicitly 0/false
    let activeflag = 1;
    if (activeflagRaw != null) {
      const af = String(activeflagRaw).trim().toLowerCase();
      if (af === "0" || af === "false" || af === "no" || af === "n") {
        activeflag = 0;
      }
    }

    const req = pool.request();
    req.input("empid", sql.NVarChar(50), empid);
    req.input("empemail", sql.NVarChar(255), empemail);
    req.input("empname", sql.NVarChar(255), empname);
    req.input("dept", sql.NVarChar(100), dept);
    req.input("subdept", sql.NVarChar(100), subdept);
    req.input("emplocation", sql.NVarChar(100), emplocation);
    req.input("designation", sql.NVarChar(100), designation);
    req.input("activeflag", sql.Bit, activeflag);
    req.input("managerid", sql.NVarChar(50), managerid);

    await req.query(`
      INSERT INTO dbo.emp (
        empid, empemail, empname, dept, subdept, emplocation,
        designation, activeflag, managerid
      )
      VALUES (
        @empid, @empemail, @empname, @dept, @subdept, @emplocation,
        @designation, @activeflag, @managerid
      );
    `);

    inserted++;
  }

  console.log(`[EMP-IMPORT] Done. Inserted ${inserted} employee(s).`);
  await sql.close();
}

main().catch((err) => {
  console.error("[EMP-IMPORT] ERROR:", err);
  process.exit(1);
});

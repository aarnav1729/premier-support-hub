"use strict";

// Load env variables
require("dotenv").config();

// Required modules
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const sql = require("mssql");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { body, param, query, validationResult } = require("express-validator");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
// --- Microsoft Graph (email) ---
require("isomorphic-fetch");
const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");

// Express app
const app = express();

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://10.0.50.16:22443",
  "http://10.0.50.111:8080",
  "https://spot.premierenergies.com", // keep / adjust as needed
]);

// Path to built frontend (adjust if your build lives elsewhere, e.g. "../client/dist")
const CLIENT_BUILD_DIR =
  process.env.CLIENT_BUILD_DIR || path.join(__dirname, "..", "dist");

// File uploads (not heavily used here but ready)
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret_in_prod";

// Port
const PORT = Number(process.env.PORT) || 22443;

// --- CORS & middlewares ---
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      req.header("Access-Control-Request-Headers") ||
        "Content-Type, Authorization, X-Requested-With"
    );
  }

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "50mb", strict: true }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(compression());

// --- MSSQL config (DB name changed to 'admin') ---
const mssqlConfig = {
  user: process.env.MSSQL_USER || "PEL_DB",
  password: process.env.MSSQL_PASSWORD || "Pel@0184",
  server: process.env.MSSQL_SERVER || "10.0.50.17",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: process.env.MSSQL_DB || "admin",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

let mssqlPool = null;

// --- MSSQL pool helper ---
async function getPool() {
  if (mssqlPool && mssqlPool.connected) {
    return mssqlPool;
  }
  mssqlPool = await sql.connect(mssqlConfig);
  return mssqlPool;
}

// --- DB schema initialization (CREATE TABLE IF NOT EXISTS) ---
async function initializeDatabase() {
  const pool = await getPool();
  const schemaSql = `
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'emp')
BEGIN
  CREATE TABLE dbo.emp (
    empid INT IDENTITY(1,1) PRIMARY KEY,
    empemail NVARCHAR(255) NOT NULL UNIQUE,
    dept NVARCHAR(100) NULL,
    subdept NVARCHAR(100) NULL,
    emplocation NVARCHAR(100) NULL,
    designation NVARCHAR(100) NULL,
    activeflag BIT NOT NULL DEFAULT 1,
    managerid INT NULL
  );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'hod')
BEGIN
  CREATE TABLE dbo.hod (
    id INT IDENTITY(1,1) PRIMARY KEY,
    dept NVARCHAR(100) NOT NULL,
    subdept NVARCHAR(100) NOT NULL,
    hodid INT NOT NULL
  );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'history')
BEGIN
  CREATE TABLE dbo.history (
    id INT IDENTITY(1,1) PRIMARY KEY,
    ticket_number NVARCHAR(50) NOT NULL,
    user_id NVARCHAR(255) NOT NULL,
    comment NVARCHAR(MAX) NULL,
    action_type NVARCHAR(100) NOT NULL,
    before_state NVARCHAR(MAX) NULL,
    after_state NVARCHAR(MAX) NULL,
    timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_history_ticket_number ON dbo.history(ticket_number);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'mep')
BEGIN
  CREATE TABLE dbo.mep (
    id INT IDENTITY(1,1) PRIMARY KEY,
    ticket_number NVARCHAR(50) NOT NULL UNIQUE,
    empid INT NULL,
    empemail NVARCHAR(255) NOT NULL,
    dept NVARCHAR(100) NULL,
    subdept NVARCHAR(100) NULL,
    emplocation NVARCHAR(100) NULL,
    designation NVARCHAR(100) NULL,
    hod NVARCHAR(255) NULL,
    creation_datetime DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    location NVARCHAR(100) NOT NULL,
    category NVARCHAR(100) NOT NULL,
    area_of_work NVARCHAR(255) NULL,
    attachments NVARCHAR(MAX) NULL,
    description NVARCHAR(MAX) NULL,
    status NVARCHAR(50) NOT NULL DEFAULT 'pending',
    feedback NVARCHAR(MAX) NULL,
    assignee_email NVARCHAR(255) NOT NULL
  );
  CREATE INDEX IX_mep_ticket_number ON dbo.mep(ticket_number);
  CREATE INDEX IX_mep_assignee_email ON dbo.mep(assignee_email);
  CREATE INDEX IX_mep_empemail ON dbo.mep(empemail);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'vr')
BEGIN
  CREATE TABLE dbo.vr (
    id INT IDENTITY(1,1) PRIMARY KEY,
    ticket_number NVARCHAR(50) NOT NULL UNIQUE,
    hod NVARCHAR(255) NULL,
    creation_datetime DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    number_of_people INT NOT NULL,
    employee_or_guest NVARCHAR(20) NOT NULL,
    names NVARCHAR(MAX) NOT NULL,
    pickup_datetime DATETIME2 NOT NULL,
    drop_datetime DATETIME2 NOT NULL,
    contact_number NVARCHAR(50) NOT NULL,
    purpose_of_visit NVARCHAR(MAX) NULL,
    driver_name NVARCHAR(255) NULL,
    driver_number NVARCHAR(50) NULL,
    assignee_email NVARCHAR(255) NOT NULL,
    feedback NVARCHAR(MAX) NULL,
    status NVARCHAR(50) NOT NULL DEFAULT 'pending',
    description NVARCHAR(MAX) NULL,
    attachments NVARCHAR(MAX) NULL,
    user_email NVARCHAR(255) NOT NULL
  );
  CREATE INDEX IX_vr_ticket_number ON dbo.vr(ticket_number);
  CREATE INDEX IX_vr_assignee_email ON dbo.vr(assignee_email);
  CREATE INDEX IX_vr_user_email ON dbo.vr(user_email);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_messages')
BEGIN
  CREATE TABLE dbo.chat_messages (
    id INT IDENTITY(1,1) PRIMARY KEY,
    ticket_number NVARCHAR(50) NOT NULL,
    sender_email NVARCHAR(255) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_chat_messages_ticket_number ON dbo.chat_messages(ticket_number);
END;

IF COL_LENGTH('dbo.chat_messages', 'attachments') IS NULL
BEGIN
  ALTER TABLE dbo.chat_messages
  ADD attachments NVARCHAR(MAX) NULL;
END;

`;
  await pool.request().batch(schemaSql);
  console.log("[DB] Schema ensured.");
}

// --- Validation helper ---
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
}

// --- OTP Store (in-memory for now; could be moved to DB) ---
const otpStore = new Map(); // key: email, value: { hash, expiresAt }

function generateOtpCode() {
  // 6-digit code
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, "0");
}

// --- Auth helpers ---
async function createOtp(email) {
  const code = generateOtpCode();
  const hash = await bcrypt.hash(code, 10);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(email.toLowerCase(), { hash, expiresAt });
  return code;
}

async function verifyOtp(email, code) {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return false;
  }
  const ok = await bcrypt.compare(code, entry.hash);
  if (ok) {
    otpStore.delete(email.toLowerCase());
  }
  return ok;
}

function signToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { email: payload.email };
    next();
  } catch (err) {
    console.error("JWT verify error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// --- HOD helpers / access control ---
const HOD_EMAILS = new Set(
  [
    "aarnav.singh@premierenergies.com",
    "pulkit@premierenergies.com",
    "karthikeyan.m@premierenergies.com",
    "vishnu.hazari@premierenergies.com",
    "taranjeet.a@premierenergies.com",
  ].map((e) => e.toLowerCase())
);

// ---------- MICROSOFT GRAPH MAIL (hardcoded, from sample server) ----------
const GRAPH_CLIENT_ID = "3d310826-2173-44e5-b9a2-b21e940b67f7";
const GRAPH_TENANT_ID = "1c3de7f3-f8d1-41d3-8583-2517cf3ba3b1";
const GRAPH_CLIENT_SECRET = "2e78Q~yX92LfwTTOg4EYBjNQrXr2z5di1Kvebog".replace(
  "rXr",
  "rXrZ"
); // keep exact secret
const GRAPH_SENDER_EMAIL = "spot@premierenergies.com"; // sender mailbox

const graphCredential = new ClientSecretCredential(
  GRAPH_TENANT_ID,
  GRAPH_CLIENT_ID,
  GRAPH_CLIENT_SECRET
);
const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const token = await graphCredential.getToken(
        "https://graph.microsoft.com/.default"
      );
      return token.token;
    },
  },
});

async function sendEmail(to, subject, html, cc = []) {
  const toList = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const ccList = (Array.isArray(cc) ? cc : [cc]).filter(Boolean);
  if (!toList.length) return;

  const message = {
    subject,
    body: { contentType: "HTML", content: html },
    toRecipients: toList.map((address) => ({ emailAddress: { address } })),
    ccRecipients: ccList.map((address) => ({ emailAddress: { address } })),
  };

  await graphClient.api(`/users/${GRAPH_SENDER_EMAIL}/sendMail`).post({
    message,
    saveToSentItems: true,
  });
}

function emailShell({ title, bodyHtml, ctaHtml = "" }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:24px;color:#111;">
    <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e9edf3;border-radius:12px;overflow:hidden">
      <div style="background:#0b5fff;color:#fff;padding:14px 18px;font-weight:600">${title}</div>
      <div style="padding:20px">
        ${bodyHtml}
        ${
          ctaHtml
            ? `<div style="margin-top:16px;text-align:center">${ctaHtml}</div>`
            : ""
        }
      </div>
    </div>
    <div style="max-width:720px;margin:10px auto 0;text-align:center;color:#7b8794;font-size:12px;">
      This is an automated message from Premier Energies (SPOT).
    </div>
  </div>`;
}

function keyvalTable(rows) {
  const tr = rows
    .map(([k, v], i) => {
      const zebra = i % 2 ? "background:#fafbff" : "";
      return `<tr style="${zebra}">
        <td style="padding:10px 12px;border-bottom:1px solid #eef1f6;width:210px;font-weight:600">${k}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef1f6">${
          v ?? "—"
        }</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #e6e8eb;border-radius:8px;overflow:hidden">
    <tbody>${tr}</tbody>
  </table>`;
}

function attachmentsList(origin, atts = []) {
  if (!atts || !atts.length) return "";
  const items = atts
    .map((a) => {
      const href = a.url?.startsWith("http")
        ? a.url
        : `${origin}${a.url || ""}`;
      const sizeKB = a.size != null ? `, ${Math.round(a.size / 1024)} KB` : "";
      return `<li style="margin:6px 0;">
        <a href="${href}" style="color:#0b5fff;text-decoration:none;">${
        a.name || "Attachment"
      }</a>
        <span style="color:#6b7280;font-size:12px"> (${
          a.mime || "file"
        }${sizeKB})</span>
      </li>`;
    })
    .join("");

  return `
  <div style="margin-top:14px">
    <div style="font-weight:600;margin-bottom:6px">Attachments</div>
    <ul style="padding-left:18px;margin:0">${items}</ul>
  </div>`;
}

function formatUtc(dateLike) {
  if (!dateLike) return "—";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return String(dateLike);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function requireHod(req, res, next) {
  const email =
    (req.user && req.user.email && req.user.email.toLowerCase()) || "";
  if (!HOD_EMAILS.has(email)) {
    return res.status(403).json({ error: "Forbidden: HOD access only" });
  }
  next();
}

// --- Helper: MEP assignee based on location ---
function getMEPAssigneeEmail(location) {
  const pepplLocations = new Set([
    "PEPPL",
    "PEIPL-C",
    "Bhagwati-WH",
    "Axonify-WH",
    "Bahadurguda-WH",
    "Kothur-WH", // make sure FE uses the same spelling
  ]);
  if (pepplLocations.has(location)) {
    return "mep.peppl@premierenergies.com";
  }
  return "mep.peipl@premierenergies.com";
}

// --- Helper: generate daily sequential ticket number ---
// Format: PREFIX-YYYYMMDD-XXX (e.g. VR-20251117-001, SR-20251117-002)
async function generateDailyTicketNumber(prefix, tableName) {
  const pool = await getPool();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`; // YYYYMMDD

  const base = `${prefix}-${dateStr}-`;
  const likePattern = `${base}%`;

  const request = pool.request();
  request.input("likePattern", sql.NVarChar(50), likePattern);

  const result = await request.query(`
    SELECT MAX(ticket_number) AS maxTicket
    FROM dbo.${tableName}
    WHERE ticket_number LIKE @likePattern;
  `);

  let nextSeq = 1;
  const row = result.recordset && result.recordset[0];
  if (row && row.maxTicket) {
    const maxTicket = row.maxTicket; // e.g. "VR-20251117-003"
    const suffix = String(maxTicket).slice(base.length); // "003"
    const n = parseInt(suffix, 10);
    if (!Number.isNaN(n)) {
      nextSeq = n + 1;
    }
  }

  const seqStr = String(nextSeq).padStart(3, "0"); // 001, 002, ...
  return `${base}${seqStr}`;
}

// --- History helper ---
async function addHistoryEntry({
  ticketNumber,
  userEmail,
  actionType,
  comment,
  beforeState,
  afterState,
}) {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("ticket_number", sql.NVarChar(50), ticketNumber);
    request.input("user_id", sql.NVarChar(255), userEmail || "system");
    request.input("comment", sql.NVarChar(sql.MAX), comment || null);
    request.input("action_type", sql.NVarChar(100), actionType);
    request.input(
      "before_state",
      sql.NVarChar(sql.MAX),
      beforeState ? JSON.stringify(beforeState) : null
    );
    request.input(
      "after_state",
      sql.NVarChar(sql.MAX),
      afterState ? JSON.stringify(afterState) : null
    );
    await request.query(`
      INSERT INTO dbo.history (ticket_number, user_id, comment, action_type, before_state, after_state)
      VALUES (@ticket_number, @user_id, @comment, @action_type, @before_state, @after_state);
    `);
  } catch (err) {
    console.error("Failed to add history entry:", err);
  }
}

// --- ROUTES ---

// Auth: request OTP
// Auth: request OTP
app.post(
  "/api/auth/request-otp",
  body("email")
    .isEmail()
    .withMessage("Valid email required")
    .bail()
    .custom((value) => {
      const lower = value.toLowerCase();
      if (!lower.endsWith("@premierenergies.com")) {
        throw new Error("Email must be @premierenergies.com");
      }
      return true;
    }),
  handleValidationErrors,
  async (req, res) => {
    const email = req.body.email.toLowerCase();
    try {
      const otp = await createOtp(email);
      console.log(`[OTP] Generated OTP for ${email}: ${otp}`);

      // --- Beautiful OTP email (non-blocking) ---
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        const otpTable = keyvalTable([
          ["Email", email],
          [
            "One-Time Password",
            `<span style="font-size:20px;font-weight:700;">${otp}</span>`,
          ],
          ["Valid For", "5 minutes"],
          [
            "Requested At (UTC)",
            new Date().toISOString().replace("T", " ").slice(0, 19),
          ],
          [
            "Login Portal",
            `<a href="${origin}" style="color:#0b5fff;text-decoration:none;">${origin}</a>`,
          ],
        ]);

        const bodyHtml = `
          <p>Hello,</p>
          <p>Your one-time password (OTP) for <b>SPOT:Ticketing Portal</b> is:</p>
          ${otpTable}
          <p style="margin-top:14px;color:#6b7280;font-size:13px;">
            Do not share this code with anyone. If you did not try to log in, you can safely ignore this email.
          </p>
        `;

        const html = emailShell({
          title: "🔐 SPOT Login OTP",
          bodyHtml,
        });

        // Fire and forget
        sendEmail(email, "SPOT Login OTP", html).catch((err) => {
          console.warn("[mail] OTP email failed:", err?.message || err);
        });
      } catch (mailErr) {
        console.warn(
          "[mail] OTP email build/send failed:",
          mailErr?.message || mailErr
        );
      }

      // Keep current behavior (OTP in response) for now
      return res.json({
        success: true,
        email,
        otp,
        message:
          "OTP generated and emailed. For production, remove OTP from API response.",
      });
    } catch (err) {
      console.error("request-otp error:", err);
      return res.status(500).json({ error: "Failed to generate OTP" });
    }
  }
);

function buildMepDetailsTable(ticket) {
  return keyvalTable([
    ["Ticket Type", "MEP – Service Request"],
    ["Ticket #", ticket.ticket_number],
    ["Status", ticket.status],
    ["Employee Email", ticket.empemail],
    ["Department", ticket.dept || "—"],
    ["Sub-Department", ticket.subdept || "—"],
    ["Employee Location", ticket.emplocation || "—"],
    ["Location (Issue)", ticket.location || "—"],
    ["Category", ticket.category || "—"],
    ["Area of Work", ticket.area_of_work || "—"],
    ["Created At", formatUtc(ticket.creation_datetime)],
    ["Assignee", ticket.assignee_email || "—"],
    ["Description", ticket.description || "—"],
  ]);
}

function buildVrDetailsTable(ticket) {
  const names =
    typeof ticket.names === "string"
      ? ticket.names
      : Array.isArray(ticket.names)
      ? ticket.names.join(", ")
      : "—";

  return keyvalTable([
    ["Ticket Type", "VR – Vehicle Request"],
    ["Ticket #", ticket.ticket_number],
    ["Status", ticket.status],
    ["Requested By", ticket.user_email],
    ["Employee / Guest", ticket.employee_or_guest],
    ["Number of People", String(ticket.number_of_people)],
    ["Names", names || "—"],
    ["Contact Number", ticket.contact_number || "—"],
    ["Purpose of Visit", ticket.purpose_of_visit || "—"],
    ["Pickup", formatUtc(ticket.pickup_datetime)],
    ["Drop", formatUtc(ticket.drop_datetime)],
    ["Assignee", ticket.assignee_email || "—"],
    ["Driver Name", ticket.driver_name || "—"],
    ["Driver Number", ticket.driver_number || "—"],
    ["Description", ticket.description || "—"],
  ]);
}

// Auth: verify OTP
app.post(
  "/api/auth/verify-otp",
  body("email").isEmail().withMessage("Valid email required"),
  body("otp").isLength({ min: 4 }).withMessage("OTP required"),
  handleValidationErrors,
  async (req, res) => {
    const email = req.body.email.toLowerCase();
    const otp = req.body.otp.trim();
    try {
      const ok = await verifyOtp(email, otp);
      if (!ok) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }
      const token = signToken(email);
      res.cookie("auth_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, email });
    } catch (err) {
      console.error("verify-otp error:", err);
      return res.status(500).json({ error: "Failed to verify OTP" });
    }
  }
);

// Auth: logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("auth_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res.json({ success: true });
});

// Auth: current user
app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({ email: req.user.email });
});

// EMP: details for current user
app.get("/api/emp/me", requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("empemail", sql.NVarChar(255), req.user.email.toLowerCase());
    const result = await request.query(`
      SELECT TOP 1 empid, empemail, dept, subdept, emplocation, designation, activeflag, managerid
      FROM dbo.emp
      WHERE empemail = @empemail AND activeflag = 1;
    `);
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: "Employee not found or inactive" });
    }
    return res.json(result.recordset[0]);
  } catch (err) {
    console.error("GET /api/emp/me error:", err);
    return res.status(500).json({ error: "Failed to fetch employee" });
  }
});

// --- MEP TICKETS ---

// Create MEP
app.post(
  "/api/mep",
  requireAuth,
  body("location").isString().notEmpty(),
  body("category").isString().notEmpty(),
  body("area_of_work").optional().isString(),
  body("description").optional().isString(),
  body("attachments").optional(), // could be JSON/base64
  handleValidationErrors,
  async (req, res) => {
    const { location, category, area_of_work, description, attachments } =
      req.body;
    const userEmail = req.user.email.toLowerCase();
    const ticketNumber = await generateDailyTicketNumber("SR", "mep");

    try {
      const pool = await getPool();
      const request = pool.request();

      // Fetch employee details
      request.input("empemail", sql.NVarChar(255), userEmail);
      let empResult = await request.query(`
        SELECT TOP 1 empid, empemail, dept, subdept, emplocation, designation, activeflag, managerid
        FROM dbo.emp
        WHERE empemail = @empemail AND activeflag = 1;
      `);
      const emp = empResult.recordset && empResult.recordset[0];

      // Fetch HOD based on dept/subdept if available
      let hodValue = null;
      if (emp && emp.dept && emp.subdept) {
        const hodReq = pool.request();
        hodReq.input("dept", sql.NVarChar(100), emp.dept);
        hodReq.input("subdept", sql.NVarChar(100), emp.subdept);
        const hodRes = await hodReq.query(`
          SELECT TOP 1 hodid
          FROM dbo.hod
          WHERE dept = @dept AND subdept = @subdept;
        `);
        if (hodRes.recordset && hodRes.recordset[0]) {
          hodValue = String(hodRes.recordset[0].hodid);
        }
      }

      const assigneeEmail = getMEPAssigneeEmail(location);

      const insertReq = pool.request();
      insertReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      
      // empid now supports alphanumerics like "PEPPL0001"
      const empIdValue =
        emp && emp.empid != null ? String(emp.empid).trim() : null;
      insertReq.input("empid", sql.NVarChar(50), empIdValue);
      
      insertReq.input("empemail", sql.NVarChar(255), userEmail);
      insertReq.input("dept", sql.NVarChar(100), emp ? emp.dept : null);
      insertReq.input("subdept", sql.NVarChar(100), emp ? emp.subdept : null);
      insertReq.input(
        "emplocation",
        sql.NVarChar(100),
        emp ? emp.emplocation : null
      );
      insertReq.input(
        "designation",
        sql.NVarChar(100),
        emp ? emp.designation : null
      );
      
      insertReq.input("hod", sql.NVarChar(255), hodValue);
      insertReq.input("location", sql.NVarChar(100), location);
      insertReq.input("category", sql.NVarChar(100), category);
      insertReq.input("area_of_work", sql.NVarChar(255), area_of_work || null);
      insertReq.input(
        "attachments",
        sql.NVarChar(sql.MAX),
        attachments ? JSON.stringify(attachments) : null
      );
      insertReq.input(
        "description",
        sql.NVarChar(sql.MAX),
        description || null
      );
      insertReq.input("status", sql.NVarChar(50), "pending");
      insertReq.input(
        "assignee_email",
        sql.NVarChar(255),
        assigneeEmail.toLowerCase()
      );

      const insertResult = await insertReq.query(`
        INSERT INTO dbo.mep (
          ticket_number, empid, empemail, dept, subdept, emplocation,
          designation, hod, location, category, area_of_work, attachments,
          description, status, assignee_email
        )
        OUTPUT INSERTED.*
        VALUES (
          @ticket_number, @empid, @empemail, @dept, @subdept, @emplocation,
          @designation, @hod, @location, @category, @area_of_work, @attachments,
          @description, @status, @assignee_email
        );
      `);

      const created = insertResult.recordset[0];

      await addHistoryEntry({
        ticketNumber,
        userEmail,
        actionType: "CREATE_MEP",
        comment: "MEP ticket created",
        beforeState: null,
        afterState: created,
      });

      // --- Email notifications (non-blocking) ---
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        let attachments = [];
        if (created.attachments) {
          try {
            attachments = JSON.parse(created.attachments);
          } catch {
            attachments = [];
          }
        }

        const detailsTable = buildMepDetailsTable(created);
        const attsHtml = attachmentsList(origin, attachments);

        // To requester
        const bodyRequester = `
          <p>Hello,</p>
          <p>Your <b>MEP ticket</b> has been created in <b>SPOT</b>.</p>
          ${detailsTable}
          ${attsHtml}
        `;
        const htmlRequester = emailShell({
          title: "📩 SPOT: MEP Ticket Created",
          bodyHtml: bodyRequester,
          ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">Open SPOT Dashboard</a>`,
        });
        sendEmail(
          created.empemail,
          `SPOT: MEP Ticket Created (${created.ticket_number})`,
          htmlRequester
        ).catch((err) =>
          console.warn(
            "[mail] MEP create (requester) failed:",
            err?.message || err
          )
        );

        // To assignee
        const bodyAssignee = `
          <p>Hello,</p>
          <p>A new <b>MEP ticket</b> has been assigned to you.</p>
          ${detailsTable}
          ${attsHtml}
        `;
        const htmlAssignee = emailShell({
          title: "🛠️ New MEP Ticket Assigned",
          bodyHtml: bodyAssignee,
          ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">View Ticket</a>`,
        });
        sendEmail(
          created.assignee_email,
          `SPOT:New MEP Ticket (${created.ticket_number})`,
          htmlAssignee,
          [created.empemail]
        ).catch((err) =>
          console.warn(
            "[mail] MEP create (assignee) failed:",
            err?.message || err
          )
        );
      } catch (mailErr) {
        console.warn(
          "[mail] MEP create email block failed:",
          mailErr?.message || mailErr
        );
      }

      return res.status(201).json(created);
    } catch (err) {
      console.error("POST /api/mep error:", err);
      return res.status(500).json({ error: "Failed to create MEP ticket" });
    }
  }
);

// List MEP (scope=mine|assigned, status optional)
app.get(
  "/api/mep",
  requireAuth,
  query("scope").optional().isIn(["mine", "assigned"]),
  query("status").optional().isString(),
  handleValidationErrors,
  async (req, res) => {
    const scope = req.query.scope || "mine";
    const status = req.query.status;
    const email = req.user.email.toLowerCase();

    try {
      const pool = await getPool();
      const request = pool.request();

      let whereClauses = [];
      if (scope === "mine") {
        request.input("empemail", sql.NVarChar(255), email);
        whereClauses.push("empemail = @empemail");
      } else if (scope === "assigned") {
        request.input("assignee_email", sql.NVarChar(255), email);
        whereClauses.push("assignee_email = @assignee_email");
      }

      if (status) {
        request.input("status", sql.NVarChar(50), status);
        whereClauses.push("status = @status");
      }

      const whereSql =
        whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

      const result = await request.query(`
        SELECT
          ticket_number,
          empid,
          empemail,
          dept,
          subdept,
          emplocation,
          designation,
          hod,
          creation_datetime,
          location,
          category,
          area_of_work,
          attachments,
          description,
          status,
          feedback,
          assignee_email
        FROM dbo.mep
        ${whereSql}
        ORDER BY creation_datetime DESC;
      `);

      return res.json(result.recordset || []);
    } catch (err) {
      console.error("GET /api/mep error:", err);
      return res.status(500).json({ error: "Failed to fetch MEP tickets" });
    }
  }
);

// Get single MEP
app.get(
  "/api/mep/:ticketNumber",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    try {
      const pool = await getPool();
      const request = pool.request();
      request.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const result = await request.query(`
        SELECT
          ticket_number,
          empid,
          empemail,
          dept,
          subdept,
          emplocation,
          designation,
          hod,
          creation_datetime,
          location,
          category,
          area_of_work,
          attachments,
          description,
          status,
          feedback,
          assignee_email
        FROM dbo.mep
        WHERE ticket_number = @ticket_number;
      `);
      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: "MEP ticket not found" });
      }
      return res.json(result.recordset[0]);
    } catch (err) {
      console.error("GET /api/mep/:ticketNumber error:", err);
      return res.status(500).json({ error: "Failed to fetch MEP ticket" });
    }
  }
);

// Update MEP status
app.patch(
  "/api/mep/:ticketNumber/status",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  body("status")
    .isString()
    .isIn(["pending", "in_progress", "completed", "rejected"]),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const newStatus = req.body.status;
    const userEmail = req.user.email.toLowerCase();
    try {
      const pool = await getPool();

      // Get existing
      const getReq = pool.request();
      getReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const existingRes = await getReq.query(`
        SELECT *
        FROM dbo.mep
        WHERE ticket_number = @ticket_number;
      `);
      if (!existingRes.recordset || existingRes.recordset.length === 0) {
        return res.status(404).json({ error: "MEP ticket not found" });
      }
      const existing = existingRes.recordset[0];

      // Update
      const updateReq = pool.request();
      updateReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      updateReq.input("status", sql.NVarChar(50), newStatus);
      const updateRes = await updateReq.query(`
        UPDATE dbo.mep
        SET status = @status
        OUTPUT INSERTED.*
        WHERE ticket_number = @ticket_number;
      `);
      const updated = updateRes.recordset[0];

      await addHistoryEntry({
        ticketNumber,
        userEmail,
        actionType: "UPDATE_MEP_STATUS",
        comment: `Status changed to ${newStatus}`,
        beforeState: { status: existing.status },
        afterState: { status: updated.status },
      });

      // --- Email notification for status update (non-blocking) ---
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        const detailsTable = buildMepDetailsTable(updated);

        const statusTable = keyvalTable([
          ["Ticket #", updated.ticket_number],
          ["Previous Status", existing.status],
          ["New Status", updated.status],
          ["Changed By", userEmail],
          ["Changed At (UTC)", formatUtc(new Date())],
        ]);

        const bodyHtml = `
          <p>Hello,</p>
          <p>The status of your <b>MEP ticket</b> has been updated in <b>SPOT</b>.</p>
          ${statusTable}
          <div style="height:12px"></div>
          ${detailsTable}
        `;

        const html = emailShell({
          title: "🔁 SPOT: MEP Ticket Status Updated",
          bodyHtml,
          ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">View Ticket</a>`,
        });

        const recipients = [updated.empemail, updated.assignee_email].filter(
          Boolean
        );
        sendEmail(
          recipients,
          `SPOT: MEP Status Updated (${updated.ticket_number})`,
          html
        ).catch((err) =>
          console.warn("[mail] MEP status email failed:", err?.message || err)
        );
      } catch (mailErr) {
        console.warn(
          "[mail] MEP status email block failed:",
          mailErr?.message || mailErr
        );
      }

      return res.json(updated);
    } catch (err) {
      console.error("PATCH /api/mep/:ticketNumber/status error:", err);
      return res.status(500).json({ error: "Failed to update MEP status" });
    }
  }
);

// Update MEP feedback
app.patch(
  "/api/mep/:ticketNumber/feedback",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  body("feedback").isString().notEmpty(),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const feedback = req.body.feedback;
    const userEmail = req.user.email.toLowerCase();

    try {
      const pool = await getPool();
      const getReq = pool.request();
      getReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const existingRes = await getReq.query(`
        SELECT *
        FROM dbo.mep
        WHERE ticket_number = @ticket_number;
      `);
      if (!existingRes.recordset || existingRes.recordset.length === 0) {
        return res.status(404).json({ error: "MEP ticket not found" });
      }
      const existing = existingRes.recordset[0];

      const updateReq = pool.request();
      updateReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      updateReq.input("feedback", sql.NVarChar(sql.MAX), feedback);
      const updateRes = await updateReq.query(`
        UPDATE dbo.mep
        SET feedback = @feedback
        OUTPUT INSERTED.*
        WHERE ticket_number = @ticket_number;
      `);
      const updated = updateRes.recordset[0];

      await addHistoryEntry({
        ticketNumber,
        userEmail,
        actionType: "UPDATE_MEP_FEEDBACK",
        comment: "Feedback added/updated",
        beforeState: { feedback: existing.feedback },
        afterState: { feedback: updated.feedback },
      });

      return res.json(updated);
    } catch (err) {
      console.error("PATCH /api/mep/:ticketNumber/feedback error:", err);
      return res.status(500).json({ error: "Failed to update feedback" });
    }
  }
);

// --- VR TICKETS ---

// Create VR
app.post(
  "/api/vr",
  requireAuth,
  body("number_of_people").isInt({ min: 1 }),
  body("employee_or_guest").isIn(["employee", "guest"]),
  body("names").isArray().withMessage("names must be an array"),
  body("pickup_datetime").isISO8601(),
  body("drop_datetime").isISO8601(),
  body("contact_number").isString().notEmpty(),
  body("purpose_of_visit").optional().isString(),
  body("description").optional().isString(),
  body("attachments").optional(),
  handleValidationErrors,
  async (req, res) => {
    const {
      number_of_people,
      employee_or_guest,
      names,
      pickup_datetime,
      drop_datetime,
      contact_number,
      purpose_of_visit,
      description,
      attachments,
    } = req.body;
    const userEmail = req.user.email.toLowerCase();
    const ticketNumber = await generateDailyTicketNumber("VR", "vr");

    if (names.length !== Number(number_of_people)) {
      return res.status(400).json({
        error:
          "names array length must match number_of_people (populate one name per person)",
      });
    }

    try {
      const pool = await getPool();

      // Determine HOD based on emp if desired (similar to MEP)
      const empReq = pool.request();
      empReq.input("empemail", sql.NVarChar(255), userEmail);
      const empRes = await empReq.query(`
        SELECT TOP 1 empid, empemail, dept, subdept, managerid
        FROM dbo.emp
        WHERE empemail = @empemail AND activeflag = 1;
      `);

      const emp = empRes.recordset && empRes.recordset[0];

      let hodValue = null;
      if (emp && emp.dept && emp.subdept) {
        const hodReq = pool.request();
        hodReq.input("dept", sql.NVarChar(100), emp.dept);
        hodReq.input("subdept", sql.NVarChar(100), emp.subdept);
        const hodRes = await hodReq.query(`
          SELECT TOP 1 hodid
          FROM dbo.hod
          WHERE dept = @dept AND subdept = @subdept;
        `);
        if (hodRes.recordset && hodRes.recordset[0]) {
          hodValue = String(hodRes.recordset[0].hodid);
        }
      }

      // --- NEW: manager sign-off routing ---
      const transportEmail = "krishnaiah.donta@premierenergies.com";
      let managerEmail = null;

      // If emp has a managerid, look up the manager's email
      if (emp && emp.managerid != null) {
        const mgrReq = pool.request();
        // managerid / empid are NVARCHAR(50) in the new emp schema
        mgrReq.input(
          "managerid",
          sql.NVarChar(50),
          String(emp.managerid).trim()
        );

        const mgrRes = await mgrReq.query(`
          SELECT TOP 1 empemail
          FROM dbo.emp
          WHERE empid = @managerid AND activeflag = 1;
        `);

        if (mgrRes.recordset && mgrRes.recordset[0]) {
          managerEmail = (mgrRes.recordset[0].empemail || "").toLowerCase();
        }
      }

      // If manager exists -> first assignee is manager, else fallback to transport
      const initialAssigneeEmail = managerEmail || transportEmail.toLowerCase();
      const initialStatus = managerEmail ? "pending_manager" : "pending";
      // --- END NEW ---

      const insertReq = pool.request();
      insertReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      insertReq.input("hod", sql.NVarChar(255), hodValue);
      insertReq.input("number_of_people", sql.Int, Number(number_of_people));
      insertReq.input("employee_or_guest", sql.NVarChar(20), employee_or_guest);
      insertReq.input(
        "names",
        sql.NVarChar(sql.MAX),
        JSON.stringify(names || [])
      );
      insertReq.input(
        "pickup_datetime",
        sql.DateTime2,
        new Date(pickup_datetime)
      );
      insertReq.input("drop_datetime", sql.DateTime2, new Date(drop_datetime));
      insertReq.input("contact_number", sql.NVarChar(50), contact_number);
      insertReq.input(
        "purpose_of_visit",
        sql.NVarChar(sql.MAX),
        purpose_of_visit || null
      );
      insertReq.input(
        "description",
        sql.NVarChar(sql.MAX),
        description || null
      );
      insertReq.input(
        "attachments",
        sql.NVarChar(sql.MAX),
        attachments ? JSON.stringify(attachments) : null
      );
      insertReq.input(
        "assignee_email",
        sql.NVarChar(255),
        initialAssigneeEmail
      );
      insertReq.input("status", sql.NVarChar(50), initialStatus);

      insertReq.input("user_email", sql.NVarChar(255), userEmail);

      const insertRes = await insertReq.query(`
        INSERT INTO dbo.vr (
          ticket_number, hod, number_of_people, employee_or_guest, names,
          pickup_datetime, drop_datetime, contact_number, purpose_of_visit,
          driver_name, driver_number, assignee_email, feedback, status,
          description, attachments, user_email
        )
        OUTPUT INSERTED.*
        VALUES (
          @ticket_number, @hod, @number_of_people, @employee_or_guest, @names,
          @pickup_datetime, @drop_datetime, @contact_number, @purpose_of_visit,
          NULL, NULL, @assignee_email, NULL, @status,
          @description, @attachments, @user_email
        );
      `);

      const created = insertRes.recordset[0];

      await addHistoryEntry({
        ticketNumber,
        userEmail,
        actionType: "CREATE_VR",
        comment: "Vehicle request created",
        beforeState: null,
        afterState: created,
      });

      // --- Email notifications (non-blocking) ---
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        let atts = [];
        if (created.attachments) {
          try {
            atts = JSON.parse(created.attachments);
          } catch {
            atts = [];
          }
        }

        // Parse names for email tables
        let namesParsed = created.names;
        if (namesParsed) {
          try {
            namesParsed = JSON.parse(namesParsed);
          } catch {
            // ignore
          }
        }
        const ticketForEmail = { ...created, names: namesParsed };

        const detailsTable = buildVrDetailsTable(ticketForEmail);
        const attsHtml = attachmentsList(origin, atts);

        // To requester
        const bodyRequester = `
          <p>Hello,</p>
          <p>Your <b>Vehicle Request</b> has been created in <b>SPOT</b>.</p>
          ${detailsTable}
          ${attsHtml}
        `;
        const htmlRequester = emailShell({
          title: "🚗 SPOT: Vehicle Request Created",
          bodyHtml: bodyRequester,
          ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">Open SPOT Dashboard</a>`,
        });
        sendEmail(
          created.user_email,
          `SPOT: VR Ticket Created (${created.ticket_number})`,
          htmlRequester
        ).catch((err) =>
          console.warn(
            "[mail] VR create (requester) failed:",
            err?.message || err
          )
        );

        // To initial assignee (manager or transport)
        const bodyAssignee = `
          <p>Hello,</p>
          <p>A new <b>Vehicle Request</b> requires your attention.</p>
          ${detailsTable}
          ${attsHtml}
        `;
        const htmlAssignee = emailShell({
          title: "New Vehicle Request Assigned",
          bodyHtml: bodyAssignee,
          ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">View Request</a>`,
        });
        sendEmail(
          created.assignee_email,
          `SPOT: New VR Ticket (${created.ticket_number})`,
          htmlAssignee,
          [created.user_email]
        ).catch((err) =>
          console.warn(
            "[mail] VR create (assignee) failed:",
            err?.message || err
          )
        );
      } catch (mailErr) {
        console.warn(
          "[mail] VR create email block failed:",
          mailErr?.message || mailErr
        );
      }

      // Parse names JSON before sending back
      if (created.names) {
        try {
          created.names = JSON.parse(created.names);
        } catch {
          // ignore
        }
      }

      return res.status(201).json(created);
    } catch (err) {
      console.error("POST /api/vr error:", err);
      return res.status(500).json({ error: "Failed to create VR ticket" });
    }
  }
);

// List VR (scope=mine|assigned, status optional)
app.get(
  "/api/vr",
  requireAuth,
  query("scope").optional().isIn(["mine", "assigned"]),
  query("status").optional().isString(),
  handleValidationErrors,
  async (req, res) => {
    const scope = req.query.scope || "mine";
    const status = req.query.status;
    const email = req.user.email.toLowerCase();

    try {
      const pool = await getPool();
      const request = pool.request();

      let whereClauses = [];
      if (scope === "mine") {
        request.input("user_email", sql.NVarChar(255), email);
        whereClauses.push("user_email = @user_email");
      } else if (scope === "assigned") {
        request.input("assignee_email", sql.NVarChar(255), email);
        whereClauses.push("assignee_email = @assignee_email");
      }

      if (status) {
        request.input("status", sql.NVarChar(50), status);
        whereClauses.push("status = @status");
      }

      const whereSql =
        whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

      const result = await request.query(`
        SELECT
          ticket_number,
          hod,
          creation_datetime,
          number_of_people,
          employee_or_guest,
          names,
          pickup_datetime,
          drop_datetime,
          contact_number,
          purpose_of_visit,
          driver_name,
          driver_number,
          assignee_email,
          feedback,
          status,
          description,
          attachments,
          user_email
        FROM dbo.vr
        ${whereSql}
        ORDER BY creation_datetime DESC;
      `);

      const rows = (result.recordset || []).map((row) => {
        if (row.names) {
          try {
            row.names = JSON.parse(row.names);
          } catch {
            // leave as string if parse fails
          }
        }
        return row;
      });

      return res.json(rows);
    } catch (err) {
      console.error("GET /api/vr error:", err);
      return res.status(500).json({ error: "Failed to fetch VR tickets" });
    }
  }
);

// Get single VR
app.get(
  "/api/vr/:ticketNumber",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    try {
      const pool = await getPool();
      const request = pool.request();
      request.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const result = await request.query(`
        SELECT
          ticket_number,
          hod,
          creation_datetime,
          number_of_people,
          employee_or_guest,
          names,
          pickup_datetime,
          drop_datetime,
          contact_number,
          purpose_of_visit,
          driver_name,
          driver_number,
          assignee_email,
          feedback,
          status,
          description,
          attachments,
          user_email
        FROM dbo.vr
        WHERE ticket_number = @ticket_number;
      `);
      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: "VR ticket not found" });
      }
      const row = result.recordset[0];
      if (row.names) {
        try {
          row.names = JSON.parse(row.names);
        } catch {
          // ignore
        }
      }
      return res.json(row);
    } catch (err) {
      console.error("GET /api/vr/:ticketNumber error:", err);
      return res.status(500).json({ error: "Failed to fetch VR ticket" });
    }
  }
);

// Update VR status
app.patch(
  "/api/vr/:ticketNumber/status",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  body("status")
    .isString()
    .isIn([
      "pending_manager",
      "pending",
      "in_progress",
      "completed",
      "rejected",
    ]),

  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const newStatus = req.body.status;
    const userEmail = req.user.email.toLowerCase();

    try {
      const pool = await getPool();
      const getReq = pool.request();
      getReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const existingRes = await getReq.query(`
        SELECT *
        FROM dbo.vr
        WHERE ticket_number = @ticket_number;
      `);
      if (!existingRes.recordset || existingRes.recordset.length === 0) {
        return res.status(404).json({ error: "VR ticket not found" });
      }
      const existing = existingRes.recordset[0];

      const transportEmail = "krishnaiah.donta@premierenergies.com";

      // Is this the manager approving and forwarding?
      const isManagerApproval =
        existing.status === "pending_manager" && newStatus === "pending";

      const updateReq = pool.request();
      updateReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      updateReq.input("status", sql.NVarChar(50), newStatus);

      if (isManagerApproval) {
        updateReq.input(
          "assignee_email",
          sql.NVarChar(255),
          transportEmail.toLowerCase()
        );
      }

      const updateRes = await updateReq.query(`
  UPDATE dbo.vr
  SET
    status = @status
    ${isManagerApproval ? ", assignee_email = @assignee_email" : ""}
  OUTPUT INSERTED.*
  WHERE ticket_number = @ticket_number;
`);

      const updated = updateRes.recordset[0];

      await addHistoryEntry({
        ticketNumber,
        userEmail,
        actionType: "UPDATE_VR_STATUS",
        comment: `Status changed to ${newStatus}`,
        beforeState: { status: existing.status },
        afterState: { status: updated.status },
      });

      // --- Email notification for VR status update / approvals ---
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        let namesParsed = updated.names;
        if (namesParsed) {
          try {
            namesParsed = JSON.parse(namesParsed);
          } catch {
            // ignore
          }
        }
        const ticketForEmail = { ...updated, names: namesParsed };
        const detailsTable = buildVrDetailsTable(ticketForEmail);

        const statusTable = keyvalTable([
          ["Ticket #", updated.ticket_number],
          ["Previous Status", existing.status],
          ["New Status", updated.status],
          ["Changed By", userEmail],
          ["Changed At (UTC)", formatUtc(new Date())],
        ]);

        let title = "🔁 SPOT: VR Ticket Status Updated";
        let subject = `SPOT: VR Status Updated (${updated.ticket_number})`;
        if (isManagerApproval) {
          title = "✅ SPOT: VR Request Approved by Manager";
          subject = `SPOT: VR Manager Approval (${updated.ticket_number})`;
        }

        const bodyHtml = `
    <p>Hello,</p>
    <p>The status of your <b>Vehicle Request</b> has been updated in <b>SPOT</b>.</p>
    ${statusTable}
    <div style="height:12px"></div>
    ${detailsTable}
  `;

        const html = emailShell({
          title,
          bodyHtml,
          ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">View Request</a>`,
        });

        const recipients = [updated.user_email, updated.assignee_email].filter(
          Boolean
        );
        sendEmail(recipients, subject, html).catch((err) =>
          console.warn("[mail] VR status email failed:", err?.message || err)
        );
      } catch (mailErr) {
        console.warn(
          "[mail] VR status email block failed:",
          mailErr?.message || mailErr
        );
      }

      if (updated.names) {
        try {
          updated.names = JSON.parse(updated.names);
        } catch {
          // ignore
        }
      }

      return res.json(updated);
    } catch (err) {
      console.error("PATCH /api/vr/:ticketNumber/status error:", err);
      return res.status(500).json({ error: "Failed to update VR status" });
    }
  }
);

// Update VR driver details
app.patch(
  "/api/vr/:ticketNumber/driver",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  body("driver_name").isString().notEmpty(),
  body("driver_number").isString().notEmpty(),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const { driver_name, driver_number } = req.body;
    const userEmail = req.user.email.toLowerCase();

    try {
      const pool = await getPool();
      const getReq = pool.request();
      getReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const existingRes = await getReq.query(`
        SELECT *
        FROM dbo.vr
        WHERE ticket_number = @ticket_number;
      `);
      if (!existingRes.recordset || existingRes.recordset.length === 0) {
        return res.status(404).json({ error: "VR ticket not found" });
      }
      const existing = existingRes.recordset[0];

      const updateReq = pool.request();
      updateReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      updateReq.input("driver_name", sql.NVarChar(255), driver_name);
      updateReq.input("driver_number", sql.NVarChar(50), driver_number);
      const updateRes = await updateReq.query(`
        UPDATE dbo.vr
        SET driver_name = @driver_name,
            driver_number = @driver_number
        OUTPUT INSERTED.*
        WHERE ticket_number = @ticket_number;
      `);
      const updated = updateRes.recordset[0];

      await addHistoryEntry({
        ticketNumber,
        userEmail,
        actionType: "UPDATE_VR_DRIVER",
        comment: "Driver details updated",
        beforeState: {
          driver_name: existing.driver_name,
          driver_number: existing.driver_number,
        },
        afterState: {
          driver_name: updated.driver_name,
          driver_number: updated.driver_number,
        },
      });

      // --- Email: driver details assigned/updated ---
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        let namesParsed = updated.names;
        if (namesParsed) {
          try {
            namesParsed = JSON.parse(namesParsed);
          } catch {
            // ignore
          }
        }
        const ticketForEmail = { ...updated, names: namesParsed };
        const detailsTable = buildVrDetailsTable(ticketForEmail);

        const driverTable = keyvalTable([
          ["Ticket #", updated.ticket_number],
          ["Driver Name", updated.driver_name],
          ["Driver Number", updated.driver_number],
          ["Updated By", userEmail],
          ["Updated At (UTC)", formatUtc(new Date())],
        ]);

        const bodyHtml = `
          <p>Hello,</p>
          <p>Driver details have been updated for your <b>Vehicle Request</b>.</p>
          ${driverTable}
          <div style="height:12px"></div>
          ${detailsTable}
        `;

        const html = emailShell({
          title: "🚗 SPOT: Driver Assigned/Updated",
          bodyHtml,
          ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">View Request</a>`,
        });

        sendEmail(
          updated.user_email,
          `SPOT: Driver Details Updated (${updated.ticket_number})`,
          html
        ).catch((err) =>
          console.warn("[mail] VR driver email failed:", err?.message || err)
        );
      } catch (mailErr) {
        console.warn(
          "[mail] VR driver email block failed:",
          mailErr?.message || mailErr
        );
      }

      if (updated.names) {
        try {
          updated.names = JSON.parse(updated.names);
        } catch {
          // ignore
        }
      }

      return res.json(updated);
    } catch (err) {
      console.error("PATCH /api/vr/:ticketNumber/driver error:", err);
      return res.status(500).json({ error: "Failed to update driver details" });
    }
  }
);

// Update VR feedback
app.patch(
  "/api/vr/:ticketNumber/feedback",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  body("feedback").isString().notEmpty(),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const feedback = req.body.feedback;
    const userEmail = req.user.email.toLowerCase();

    try {
      const pool = await getPool();
      const getReq = pool.request();
      getReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const existingRes = await getReq.query(`
        SELECT *
        FROM dbo.vr
        WHERE ticket_number = @ticket_number;
      `);
      if (!existingRes.recordset || existingRes.recordset.length === 0) {
        return res.status(404).json({ error: "VR ticket not found" });
      }
      const existing = existingRes.recordset[0];

      const updateReq = pool.request();
      updateReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      updateReq.input("feedback", sql.NVarChar(sql.MAX), feedback);
      const updateRes = await updateReq.query(`
        UPDATE dbo.vr
        SET feedback = @feedback
        OUTPUT INSERTED.*
        WHERE ticket_number = @ticket_number;
      `);
      const updated = updateRes.recordset[0];

      await addHistoryEntry({
        ticketNumber,
        userEmail,
        actionType: "UPDATE_VR_FEEDBACK",
        comment: "Feedback added/updated",
        beforeState: { feedback: existing.feedback },
        afterState: { feedback: updated.feedback },
      });

      if (updated.names) {
        try {
          updated.names = JSON.parse(updated.names);
        } catch {
          // ignore
        }
      }

      return res.json(updated);
    } catch (err) {
      console.error("PATCH /api/vr/:ticketNumber/feedback error:", err);
      return res.status(500).json({ error: "Failed to update feedback" });
    }
  }
);

// --- HISTORY ---

app.get(
  "/api/history/:ticketNumber",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    try {
      const pool = await getPool();
      const request = pool.request();
      request.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const result = await request.query(`
        SELECT
          id,
          ticket_number,
          user_id,
          comment,
          action_type,
          before_state,
          after_state,
          timestamp
        FROM dbo.history
        WHERE ticket_number = @ticket_number
        ORDER BY timestamp ASC;
      `);
      const rows = (result.recordset || []).map((row) => {
        return {
          ...row,
          before_state: row.before_state ? JSON.parse(row.before_state) : null,
          after_state: row.after_state ? JSON.parse(row.after_state) : null,
        };
      });
      return res.json(rows);
    } catch (err) {
      console.error("GET /api/history/:ticketNumber error:", err);
      return res.status(500).json({ error: "Failed to fetch history" });
    }
  }
);

// --- CHAT (REST, frontend can poll) ---

// Get chat messages for ticket
// Get chat messages for ticket
app.get(
  "/api/chat/:ticketNumber",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    try {
      const pool = await getPool();
      const request = pool.request();
      request.input("ticket_number", sql.NVarChar(50), ticketNumber);
      const result = await request.query(`
        SELECT TOP 200
          id,
          ticket_number,
          sender_email,
          message,
          attachments,
          created_at
        FROM dbo.chat_messages
        WHERE ticket_number = @ticket_number
        ORDER BY created_at ASC, id ASC;
      `);

      const rows = (result.recordset || []).map((row) => {
        let parsedAttachments = null;
        if (row.attachments) {
          try {
            parsedAttachments = JSON.parse(row.attachments);
          } catch {
            parsedAttachments = null;
          }
        }
        return {
          ...row,
          attachments: parsedAttachments,
        };
      });

      return res.json(rows);
    } catch (err) {
      console.error("GET /api/chat/:ticketNumber error:", err);
      return res.status(500).json({ error: "Failed to fetch chat messages" });
    }
  }
);

// Post chat message
// Post chat message
app.post(
  "/api/chat/:ticketNumber",
  requireAuth,
  param("ticketNumber").isString().notEmpty(),
  body("message").isString().notEmpty(),
  body("attachments").optional(), // JSON array from FE
  handleValidationErrors,
  async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const { message, attachments } = req.body;
    const senderEmail = req.user.email.toLowerCase();

    try {
      const pool = await getPool();
      const insertReq = pool.request();
      insertReq.input("ticket_number", sql.NVarChar(50), ticketNumber);
      insertReq.input("sender_email", sql.NVarChar(255), senderEmail);
      insertReq.input("message", sql.NVarChar(sql.MAX), message);
      insertReq.input(
        "attachments",
        sql.NVarChar(sql.MAX),
        attachments ? JSON.stringify(attachments) : null
      );
      const result = await insertReq.query(`
        INSERT INTO dbo.chat_messages (ticket_number, sender_email, message, attachments)
        OUTPUT INSERTED.*
        VALUES (@ticket_number, @sender_email, @message, @attachments);
      `);
      const createdRow = result.recordset[0];

      let parsedAttachments = null;
      if (createdRow.attachments) {
        try {
          parsedAttachments = JSON.parse(createdRow.attachments);
        } catch {
          parsedAttachments = null;
        }
      }

      const created = {
        ...createdRow,
        attachments: parsedAttachments,
      };

      await addHistoryEntry({
        ticketNumber,
        userEmail: senderEmail,
        actionType: "CHAT_MESSAGE",
        comment: "Chat message sent",
        beforeState: null,
        afterState: { message, attachments: attachments || null },
      });

      // --- Email notification for chat messages ---
      try {
        const origin = `${req.protocol}://${req.get("host")}`;

        // Determine ticket type (MEP vs VR) by prefix
        const pool = await getPool();
        let ticketRow = null;
        let ticketType = "MEP";

        if (ticketNumber.startsWith("VR-")) {
          const r = await pool
            .request()
            .input("ticket_number", sql.NVarChar(50), ticketNumber)
            .query(
              `SELECT TOP 1 * FROM dbo.vr WHERE ticket_number = @ticket_number`
            );
          ticketRow = r.recordset?.[0] || null;
          ticketType = "VR";
        } else {
          const r = await pool
            .request()
            .input("ticket_number", sql.NVarChar(50), ticketNumber)
            .query(
              `SELECT TOP 1 * FROM dbo.mep WHERE ticket_number = @ticket_number`
            );
          ticketRow = r.recordset?.[0] || null;
          ticketType = "MEP";
        }

        if (ticketRow) {
          // Determine counterpart email: if sender is requester, notify assignee; else notify requester
          let requesterEmail =
            ticketType === "VR" ? ticketRow.user_email : ticketRow.empemail;
          let assigneeEmail = ticketRow.assignee_email;
          requesterEmail = requesterEmail?.toLowerCase();
          assigneeEmail = assigneeEmail?.toLowerCase();

          let notify = null;
          if (senderEmail === requesterEmail) {
            notify = assigneeEmail;
          } else if (senderEmail === assigneeEmail) {
            notify = requesterEmail;
          } else {
            // fallback: notify both
            notify = [requesterEmail, assigneeEmail].filter(Boolean);
          }

          const detailsTable =
            ticketType === "VR"
              ? buildVrDetailsTable(ticketRow)
              : buildMepDetailsTable(ticketRow);

          const msgTable = keyvalTable([
            ["Ticket #", ticketNumber],
            ["Message From", senderEmail],
            ["Sent At (UTC)", formatUtc(created.created_at)],
            ["Message", message],
          ]);

          const attsHtml = attachmentsList(origin, created.attachments || []);

          const bodyHtml = `
            <p>Hello,</p>
            <p>There is a new <b>chat message</b> on your SPOT ticket.</p>
            ${msgTable}
            <div style="height:12px"></div>
            ${detailsTable}
            ${attsHtml}
          `;

          const html = emailShell({
            title: "💬 SPOT: Update on a Request",
            bodyHtml,
            ctaHtml: `<a href="${origin}" style="text-decoration:none;padding:10px 16px;border-radius:6px;border:1px solid #0b5fff;color:#0b5fff;font-weight:600;">Open Conversation</a>`,
          });

          sendEmail(notify, `SPOT: New Message on ${ticketNumber}`, html).catch(
            (err) =>
              console.warn(
                "[mail] chat message email failed:",
                err?.message || err
              )
          );
        }
      } catch (mailErr) {
        console.warn(
          "[mail] chat email block failed:",
          mailErr?.message || mailErr
        );
      }

      return res.status(201).json(created);
    } catch (err) {
      console.error("POST /api/chat/:ticketNumber error:", err);
      return res.status(500).json({ error: "Failed to send chat message" });
    }
  }
);

// --- ANALYTICS ---
// --- HOD DATA (full drilldown for allowed users) ---
// --- HOD DATA (full drilldown for allowed users) ---

app.get("/api/hod/tickets", requireAuth, requireHod, async (req, res) => {
  try {
    const pool = await getPool();

    // MEP tickets (full fields, similar to /api/mep list)
    const mepResult = await pool.request().query(`
      SELECT
        ticket_number,
        empid,
        empemail,
        dept,
        subdept,
        emplocation,
        designation,
        hod,
        creation_datetime,
        location,
        category,
        area_of_work,
        attachments,
        description,
        status,
        feedback,
        assignee_email
      FROM dbo.mep
      ORDER BY creation_datetime DESC;
    `);

    // VR tickets (full fields, similar to /api/vr list)
    const vrResult = await pool.request().query(`
      SELECT
        ticket_number,
        hod,
        creation_datetime,
        number_of_people,
        employee_or_guest,
        names,
        pickup_datetime,
        drop_datetime,
        contact_number,
        purpose_of_visit,
        driver_name,
        driver_number,
        assignee_email,
        feedback,
        status,
        description,
        attachments,
        user_email
      FROM dbo.vr
      ORDER BY creation_datetime DESC;
    `);

    // Parse names JSON for VR
    const vrTickets = (vrResult.recordset || []).map((row) => {
      if (row.names) {
        try {
          row.names = JSON.parse(row.names);
        } catch {
          // leave as-is if parse fails
        }
      }
      return row;
    });

    return res.json({
      mepTickets: mepResult.recordset || [],
      vrTickets,
    });
  } catch (err) {
    console.error("GET /api/hod/tickets error:", err);
    return res.status(500).json({ error: "Failed to fetch HOD ticket data" });
  }
});

// (Optional: keep these for direct access if you like)
app.get("/api/hod/mep", requireAuth, requireHod, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query(`
      SELECT
        ticket_number,
        creation_datetime,
        empemail,
        dept,
        subdept,
        emplocation,
        location,
        category,
        area_of_work,
        status,
        assignee_email
      FROM dbo.mep
      ORDER BY creation_datetime DESC;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("GET /api/hod/mep error:", err);
    return res.status(500).json({ error: "Failed to fetch HOD MEP data" });
  }
});

app.get("/api/hod/vr", requireAuth, requireHod, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query(`
      SELECT
        ticket_number,
        creation_datetime,
        user_email,
        hod,
        number_of_people,
        employee_or_guest,
        pickup_datetime,
        drop_datetime,
        contact_number,
        purpose_of_visit,
        status,
        assignee_email
      FROM dbo.vr
      ORDER BY creation_datetime DESC;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("GET /api/hod/vr error:", err);
    return res.status(500).json({ error: "Failed to fetch HOD VR data" });
  }
});

app.get("/api/hod/mep", requireAuth, requireHod, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query(`
      SELECT
        ticket_number,
        creation_datetime,
        empemail,
        dept,
        subdept,
        emplocation,
        location,
        category,
        area_of_work,
        status,
        assignee_email
      FROM dbo.mep
      ORDER BY creation_datetime DESC;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("GET /api/hod/mep error:", err);
    return res.status(500).json({ error: "Failed to fetch HOD MEP data" });
  }
});

app.get("/api/hod/vr", requireAuth, requireHod, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query(`
      SELECT
        ticket_number,
        creation_datetime,
        user_email,
        hod,
        number_of_people,
        employee_or_guest,
        pickup_datetime,
        drop_datetime,
        contact_number,
        purpose_of_visit,
        status,
        assignee_email
      FROM dbo.vr
      ORDER BY creation_datetime DESC;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("GET /api/hod/vr error:", err);
    return res.status(500).json({ error: "Failed to fetch HOD VR data" });
  }
});

app.get("/api/analytics/summary", requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query(`
      -- MEP vs VR counts
      SELECT 'MEP' AS type, COUNT(*) AS count FROM dbo.mep
      UNION ALL
      SELECT 'VR' AS type, COUNT(*) AS count FROM dbo.vr;

      -- Status counts across both
      SELECT status, COUNT(*) AS count
      FROM (
        SELECT status FROM dbo.mep
        UNION ALL
        SELECT status FROM dbo.vr
      ) t
      GROUP BY status;

      -- MEP by location
      SELECT location, COUNT(*) AS count
      FROM dbo.mep
      GROUP BY location;

      -- MEP by category
      SELECT category, COUNT(*) AS count
      FROM dbo.mep
      GROUP BY category;
    `);

    const recordsets = result.recordsets || [];
    const typeCounts = recordsets[0] || [];
    const statusCounts = recordsets[1] || [];
    const mepByLocation = recordsets[2] || [];
    const mepByCategory = recordsets[3] || [];

    return res.json({
      typeCounts,
      statusCounts,
      mepByLocation,
      mepByCategory,
    });
  } catch (err) {
    console.error("GET /api/analytics/summary error:", err);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// --- Serve Frontend (built React app) ---
if (fs.existsSync(CLIENT_BUILD_DIR)) {
  console.log("[FE] Serving static frontend from:", CLIENT_BUILD_DIR);

  // Serve all static assets
  app.use(express.static(CLIENT_BUILD_DIR));

  // SPA fallback: send index.html for any non-API GET request that accepts HTML
  app.use((req, res, next) => {
    // Let API routes pass through
    if (req.path.startsWith("/api")) {
      return next();
    }

    // Only handle GET requests that look like page navigation (not XHR for JSON, etc.)
    const acceptHeader = req.headers.accept || "";
    if (req.method !== "GET" || !acceptHeader.includes("text/html")) {
      return next();
    }

    const indexPath = path.join(CLIENT_BUILD_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    console.error("[FE] index.html not found at", indexPath);
    return res.status(500).send("Frontend build not found");
  });
} else {
  console.warn(
    "[FE] Build directory not found, skipping static frontend serving:",
    CLIENT_BUILD_DIR
  );
}

// --- 404 handler for unknown API routes ---
app.use("/api", (req, res, next) => {
  if (res.headersSent) return next();
  return res.status(404).json({ error: "API route not found" });
});

// --- Global error handler (fallback) ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal server error" });
});

// --- Server bootstrap ---
async function startServer() {
  try {
    await initializeDatabase();

    const keyPath = process.env.SSL_KEY_PATH;
    const certPath = process.env.SSL_CERT_PATH;

    if (
      keyPath &&
      certPath &&
      fs.existsSync(keyPath) &&
      fs.existsSync(certPath)
    ) {
      const credentials = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      const httpsServer = https.createServer(credentials, app);
      httpsServer.listen(PORT, () => {
        console.log(`HTTPS server listening on port ${PORT}`);
      });
    } else {
      const httpServer = http.createServer(app);
      httpServer.listen(PORT, () => {
        console.log(`HTTP server listening on port ${PORT}`);
      });
    }
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();

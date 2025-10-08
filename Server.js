// Server_V2.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
// Server.js (top)
import cors from "cors";
app.use(cors({
  origin: ["https://drpepsiman1.github.io"], // add your custom domain if you use one later
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- DB setup ----------
let pool = null;
const hasDb =
  process.env.MYSQL_HOST &&
  process.env.MYSQL_USER &&
  process.env.MYSQL_DATABASE;

if (hasDb) {
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10
  });
  console.log("[DB] MySQL pool created");
} else {
  console.log("[DB] No MySQL env vars found; API will error until .env is set.");
}

// ---------- Middleware ----------
app.use(express.json());

// ---------- Static files ----------
app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    maxAge: "1h",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
  })
);

// ---------- API ----------
const TABLE = "Members"; // change if your table name differs

// POST /api/search  { query: "text or number" }
app.post("/api/search", async (req, res) => {
  const qRaw = (req.body?.query ?? "").trim();
  if (!qRaw) return res.status(400).json({ error: "Missing 'query'." });

  const q = qRaw;
  const like = `%${q}%`;
  const isNumeric = /^[0-9]+$/.test(q);

  try {
    if (!pool) {
      return res.status(500).json({ error: "DB not configured. Set MySQL env vars." });
    }

    // SELECT now returns PeakRating instead of HighestRating
    const sql = isNumeric
      ? `
        SELECT \`MemberNum\`, \`LastName\`, \`FirstName\`, \`Class\`,
               \`Rating\`, \`PeakRating\`
        FROM \`${TABLE}\`
        WHERE \`MemberNum\` = ? OR \`LastName\` LIKE ? OR \`FirstName\` LIKE ?
        ORDER BY \`LastName\` ASC, \`FirstName\` ASC
        LIMIT 100
      `
      : `
        SELECT \`MemberNum\`, \`LastName\`, \`FirstName\`, \`Class\`,
               \`Rating\`, \`PeakRating\`
        FROM \`${TABLE}\`
        WHERE CAST(\`MemberNum\` AS CHAR) LIKE ? OR \`LastName\` LIKE ? OR \`FirstName\` LIKE ?
        ORDER BY \`LastName\` ASC, \`FirstName\` ASC
        LIMIT 100
      `;

    const params = isNumeric ? [Number(q), like, like] : [like, like, like];
    const [rows] = await pool.query(sql, params);
    return res.json({ results: rows });
  } catch (err) {
    console.error("[search] error:", err);
    return res.status(500).json({ error: "Server error." });
  }
});

// Optional test helpers
app.get("/api/health/db", async (_req, res) => {
  try {
    if (!pool) return res.json({ ok: false, reason: "No DB config" });
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, rows });
  } catch (e) {
    console.error("[health/db] error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});
app.get("/api/search", async (req, res) => {
  req.body = { query: req.query.q || "" };
  return app._router.handle(req, res);
});

// Pages
app.get("/SearchDB", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "SearchDB.HTML"));
});
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "SearchDB.HTML"));
});

// Start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});



// server.js
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

const app = express();

const allowed = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked for origin: " + origin));
  }
}));
app.use(express.json());

function buildSSL() {
  const ca = process.env.DB_CA;
  if (ca && ca.includes("BEGIN CERTIFICATE")) {
    return { rejectUnauthorized: true, ca };
  }
  console.warn("[WARN] DB_CA not provided. Using ssl.rejectUnauthorized=false (dev-only).");
  return { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  ssl: buildSSL(),
});

app.get("/api/health", async (_req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    res.json({ ok: true });
  } catch (e) {
    console.error("Health check failed:", e.message);
    res.status(500).json({ ok: false, error: "db_unreachable" });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.json({ items: [] });

    const cols = ["MemberNum","FirstName","LastName","Class","Rating","PeakRating"]
      .map(c => `\`${c}\``).join(", ");

    let sql, params;
    if (/^\d+$/.test(q)) {
      sql = `SELECT ${cols} FROM Members WHERE MemberNum = ? LIMIT 50`;
      params = [q];
    } else {
      const parts = q.split(/\s+/).filter(Boolean);
      const ors = parts.map(() => "(FirstName LIKE ? OR LastName LIKE ?)");
      sql = `SELECT ${cols}
             FROM Members
             WHERE ${ors.join(" AND ")}
             ORDER BY LastName, FirstName
             LIMIT 50`;
      params = parts.flatMap(p => [`%${p}%`, `%${p}%`]);
    }
    const [rows] = await pool.query(sql, params);
    res.json({ items: rows });
  } catch (err) {
    console.error("Search failed:", err);
    res.status(500).json({ error: "search_failed" });
  }
});

app.get("/", (_req, res) => res.type("text").send("FQSB API is running. Try /api/health"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`API listening on :${PORT}`));

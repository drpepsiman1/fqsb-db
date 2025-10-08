// server.js
// Minimal REST API for FQSB member search
// Deploy on Render/Railway/Fly/etc. Never expose DB creds in the frontend.

import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

const app = express();

// Allow your GitHub Pages origin. During testing you can use "*".
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || "*" }));
app.use(express.json());

// ---- DB connection pool (Aiven requires SSL) ----
const pool = mysql.createPool({
  host: process.env.DB_HOST,           // logannis09-mahaineault-9092.j.aivencloud.com
  port: Number(process.env.DB_PORT),   // 25458
  user: process.env.DB_USER,           // ServerRO
  password: process.env.DB_PASSWORD,   // 5Fx^xbZ@3MKi03
  database: process.env.DB_NAME,       // FQSB
  waitForConnections: true,
  connectionLimit: 5,
  ssl: {
    // Use Aiven CA cert. Put the text in env DB_CA or mount a file and read it.
    rejectUnauthorized: true,
    ca: process.env.DB_CA,
  },
});

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Search endpoint: q = name or member number
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.json({ items: [] });

    // Columns you want to expose
    const cols = [
      "MemberNum",
      "FirstName",
      "LastName",
      "Class",
      "Rating",
      "PeakRating",
    ].join(", ");

    let sql, params;

    // If q is all digits, search by exact member number; else search names
    if (/^\d+$/.test(q)) {
      sql = `SELECT ${cols} FROM Members WHERE MemberNum = ? LIMIT 50`;
      params = [q];
    } else {
      // Split words to support "first last" or partials
      const parts = q.split(/\s+/).filter(Boolean);
      // Build a simple AND of LIKEs across FirstName OR LastName for each token
      // e.g., ("FirstName LIKE ? OR LastName LIKE ?") AND ...
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
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

// Start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});

// 我的毛孩 API：只有登入的會員能用，而且只會讀到、改到「自己的」資料。
// 資料庫連線字串只存在 Vercel 環境變數（Neon 整合自動建立），不會傳到瀏覽器。
const { neon } = require("@neondatabase/serverless");

const SPECIES = ["狗", "貓", "其他"];
const SIZES = ["小型", "中型", "大型"];
let jwks = null;
let tableReady = null;

async function memberId(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const authUrl = process.env.NEON_AUTH_BASE_URL || process.env.VITE_NEON_AUTH_URL;
  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  jwks ??= createRemoteJWKSet(new URL(authUrl + "/.well-known/jwks.json"));
  try {
    const { payload } = await jwtVerify(m[1], jwks);
    return payload.sub || null;
  } catch {
    return null;   // 通行證過期或是假的
  }
}

function ensureTable(sql) {
  return sql`
    CREATE TABLE IF NOT EXISTS pets (
      id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id    text NOT NULL,
      pet_name   text NOT NULL,
      species    text NOT NULL,
      size       text,
      note       text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const uid = await memberId(req);
    if (!uid) return res.status(401).json({ error: "請先登入" });

    const sql = neon(process.env.DATABASE_URL);
    tableReady ??= ensureTable(sql).catch((e) => { tableReady = null; throw e; });
    await tableReady;

    if (req.method === "GET") {
      const rows = await sql`SELECT id, pet_name, species, size, note FROM pets WHERE user_id = ${uid} ORDER BY created_at DESC`;
      return res.status(200).json({ items: rows });
    }

    if (req.method === "POST") {
      const b = req.body || {};
      const name = String(b.pet_name || "").trim();
      const note = String(b.note || "").trim();
      if (!name || name.length > 30) return res.status(400).json({ error: "名字要 1–30 個字" });
      if (!SPECIES.includes(b.species)) return res.status(400).json({ error: "種類只能選狗、貓、其他" });
      if (b.size && !SIZES.includes(b.size)) return res.status(400).json({ error: "體型只能選小型、中型、大型" });
      if (note.length > 200) return res.status(400).json({ error: "備註最多 200 個字" });
      const count = await sql`SELECT count(*)::int AS n FROM pets WHERE user_id = ${uid}`;
      if (count[0].n >= 20) return res.status(409).json({ error: "一個會員最多存 20 隻" });
      await sql`INSERT INTO pets (user_id, pet_name, species, size, note) VALUES (${uid}, ${name}, ${b.species}, ${b.size || null}, ${note || null})`;
      return res.status(201).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "缺少要刪除的編號" });
      await sql`DELETE FROM pets WHERE id = ${id} AND user_id = ${uid}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "不支援這個動作" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "伺服器出了點問題，請稍後再試" });
  }
};

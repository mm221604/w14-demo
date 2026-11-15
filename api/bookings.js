// 線上預約 API（毛小孩の家）
// GET  ?date=YYYY-MM-DD  → 那天哪些時段已被預約（不含任何人的資料，不用登入）
// GET                    → 我的預約和集點數（要登入）
// POST                   → 新增預約（要登入；同一天同一時段只能有一筆）
// DELETE ?id=            → 取消自己的預約（要登入）
const { neon } = require("@neondatabase/serverless");
const { memberId } = require("./_auth.js");

const SLOTS = ["10:00", "11:30", "13:30", "15:00", "16:30"];
const SERVICES = ["洗澡", "洗澡＋剪毛", "除蚤 SPA", "指甲修剪"];
let tableReady = null;

function ensureTable(sql) {
  return (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS bookings (
        id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id    text NOT NULL,
        pet_name   text NOT NULL,
        service    text NOT NULL,
        day        date NOT NULL,
        slot       text NOT NULL,
        note       text,
        status     text NOT NULL DEFAULT 'booked',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    // 同一天同一時段只能有一筆「有效」預約——由資料庫保證，兩個人同時按也不會重複
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_slot ON bookings (day, slot) WHERE status = 'booked'`;
  })();
}

// 台灣時間的今天（YYYY-MM-DD）
function todayTW() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "日期格式不對";
  const d = new Date(day + "T00:00:00Z");
  if (isNaN(d)) return "日期格式不對";
  const today = todayTW();
  const max = new Date(Date.parse(today + "T00:00:00Z") + 30 * 86400000).toISOString().slice(0, 10);
  if (day <= today) return "只能預約明天以後";
  if (day > max) return "只能預約 30 天內";
  if (d.getUTCDay() === 1) return "週一公休";
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const sql = neon(process.env.DATABASE_URL);
    tableReady ??= ensureTable(sql).catch((e) => { tableReady = null; throw e; });
    await tableReady;

    // 查某一天的空檔：只回傳時段，不回傳是誰約的
    if (req.method === "GET" && req.query.date) {
      const err = validDay(String(req.query.date));
      if (err) return res.status(200).json({ slots: SLOTS, taken: SLOTS, reason: err });
      const rows = await sql`SELECT slot FROM bookings WHERE day = ${req.query.date} AND status = 'booked'`;
      return res.status(200).json({ slots: SLOTS, taken: rows.map((r) => r.slot) });
    }

    const uid = await memberId(req);
    if (!uid) return res.status(401).json({ error: "請先登入會員" });

    if (req.method === "GET") {
      const items = await sql`
        SELECT id, pet_name, service, to_char(day, 'YYYY-MM-DD') AS day, slot, note, status
        FROM bookings WHERE user_id = ${uid} ORDER BY day DESC, slot DESC LIMIT 50`;
      const stamps = items.filter((b) => b.status === "booked").length;
      return res.status(200).json({ items, stamps });
    }

    if (req.method === "POST") {
      const b = req.body || {};
      const day = String(b.day || "");
      const pet = String(b.pet_name || "").trim();
      const note = String(b.note || "").trim();
      const dayErr = validDay(day);
      if (dayErr) return res.status(400).json({ error: dayErr });
      if (!SLOTS.includes(b.slot)) return res.status(400).json({ error: "請選一個時段" });
      if (!SERVICES.includes(b.service)) return res.status(400).json({ error: "請選服務項目" });
      if (!pet || pet.length > 30) return res.status(400).json({ error: "毛孩名字要 1–30 個字" });
      if (note.length > 200) return res.status(400).json({ error: "備註最多 200 個字" });
      const open = await sql`SELECT count(*)::int AS n FROM bookings WHERE user_id = ${uid} AND status = 'booked' AND day > ${todayTW()}`;
      if (open[0].n >= 5) return res.status(409).json({ error: "一個會員最多同時有 5 筆預約" });
      try {
        await sql`INSERT INTO bookings (user_id, pet_name, service, day, slot, note)
                  VALUES (${uid}, ${pet}, ${b.service}, ${day}, ${b.slot}, ${note || null})`;
      } catch (e) {
        if (e.code === "23505") return res.status(409).json({ error: "這個時段剛剛被約走了，請換一個" });
        throw e;
      }
      return res.status(201).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "缺少要取消的預約" });
      const r = await sql`UPDATE bookings SET status = 'cancelled'
                          WHERE id = ${id} AND user_id = ${uid} AND status = 'booked' AND day > ${todayTW()}
                          RETURNING id`;
      if (!r.length) return res.status(400).json({ error: "這筆預約不能取消（已過期或不是你的）" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "不支援這個動作" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "伺服器出了點問題，請稍後再試" });
  }
};

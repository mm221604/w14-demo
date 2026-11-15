// 告訴網頁「會員登入服務」的網址。這個網址本來就是公開的；資料庫密碼不會從這裡送出去。
module.exports = function handler(req, res) {
  const authUrl = process.env.NEON_AUTH_BASE_URL || process.env.VITE_NEON_AUTH_URL;
  if (!authUrl) return res.status(500).json({ error: "還沒接上 Neon 會員登入（缺少 NEON_AUTH_BASE_URL）" });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ authUrl });
};

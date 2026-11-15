// 共用：驗證會員通行證（Neon Auth 發的 JWT），回傳會員 id；檔名底線開頭，Vercel 不會把它當成 API。
let jwks = null;

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

module.exports = { memberId };

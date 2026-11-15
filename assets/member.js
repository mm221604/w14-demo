/* 毛小孩の家的會員工具：登入用 Neon Auth，資料走自己網站的 /api/…
   資料庫密碼只在 Vercel 伺服器上，這個檔案裡沒有任何密碼。 */
window.Member = (function () {
  var AUTH_URL = null, token = null;

  async function authUrl() {
    if (AUTH_URL) return AUTH_URL;
    var r = await fetch("/api/config");
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || "讀不到登入設定");
    return (AUTH_URL = d.authUrl);
  }
  async function auth(path, body) {
    var r = await fetch((await authUrl()) + path, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.message || ("登入服務回應 " + r.status));
    token = null;
    return d;
  }
  async function currentUser() {
    var r = await fetch((await authUrl()) + "/get-session", { credentials: "include" });
    var d = await r.json().catch(function () { return null; });
    return d && d.user ? d.user : null;
  }
  async function getToken() {
    var r = await fetch((await authUrl()) + "/token", { credentials: "include" });
    if (!r.ok) throw new Error("登入過期，請重新登入");
    return (token = (await r.json()).token);
  }
  // 呼叫自己的 API；通行證 15 分鐘會過期，遇到 401 換一張再試一次
  async function api(path, options) {
    options = options || {};
    for (var i = 0; i < 2; i++) {
      if (!token) await getToken();
      var r = await fetch(path, {
        method: options.method || "GET",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      if (r.status === 401 && i === 0) { token = null; continue; }
      var d = await r.json().catch(function () { return null; });
      if (!r.ok) throw new Error((d && d.error) || ("伺服器回應 " + r.status));
      return d;
    }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // 導覽列的會員按鈕：登入了顯示暱稱
  async function paintNav() {
    var link = document.getElementById("memberLink");
    if (!link) return null;
    try {
      var u = await currentUser();
      link.textContent = u ? "👤 " + (u.name || "會員專區") : "🔑 會員登入";
      return u;
    } catch (e) { return null; }
  }
  return { authUrl: authUrl, auth: auth, currentUser: currentUser, api: api, esc: esc, paintNav: paintNav };
})();

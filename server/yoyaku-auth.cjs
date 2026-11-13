/**
 * 予約革命（Supabase Auth）のアカウントでログインさせ、カノエの組織に属する
 * 有効なユーザーだけに、この SEO ツール用のセッション Cookie を発行する。
 * 画面（JavaScript）には API キーを持たせない。
 */
const crypto = require("crypto");

const SESSION_COOKIE_NAME = "seo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12時間
const DEFAULT_SUPABASE_URL = "https://bvkottuueslhbvtigweu.supabase.co";
const DEFAULT_ALLOWED_ORG_IDS = ["00000000-0000-0000-0000-000000000002"]; // カノエ

function readAuthConfig(env = process.env) {
  const anonKey = env.YOYAKU_SUPABASE_ANON_KEY || "";
  const sessionSecret = env.SESSION_SECRET || "";
  if (!anonKey || sessionSecret.length < 32) return null;
  const allowed = String(env.ALLOWED_ORG_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    supabaseUrl: String(env.YOYAKU_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ""),
    anonKey,
    sessionSecret,
    allowedOrgIds: new Set(allowed.length ? allowed : DEFAULT_ALLOWED_ORG_IDS),
  };
}

// ---- ログイン試行の簡易制限（関数インスタンス単位） ----
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
function hitRateLimit(key, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}
function resetRateLimitForTests() {
  attempts.clear();
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split(".")[1] || "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token, secret) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.aud !== "seo-tool" || typeof payload.sub !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function postJson(url, anonKey, body, bearer) {
  const headers = { apikey: anonKey, "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function signOutSupabase(config, accessToken) {
  try {
    await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // 失敗しても閲覧セッションの発行には影響させない
  }
}

async function loginWithYoyaku(input, config = readAuthConfig()) {
  if (!config) {
    return { ok: false, code: "UNAVAILABLE", message: "ログイン機能の設定が完了していません。管理者へお問い合わせください。" };
  }
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!email || !password || email.length > 254 || password.length > 256) {
    return { ok: false, code: "INVALID_CREDENTIALS", message: "メールアドレスとパスワードを入力してください。" };
  }
  if (hitRateLimit(`${email}|${input.clientKey || "unknown"}`)) {
    return { ok: false, code: "RATE_LIMITED", message: "試行回数が多すぎます。15分ほどおいてから再度お試しください。" };
  }

  let tokenRes;
  try {
    tokenRes = await postJson(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, config.anonKey, { email, password });
  } catch {
    return { ok: false, code: "UNAVAILABLE", message: "予約革命に接続できませんでした。時間をおいて再度お試しください。" };
  }
  if (tokenRes.status === 429) {
    return { ok: false, code: "RATE_LIMITED", message: "試行回数が多すぎます。時間をおいて再度お試しください。" };
  }
  if (!tokenRes.ok) {
    return { ok: false, code: "INVALID_CREDENTIALS", message: "メールアドレスまたはパスワードが違います。" };
  }
  const tokenJson = await tokenRes.json();
  let accessToken = tokenJson.access_token || "";
  const userId = (tokenJson.user && tokenJson.user.id) || "";
  if (!accessToken || !userId) {
    return { ok: false, code: "INVALID_CREDENTIALS", message: "メールアドレスまたはパスワードが違います。" };
  }

  try {
    // 2段階認証を設定済みのアカウントは、認証アプリのコードも求める。
    const factors = (tokenJson.user && tokenJson.user.factors) || [];
    const factor = factors.find((f) => f.factor_type === "totp" && f.status === "verified");
    if (factor) {
      const code = String(input.totpCode || "").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) {
        return { ok: false, code: "MFA_REQUIRED", message: "2段階認証のコード（6桁）を入力してください。" };
      }
      const challengeRes = await postJson(`${config.supabaseUrl}/auth/v1/factors/${factor.id}/challenge`, config.anonKey, {}, accessToken);
      const challenge = challengeRes.ok ? await challengeRes.json() : {};
      if (!challenge.id) {
        return { ok: false, code: "UNAVAILABLE", message: "2段階認証を確認できませんでした。再度お試しください。" };
      }
      const verifyRes = await postJson(
        `${config.supabaseUrl}/auth/v1/factors/${factor.id}/verify`,
        config.anonKey,
        { challenge_id: challenge.id, code },
        accessToken
      );
      const verified = verifyRes.ok ? await verifyRes.json() : {};
      if (!verified.access_token) {
        return { ok: false, code: "MFA_INVALID", message: "2段階認証のコードが違います。" };
      }
      accessToken = verified.access_token;
    }

    // 所属組織の確認（アクセストークンのクレーム＋本人の users 行）
    const claims = decodeJwtPayload(accessToken);
    const orgIds = new Set();
    for (const key of ["organization_id", "parent_organization_id"]) {
      if (typeof claims[key] === "string" && claims[key]) orgIds.add(claims[key]);
    }
    let name = null;
    const usersRes = await fetch(
      `${config.supabaseUrl}/rest/v1/users?select=organization_id,is_active,name&id=eq.${encodeURIComponent(userId)}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` } }
    );
    if (usersRes.ok) {
      const rows = await usersRes.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.is_active === false) {
        return { ok: false, code: "FORBIDDEN", message: "このアカウントでは利用できません。" };
      }
      if (row && row.organization_id) orgIds.add(row.organization_id);
      name = (row && row.name) || null;
    }
    if (![...orgIds].some((id) => config.allowedOrgIds.has(id))) {
      return { ok: false, code: "FORBIDDEN", message: "このアカウントでは利用できません。" };
    }

    const user = { id: userId, email: (tokenJson.user && tokenJson.user.email) || email, name };
    const now = Math.floor(Date.now() / 1000);
    const token = sign({ sub: user.id, email: user.email, name: user.name, aud: "seo-tool", iat: now, exp: now + SESSION_TTL_SECONDS }, config.sessionSecret);
    return { ok: true, user, token };
  } finally {
    await signOutSupabase(config, accessToken);
  }
}

function parseCookies(header) {
  const out = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i < 0) return;
      const k = part.slice(0, i).trim();
      if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

function readSessionUser(req, config = readAuthConfig()) {
  if (!config) return null;
  const token = parseCookies(req.headers && req.headers.cookie)[SESSION_COOKIE_NAME];
  if (!token) return null;
  const payload = verify(token, config.sessionSecret);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email || "", name: payload.name || null };
}

function isSecure(req) {
  if (req.secure || req.protocol === "https") return true;
  const proto = req.headers && req.headers["x-forwarded-proto"];
  return String(Array.isArray(proto) ? proto[0] : proto || "").split(",")[0].trim().toLowerCase() === "https";
}

function sessionCookie(req, value, maxAge) {
  const parts = [`${SESSION_COOKIE_NAME}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (isSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

function setSessionCookie(req, res, token) {
  res.append("Set-Cookie", sessionCookie(req, token, SESSION_TTL_SECONDS));
}

function clearSessionCookie(req, res) {
  res.append("Set-Cookie", sessionCookie(req, "", 0));
}

function timingSafeEqualString(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

module.exports = {
  SESSION_COOKIE_NAME,
  readAuthConfig,
  loginWithYoyaku,
  readSessionUser,
  setSessionCookie,
  clearSessionCookie,
  timingSafeEqualString,
  resetRateLimitForTests,
};

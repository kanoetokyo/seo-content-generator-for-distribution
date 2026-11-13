const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loginWithYoyaku,
  readAuthConfig,
  readSessionUser,
  resetRateLimitForTests,
  SESSION_COOKIE_NAME,
  timingSafeEqualString,
} = require("./yoyaku-auth.cjs");
const { ALLOWED_PATH } = require("./gemini-proxy.cjs");

const KANOE = "00000000-0000-0000-0000-000000000002";
const OTHER = "11111111-1111-1111-1111-111111111111";
const config = readAuthConfig({
  YOYAKU_SUPABASE_URL: "https://example.supabase.co",
  YOYAKU_SUPABASE_ANON_KEY: "anon-key",
  SESSION_SECRET: "x".repeat(40),
});

function jwt(payload) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256" })}.${b(payload)}.sig`;
}

function mockSupabase(s) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push(`${init.method || "GET"} ${url}`);
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.includes("/auth/v1/token")) {
      if (s.passwordOk === false) return json({ error: "invalid_grant" }, 400);
      return json({ access_token: jwt(s.claims || {}), user: { id: "user-1", email: "staff@example.com", factors: s.factors || [] } });
    }
    if (url.includes("/challenge")) return json({ id: "ch-1" });
    if (url.includes("/verify")) return s.verifyOk ? json({ access_token: jwt(s.claims || {}) }) : json({ error: "x" }, 400);
    if (url.includes("/rest/v1/users")) return json(s.usersRow ? [s.usersRow] : []);
    if (url.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
    return new Response("nf", { status: 404 });
  };
  return calls;
}

const base = { email: "Staff@Example.com", password: "pw", clientKey: "1.2.3.4" };

test("Kanoe member can log in and the Supabase session is closed", async () => {
  resetRateLimitForTests();
  const calls = mockSupabase({ claims: { organization_id: KANOE }, usersRow: { organization_id: KANOE, is_active: true, name: "山田" } });
  const r = await loginWithYoyaku(base, config);
  assert.equal(r.ok, true);
  const user = readSessionUser({ headers: { cookie: `${SESSION_COOKIE_NAME}=${r.token}` } }, config);
  assert.equal(user.id, "user-1");
  assert.ok(calls.some((c) => c.includes("/auth/v1/logout")));
});

test("child organization of Kanoe is allowed, other companies are not", async () => {
  resetRateLimitForTests();
  mockSupabase({ claims: { organization_id: OTHER, parent_organization_id: KANOE } });
  assert.equal((await loginWithYoyaku(base, config)).ok, true);
  mockSupabase({ claims: { organization_id: OTHER }, usersRow: { organization_id: OTHER, is_active: true } });
  assert.equal((await loginWithYoyaku(base, config)).code, "FORBIDDEN");
});

test("deactivated user, wrong password, and MFA are handled", async () => {
  resetRateLimitForTests();
  mockSupabase({ claims: { organization_id: KANOE }, usersRow: { organization_id: KANOE, is_active: false } });
  assert.equal((await loginWithYoyaku(base, config)).code, "FORBIDDEN");
  mockSupabase({ passwordOk: false });
  assert.equal((await loginWithYoyaku(base, config)).code, "INVALID_CREDENTIALS");
  const factors = [{ id: "f1", factor_type: "totp", status: "verified" }];
  mockSupabase({ claims: { organization_id: KANOE }, factors, verifyOk: true });
  assert.equal((await loginWithYoyaku(base, config)).code, "MFA_REQUIRED");
  assert.equal((await loginWithYoyaku({ ...base, totpCode: "123456" }, config)).ok, true);
  mockSupabase({ claims: { organization_id: KANOE }, factors, verifyOk: false });
  assert.equal((await loginWithYoyaku({ ...base, totpCode: "000000" }, config)).code, "MFA_INVALID");
});

test("fails closed without configuration and rate limits", async () => {
  resetRateLimitForTests();
  assert.equal((await loginWithYoyaku(base, null)).code, "UNAVAILABLE");
  assert.equal(readAuthConfig({ YOYAKU_SUPABASE_ANON_KEY: "k", SESSION_SECRET: "short" }), null);
  mockSupabase({ passwordOk: false });
  for (let i = 0; i < 8; i++) await loginWithYoyaku(base, config);
  assert.equal((await loginWithYoyaku(base, config)).code, "RATE_LIMITED");
});

test("tampered or expired session cookies are rejected", () => {
  assert.equal(readSessionUser({ headers: { cookie: `${SESSION_COOKIE_NAME}=abc.def` } }, config), null);
  assert.equal(readSessionUser({ headers: {} }, config), null);
  assert.equal(timingSafeEqualString("a", "b"), false);
  assert.equal(timingSafeEqualString("same", "same"), true);
  assert.equal(timingSafeEqualString("", ""), false);
});

test("gemini proxy only allows model/file endpoints", () => {
  assert.ok(ALLOWED_PATH.test("/v1beta/models/gemini-2.5-flash:generateContent"));
  assert.ok(ALLOWED_PATH.test("/v1beta/models/gemini-2.5-flash:streamGenerateContent"));
  assert.ok(ALLOWED_PATH.test("/v1beta/models"));
  assert.ok(!ALLOWED_PATH.test("/v1beta/tunedModels/x:delete"));
  assert.ok(!ALLOWED_PATH.test("/v1beta/../../etc"));
  assert.ok(!ALLOWED_PATH.test("/v1beta/cachedContents"));
});

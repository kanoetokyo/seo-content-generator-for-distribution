/**
 * 画面からの Gemini API 呼び出しを中継する。
 * 画面は鍵を持たず /api/gemini/<元のパス> に送り、ここでサーバー側の鍵を付けて Google へ転送する。
 * （/api 配下はログイン済みのセッションか社内 API キーが無いと届かない）
 */
const { Readable } = require("stream");

const UPSTREAM = "https://generativelanguage.googleapis.com";
// 中継してよい呼び出しだけを通す（モデルの生成・数え上げ・埋め込み、ファイルのアップロード）
const ALLOWED_PATH = new RegExp(
  "^/(v1|v1beta|v1alpha)/(" +
    "models(/[A-Za-z0-9._-]+(:(generateContent|streamGenerateContent|countTokens|embedContent|batchEmbedContents|predict|predictLongRunning))?)?" +
    "|operations/[A-Za-z0-9._/-]+" +
    "|files(/[A-Za-z0-9._-]+)?" +
    ")$"
);
const UPLOAD_PATH = /^\/upload\/(v1|v1beta)\/files$/;
const FORWARD_REQUEST_HEADERS = ["content-type", "x-goog-upload-protocol", "x-goog-upload-command", "x-goog-upload-header-content-length", "x-goog-upload-header-content-type", "x-goog-upload-offset"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "x-goog-upload-url", "x-goog-upload-status", "x-goog-upload-size-received", "x-goog-upload-chunk-granularity"];

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.API_KEY || "";
}

function createGeminiProxy() {
  return async function geminiProxy(req, res) {
    // /api/gemini/v1beta/models/xxx:generateContent?alt=sse → /v1beta/models/xxx:generateContent
    const original = new URL(req.originalUrl, "http://local");
    const path = original.pathname.replace(/^\/api\/gemini/, "");
    if (!ALLOWED_PATH.test(path) && !UPLOAD_PATH.test(path)) {
      return res.status(404).json({ error: "Not allowed" });
    }
    const key = geminiKey();
    if (!key) return res.status(503).json({ error: "Gemini is not configured" });
    if (!["GET", "POST", "DELETE"].includes(req.method)) {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const target = new URL(UPSTREAM + path);
    for (const [k, v] of original.searchParams) {
      if (k.toLowerCase() !== "key") target.searchParams.append(k, v);
    }

    const headers = { "x-goog-api-key": key };
    for (const h of FORWARD_REQUEST_HEADERS) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }

    let body;
    if (req.method === "POST") {
      if (req.body !== undefined && req.body !== null && typeof req.body === "object" && !Buffer.isBuffer(req.body) && (req.headers["content-type"] || "").includes("json")) {
        body = JSON.stringify(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else {
        body = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        });
      }
    }

    let upstream;
    try {
      upstream = await fetch(target, { method: req.method, headers, body });
    } catch (error) {
      return res.status(502).json({ error: "Upstream unavailable" });
    }

    res.status(upstream.status);
    for (const h of FORWARD_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v === null) continue;
      if (h === "x-goog-upload-url") {
        // アップロード継続先も中継経由にする（鍵がURLに載らないように）
        try {
          const u = new URL(v);
          u.searchParams.delete("key");
          res.setHeader(h, `/api/gemini${u.pathname}${u.search}`);
        } catch {
          // 不正な値は返さない
        }
        continue;
      }
      res.setHeader(h, v);
    }
    res.setHeader("Cache-Control", "no-store");
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  };
}

module.exports = { createGeminiProxy, ALLOWED_PATH };

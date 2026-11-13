// ビルド後の配信ファイル（dist/）に API キーなどの秘密が混ざっていないか確かめる。
// 見つかったらビルドを失敗させる（値は表示しない）。
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const distDir = path.join(root, "dist");

const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)/i;
const PUBLIC_NAME = /(SUPABASE_ANON|SUPABASE_URL|PUBLISHABLE|_ID$)/i;
const PLACEHOLDER = /(your|xxx|example|placeholder|dummy|changeme|ここに|任意|server-side-proxy)/i;

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const candidates = new Map();
for (const source of [
  process.env,
  readEnvFile(path.join(root, ".env")),
  readEnvFile(path.join(root, "ai-article-imager-for-wordpress", ".env")),
]) {
  for (const [name, value] of Object.entries(source)) {
    if (!SECRET_NAME.test(name) || PUBLIC_NAME.test(name)) continue;
    if (typeof value !== "string" || value.length < 12 || PLACEHOLDER.test(value)) continue;
    candidates.set(value, name);
  }
}

const PATTERNS = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Google API key (AQ.)", /AQ\.[A-Za-z0-9_-]{40,}/],
  ["OpenAI key", /sk-(?:proj-)?[A-Za-z0-9_-]{30,}/],
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["Notion token", /(?:secret_[A-Za-z0-9]{43}|ntn_[A-Za-z0-9]{40,})/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs|cjs|html|css|json|map|txt)$/.test(entry.name)) yield full;
  }
}

if (!fs.existsSync(distDir)) {
  console.error("dist/ が見つかりません");
  process.exit(1);
}

const problems = [];
for (const file of walk(distDir)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  for (const [value, name] of candidates) {
    if (text.includes(value)) problems.push(`${rel}: 環境変数 ${name} の値が含まれています`);
  }
  for (const [label, rx] of PATTERNS) {
    if (rx.test(text)) problems.push(`${rel}: ${label} らしき文字列が含まれています`);
  }
}

if (problems.length) {
  console.error("❌ 配信ファイルに秘密が含まれています。ビルドを止めます。");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`✅ 配信ファイルに秘密は含まれていません（照合した値: ${candidates.size}件）`);

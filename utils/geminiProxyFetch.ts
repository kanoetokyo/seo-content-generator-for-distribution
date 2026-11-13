/**
 * 画面からの Gemini API 呼び出しを、サーバーの中継（/api/gemini/...）に向け直す。
 * 画面には API キーを持たせない。キーはサーバー側で付ける。
 * （@google/generative-ai などの SDK は内部で fetch を使うので、ここで差し替えれば全呼び出しに効く）
 */
const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";

// SDK が「キー未設定」で止まらないための目印。本物のキーではない。
export const GEMINI_PROXY_PLACEHOLDER_KEY = "server-side-proxy-no-key-in-browser";

function proxyBase(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
  // 本番は同じドメインの /api。開発時は VITE_API_URL（例: http://localhost:3001/api）
  return `${configured.replace(/\/+$/, "")}/gemini`;
}

function rewrite(url: string): string | null {
  if (!url.startsWith(GEMINI_ORIGIN)) return null;
  const u = new URL(url);
  u.searchParams.delete("key");
  const query = u.searchParams.toString();
  return `${proxyBase()}${u.pathname}${query ? `?${query}` : ""}`;
}

function stripKeyHeaders(headers: HeadersInit | undefined): Headers {
  const h = new Headers(headers);
  h.delete("x-goog-api-key");
  return h;
}

export function installGeminiProxyFetch() {
  if (typeof window === "undefined" || (window as any).__geminiProxyInstalled) return;
  (window as any).__geminiProxyInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const target = rewrite(url);
    if (!target) return originalFetch(input, init);

    if (input instanceof Request) {
      const req = new Request(target, input);
      const headers = stripKeyHeaders(init?.headers ?? req.headers);
      return originalFetch(new Request(req, { ...init, headers, credentials: "include" }));
    }
    return originalFetch(target, {
      ...init,
      headers: stripKeyHeaders(init?.headers),
      credentials: "include",
    });
  };
}

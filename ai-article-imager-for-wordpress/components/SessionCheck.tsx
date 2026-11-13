import React, { useEffect, useState, type ReactNode } from "react";

/**
 * 画像ツールは SEO ツール本体と同じドメインで動き、本体のログイン（予約革命アカウント）を共有する。
 * 未ログインなら本体のログイン画面へ案内する。
 */
export default function SessionCheck({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "login">("checking");

  useEffect(() => {
    const api = ((import.meta.env.VITE_API_URL as string | undefined) || "/api").replace(/\/+$/, "");
    fetch(`${api}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setState(d.user ? "ok" : "login"))
      .catch(() => setState("login"));
  }, []);

  if (state === "checking") {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">読み込み中…</div>;
  }
  if (state === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm space-y-3 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-700">画像ツールを使うには、SEO記事作成ツールにログインしてください。</p>
          <a className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white" href="/">
            ログイン画面へ
          </a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

import React, { useEffect, useState, type FormEvent, type ReactNode } from "react";

type SessionUser = { id: string; email: string; name: string | null };

function apiBase(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
  return configured.replace(/\/+$/, "");
}

/**
 * 予約革命のアカウント（カノエ所属）でログインした人だけがツールを使えるようにする。
 * ログイン状態はサーバーが HttpOnly Cookie で持つので、画面には鍵もトークンも残らない。
 */
export default function LoginGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch(`${apiBase()}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">読み込み中…</div>;
  }

  if (user) {
    return (
      <>
        {children}
        <button
          type="button"
          className="fixed bottom-3 right-3 z-[9999] rounded-md border border-gray-300 bg-white/90 px-3 py-1.5 text-xs text-gray-600 shadow-sm hover:text-gray-900"
          onClick={async () => {
            await fetch(`${apiBase()}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
            setUser(null);
          }}
        >
          ログアウト（{user.name || user.email}）
        </button>
      </>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${apiBase()}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, totpCode: needsTotp ? totpCode : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPassword("");
        setTotpCode("");
        setUser(data.user);
        return;
      }
      if (data.code === "MFA_REQUIRED" || data.code === "MFA_INVALID") setNeedsTotp(true);
      setError(data.message || "ログインできませんでした。");
    } catch {
      setError("ログインできませんでした。時間をおいて再度お試しください。");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-gray-900">SEO記事作成ツール</h1>
          <p className="text-sm text-gray-600">予約革命のメールアドレスとパスワードでログインしてください。</p>
        </div>
        <label className="block space-y-1 text-sm text-gray-800">
          <span>メールアドレス</span>
          <input className="w-full rounded-md border border-gray-300 px-3 py-2" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm text-gray-800">
          <span>パスワード</span>
          <input className="w-full rounded-md border border-gray-300 px-3 py-2" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {needsTotp && (
          <label className="block space-y-1 text-sm text-gray-800">
            <span>2段階認証のコード（6桁）</span>
            <input className="w-full rounded-md border border-gray-300 px-3 py-2" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
          </label>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "確認中…" : "ログイン"}
        </button>
      </form>
    </div>
  );
}

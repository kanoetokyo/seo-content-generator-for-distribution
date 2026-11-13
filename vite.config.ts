import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load environment variables from .env files
  const env = loadEnv(mode, process.cwd(), "");
  const isProduction = mode === "production";

  // 画面（JavaScript）には API キーを一切入れない。
  // Gemini はサーバーの中継（/api/gemini）経由、社内APIはログインCookieで認証する。
  const geminiPlaceholder = "server-side-proxy-no-key-in-browser";
  const apiUrl = isProduction
    ? process.env.VITE_API_URL || "/api"
    : env.VITE_API_URL || "/api";
  const backendUrl = isProduction
    ? process.env.VITE_BACKEND_URL || "."
    : env.VITE_BACKEND_URL || ".";
  const imageGenUrl = isProduction
    ? process.env.VITE_IMAGE_GEN_URL || ""
    : env.VITE_IMAGE_GEN_URL || "";


  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5176,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          secure: false,
        },
      },
    },
    define: {
      // 鍵の代わりの目印（本物のキーではない）。実際の鍵はサーバー側だけにある。
      "process.env.GEMINI_API_KEY": JSON.stringify(geminiPlaceholder),
      "process.env.API_KEY": JSON.stringify(geminiPlaceholder),
      "import.meta.env.VITE_GEMINI_API_KEY": JSON.stringify(geminiPlaceholder),
      // .env に VITE_ 付きの鍵が残っていても画面に入らないよう、空で上書きする
      "import.meta.env.VITE_INTERNAL_API_KEY": JSON.stringify(""),
      "process.env.INTERNAL_API_KEY": JSON.stringify(""),
      "import.meta.env.VITE_OPENAI_API_KEY": JSON.stringify(""),
      "process.env.OPENAI_API_KEY": JSON.stringify(""),
      "process.env.VITE_OPENAI_API_KEY": JSON.stringify(""),
      "process.env.OPENAI_ORG_ID": JSON.stringify(""),
      "process.env.VITE_OPENAI_ORG_ID": JSON.stringify(""),
      "import.meta.env.VITE_GOOGLE_API_KEY": JSON.stringify(""),
      "process.env.GOOGLE_API_KEY": JSON.stringify(""),
      "process.env.VITE_GOOGLE_API_KEY": JSON.stringify(""),
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
      "import.meta.env.VITE_BACKEND_URL": JSON.stringify(backendUrl),
      "import.meta.env.VITE_IMAGE_GEN_URL": JSON.stringify(imageGenUrl),
      // Google Search APIキーはサーバー側でのみ使用（セキュリティのため）
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // ローカルでは親ディレクトリの .env を読み込み、Vercel ではビルド時の環境変数を使う
    const parentEnv = loadEnv(mode, '..', '');
    const localEnv = loadEnv(mode, '.', '');
    const env = { ...parentEnv, ...localEnv, ...process.env };
    // 本番は SEO ツール本体と同じドメイン（/image-tool/）で動き、API も同じドメインの /api を使う
    const apiUrl = env.VITE_API_URL || (mode === 'production' ? '/api' : 'http://localhost:3001/api');
    const base = env.IMAGE_TOOL_BASE || '/';
    
    return {
      base,
      plugins: [react()],
      server: {
        port: 5177, // 画像生成エージェント専用ポート
        host: true,
        fs: {
          strict: false
        },
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
            secure: false
          }
        }
      },
      assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg'],
      define: {
        // APIキーはブラウザへ渡さない。認証は同じドメインのログインCookieで行う
        'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
        'import.meta.env.VITE_INTERNAL_API_KEY': JSON.stringify(''),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(''),
        'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(''),
        'import.meta.env.VITE_GOOGLE_API_KEY': JSON.stringify(''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

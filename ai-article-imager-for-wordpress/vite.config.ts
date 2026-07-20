import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // ローカルでは親ディレクトリの .env を読み込み、Vercel ではビルド時の環境変数を使う
    const parentEnv = loadEnv(mode, '..', '');
    const localEnv = loadEnv(mode, '.', '');
    const env = { ...parentEnv, ...localEnv, ...process.env };
    const geminiApiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
    
    return {
      plugins: [react()],
      server: {
        port: 5177, // 画像生成エージェント専用ポート
        host: true,
        fs: {
          strict: false
        }
      },
      assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg'],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey),
        'process.env.API_KEY_2': JSON.stringify(env.GEMINI_API_KEY_2 || ''),
        'process.env.API_KEY_3': JSON.stringify(env.GEMINI_API_KEY_3 || ''),
        // APIサーバーのURL（認証情報はサーバー側で管理）
        'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'http://localhost:3001/api'),
        'import.meta.env.VITE_INTERNAL_API_KEY': JSON.stringify(env.VITE_INTERNAL_API_KEY),
        // WordPress設定（認証情報はサーバー側で管理、デフォルト値のみ）
        'import.meta.env.VITE_WP_DEFAULT_POST_STATUS': JSON.stringify(
          env.WP_DEFAULT_POST_STATUS || env.VITE_WP_DEFAULT_POST_STATUS || 'draft'
        )
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

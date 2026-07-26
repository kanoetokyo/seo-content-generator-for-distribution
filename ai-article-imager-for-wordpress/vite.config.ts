import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // ローカルでは親ディレクトリの .env を読み込み、Vercel ではビルド時の環境変数を使う
    const parentEnv = loadEnv(mode, '..', '');
    const localEnv = loadEnv(mode, '.', '');
    const env = { ...parentEnv, ...localEnv, ...process.env };
    const apiUrl = env.VITE_API_URL || 'http://localhost:3001/api';
    
    return {
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
        // APIキーはブラウザへ渡さず、APIサーバー側で管理する
        'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
        'import.meta.env.VITE_INTERNAL_API_KEY': JSON.stringify(env.VITE_INTERNAL_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

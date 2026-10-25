# 画像生成エージェント用 Dockerfile
  FROM node:24-alpine AS builder

  WORKDIR /app

  # 依存関係インストール
  COPY package*.json ./
  RUN npm ci

  # ソースコードをコピー
  COPY . .

  # ビルド時の環境変数
  ARG VITE_BACKEND_URL
  ARG VITE_INTERNAL_API_KEY
  ARG VITE_MAIN_APP_URL

  # .envファイルを作成（Viteが読み込めるように）
  RUN echo "VITE_BACKEND_URL=${VITE_BACKEND_URL}" > .env && \
      echo "VITE_API_URL=${VITE_BACKEND_URL}/api" >> .env && \
      echo "VITE_INTERNAL_API_KEY=${VITE_INTERNAL_API_KEY}" >> .env && \
      echo "VITE_MAIN_APP_URL=${VITE_MAIN_APP_URL}" >> .env

  # ビルド
  RUN npm run build

  # 本番用イメージ
  FROM nginx:alpine

  # ビルド成果物をコピー
  COPY --from=builder /app/dist /usr/share/nginx/html

  # nginx設定
  COPY nginx.conf /etc/nginx/conf.d/default.conf

  EXPOSE 8080

  CMD ["nginx", "-g", "daemon off;"]

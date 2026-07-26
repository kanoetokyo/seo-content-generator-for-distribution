# SEOコンテンツ生成ツール デプロイマニュアル

このマニュアルでは、SEOコンテンツ生成ツールをGoogle Cloud Runにデプロイする手順を説明します。

---

## 用語説明

このマニュアルで使う主な用語です。

| 用語 | 意味 |
|------|------|
| **デプロイ** | ツールをインターネット上のサーバーに配置して、URLでアクセスできるようにすること |
| **ビルド** | ソースコードを実行可能な形（コンテナイメージ）に変換すること |
| **コンテナ** | アプリケーションを動かすための「箱」。環境ごと持ち運べる |
| **Cloud Run** | Googleが提供するサーバー。コンテナを置くと自動で動かしてくれる |
| **Secret Manager** | APIキーなどの機密情報を安全に保管する金庫のような機能 |
| **Cloud Shell** | ブラウザ上で使えるコマンドライン。PCに何もインストール不要 |

---

## 目次

1. [システム構成](#システム構成)
2. [前提条件](#前提条件)
3. [STEP 1: GCPプロジェクトの作成](#step-1-gcpプロジェクトの作成)
4. [STEP 2: 必要なAPIの有効化](#step-2-必要なapiの有効化)
5. [STEP 3: Secret Managerの設定](#step-3-secret-managerの設定)
6. [STEP 4: Artifact Registryの設定](#step-4-artifact-registryの設定)
7. [STEP 5: ソースコードのアップロード](#step-5-ソースコードのアップロード)
8. [STEP 6: バックエンドサーバーのデプロイ](#step-6-バックエンドサーバーのデプロイ)
9. [STEP 7: SEOエージェントのデプロイ](#step-7-seoエージェントのデプロイ)
10. [STEP 8: 画像生成エージェントのデプロイ](#step-8-画像生成エージェントのデプロイ)
11. [STEP 9: 環境変数の相互設定](#step-9-環境変数の相互設定)
12. [STEP 10: 動作確認](#step-10-動作確認)
13. [オプション: スプレッドシート機能の設定](#オプション-スプレッドシート機能の設定)
14. [更新時のデプロイ手順](#更新時のデプロイ手順)
15. [トラブルシューティング](#トラブルシューティング)

---

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud Run                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐             │
│  │  SEOエージェント   │      │  画像生成エージェント │             │
│  │  (フロントエンド)   │      │  (WordPress連携)   │             │
│  │  ポート: 8080     │      │   ポート: 8080     │             │
│  └────────┬─────────┘      └────────┬─────────┘             │
│           │                         │                        │
│           └─────────┬───────────────┘                        │
│                     │                                        │
│                     ▼                                        │
│           ┌──────────────────┐                               │
│           │ バックエンドサーバー │                               │
│           │  (Puppeteer)     │                               │
│           │  ポート: 8080     │                               │
│           └──────────────────┘                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 各サービスの役割

| サービス | 説明 |
|---------|------|
| バックエンドサーバー | Puppeteerを使用したWebスクレイピング、API提供 |
| SEOエージェント | SEO記事構成・執筆のメインUI |
| 画像生成エージェント | AI画像生成・WordPress連携 |

### デプロイ順序（重要）

**必ずこの順番でデプロイしてください：**

1. **バックエンドサーバー** （他のサービスが参照するため最初）
2. **SEOエージェント** （メインアプリケーション）
3. **画像生成エージェント** （SEOエージェントと連携）

---

## 前提条件

### 必須

- Googleアカウント
- クレジットカード（GCP請求先アカウント用）

### 必要なAPIキー

| APIキー | 用途 | 取得先 |
|---------|------|--------|
| Gemini API Key | AI構成・執筆生成 | [Google AI Studio](https://aistudio.google.com/) |
| Custom Search API Key | 競合調査（推奨） | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| Google Search Engine ID | 上記と一緒に使う | [Programmable Search Engine](https://programmablesearchengine.google.com/) |
| Serper API Key | 競合調査（Custom Searchが使えない場合の代替） | [Serper](https://serper.dev) |
| OpenAI API Key | GPT Image 2画像生成・GPT-5最終校閲 | [OpenAI Platform](https://platform.openai.com/) |
| Supabase URL + Anon Key | 一次情報DB（オプション） | [Supabase](https://supabase.com/) |

> **競合調査の検索APIについて**
> Custom Search API Key + Search Engine ID の組み合わせが推奨ですが、新規GCPプロジェクトでCustom Search APIを有効化できない場合（403エラー）は、代わりに Serper API を使用してください。どちらか一方を設定すれば競合調査が動作します。

---

## STEP 1: GCPプロジェクトの作成

### 1.1 GCPコンソールにアクセス

1. ブラウザで https://console.cloud.google.com にアクセス
2. Googleアカウントでログイン

### 1.2 新規プロジェクトを作成

1. 画面上部のプロジェクト選択ドロップダウンをクリック
2. **「新しいプロジェクト」** をクリック
3. 以下を入力：

| 項目 | 値 |
|------|-----|
| プロジェクト名 | `seo-agent`（任意の名前） |
| 場所 | 組織を選択（個人の場合は「組織なし」） |

4. **「作成」** をクリック

### 1.3 請求先アカウントの設定

1. 左メニュー → **「お支払い」**
2. **「請求先アカウントをリンク」** をクリック
3. 既存のアカウントを選択、または新規作成

> **注意**: 請求先アカウントがないとCloud Runは使用できません

---

## STEP 2: 必要なAPIの有効化

### 方法A: GUIで有効化（推奨）

GCPコンソールの検索バーで以下のAPIを検索し、それぞれ **「有効にする」** をクリック：

1. **Cloud Run Admin API**
2. **Cloud Build API**
3. **Artifact Registry API**
4. **Secret Manager API**

### 方法B: Cloud Shellで一括有効化

1. GCPコンソール右上の **Cloud Shellアイコン**（`>_`）をクリック
2. 以下のコマンドを実行：

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

---

## STEP 3: Secret Managerの設定

APIキーなどの機密情報をSecret Managerに保存します。

### 3.1 シークレットを作成

1. GCPコンソール左メニュー → 「セキュリティ」 → **「Secret Manager」**
2. **「シークレットを作成」** をクリック
3. 以下のシークレットを**それぞれ作成**：

#### 必須シークレット（APIキー）

| シークレット名 | 説明 | 値 |
|---------------|------|-----|
| `GEMINI_API_KEY` | Gemini API認証キー | Google AI Studioで取得 |
| `INTERNAL_API_KEY` | 内部API認証キー | 任意の文字列を設定 |
| `OPENAI_API_KEY` | GPT Image 2画像生成用のOpenAI API認証キー | OpenAIで取得した値 |

#### 必須シークレット（URL）※デプロイ後に更新

| シークレット名 | 説明 | 初期値 |
|---------------|------|--------|
| `BACKEND_URL` | バックエンドサーバーURL | `https://placeholder.run.app`（STEP 6後に更新） |
| `IMAGE_GEN_URL` | 画像生成エージェントURL | `https://placeholder.run.app`（STEP 8後に更新） |
| `MAIN_APP_URL` | SEOエージェントURL | `https://placeholder.run.app`（STEP 7後に更新） |

#### 必須シークレット（プレースホルダー可）

以下はCloud Buildが参照するため、**使わない場合もプレースホルダー値で作成が必要**です：

| シークレット名 | 説明 | 値 |
|---------------|------|-----|
| `SUPABASE_URL` | SupabaseプロジェクトURL | 使わない場合は `none` |
| `SUPABASE_ANON_KEY` | Supabase匿名キー | 使わない場合は `none` |
| `SLACK_WEBHOOK_URL` | Slack Webhook URL | 使わない場合は `none` |

> **注意**: 空欄ではなく `none` などの文字を入力してください。
> 空のシークレットはバージョンが作成されず、ビルドエラーになります。

#### 競合分析機能用シークレット（フル自動モードを使う場合は必須）

競合分析（Google検索で上位サイトを取得）を使用する場合は、以下の**いずれか**を設定してください：

**方法A: Google Custom Search API（推奨）**

| シークレット名 | 説明 | 取得先 |
|---------------|------|--------|
| `GOOGLE_API_KEY` | Google API用キー（下記参照） | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_SEARCH_ENGINE_ID` | カスタム検索エンジンID | [Programmable Search Engine](https://programmablesearchengine.google.com/) |

> **取得手順**:
> 1. Google Cloud Console → APIとサービス → 認証情報 → APIキーを作成
> 2. Programmable Search Engine で検索エンジンを作成 → 検索エンジンID（cx）をコピー

> **⚠️ 重要: GOOGLE_API_KEYの用途**
>
> このAPIキーは**2つの機能**で共通使用されます：
> 1. **Custom Search API** - 競合サイトの検索・分析
> 2. **Google Drive API** - 自社実績データ（CSVファイル）の取得
>
> Google Cloud Consoleで**両方のAPIを有効化**してください：
> - 「APIとサービス」→「ライブラリ」→「Custom Search API」→ 有効にする
> - 「APIとサービス」→「ライブラリ」→「Google Drive API」→ 有効にする

**方法B: Serper API（Custom Search APIが使えない場合）**

新規GCPプロジェクトでCustom Search APIを有効化できない場合（403エラー）は、Serper APIを使用してください。

| シークレット名 | 説明 | 取得先 |
|---------------|------|--------|
| `SERPER_API_KEY` | Serper API認証キー | [serper.dev](https://serper.dev) で登録（2,500クレジット無料） |

> **注意**: `SERPER_API_KEY` が設定されている場合、Custom Search APIよりも優先されます。

#### その他オプションシークレット

| シークレット名 | 説明 | 用途 |
|---------------|------|------|
| `WP_APP_PASSWORD` | WordPressアプリパスワード | WordPress連携 |
| `COMPANY_DATA_FOLDER_ID` | Google DriveフォルダID | 自社実績データ |
| `SPREADSHEET_ID` | GoogleスプレッドシートID | 記事データ管理 |

### 3.2 Cloud Buildにアクセス権限を付与

**すべてのシークレットに対して**以下を実行：

1. 作成したシークレットをクリック
2. **「権限」** タブをクリック
3. **「アクセスを許可」** をクリック
4. 以下を入力：

| 項目 | 値 |
|------|-----|
| 新しいプリンシパル | `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com` |
| ロール | `Secret Manager のシークレット アクセサー` |

> **PROJECT_NUMBER の確認方法**:
> GCPコンソール → プロジェクトダッシュボード → 「プロジェクト番号」
>
> **例**: プロジェクト番号が `123456789` の場合 → `123456789-compute@developer.gserviceaccount.com`

### 3.3 トラブルシューティング: サービスアカウントが見つからない場合

権限付与時に以下のエラーが出る場合：

```
メールアドレスとドメインは、有効な Google アカウント、Google Workspace アカウント、
または Cloud Identity アカウントに関連付けられている必要があります。
```

#### 原因

Cloud Build APIを有効化した直後は、サービスアカウントの作成に時間がかかる場合があります。

#### 解決方法A: 数分待ってから再試行

API有効化から **2〜3分** 待ってから、再度権限の割り当てを試してください。

#### 解決方法B: Cloud Buildを一度実行してサービスアカウントを自動作成

Cloud Shellで以下を実行：

```bash
# プロジェクトを設定
gcloud config set project YOUR_PROJECT_ID

# ダミービルドを実行（これでサービスアカウントが作成される）
echo "FROM alpine" | gcloud builds submit --tag gcr.io/$(gcloud config get-value project)/test --no-source
```

※ `YOUR_PROJECT_ID` は実際のプロジェクトIDに置き換えてください。ビルドが完了（または失敗）したら、再度権限割り当てを試してください。

#### 解決方法C: Cloud ShellからCLIで権限を付与

GUIではなくCLIで権限を付与する方法：

```bash
# プロジェクト番号を取得
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

# 各シークレットに権限を付与
for SECRET in GEMINI_API_KEY INTERNAL_API_KEY OPENAI_API_KEY BACKEND_URL IMAGE_GEN_URL MAIN_APP_URL SUPABASE_URL SUPABASE_ANON_KEY SLACK_WEBHOOK_URL; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## STEP 4: Artifact Registryの設定

Dockerイメージを保存するリポジトリを作成します。

### 4.1 Artifact Registryにアクセス

#### 方法A: 検索バーで検索（推奨）

1. GCPコンソール上部の **検索バー** をクリック
2. 「**Artifact Registry**」と入力
3. 表示された **「Artifact Registry」** をクリック

#### 方法B: メニューから探す

1. GCPコンソール左メニュー → **「CI/CD」** を展開
2. **「Artifact Registry」** をクリック

### 4.2 リポジトリを作成

1. **「リポジトリを作成」** をクリック
3. 以下を入力：

| 項目 | 値 |
|------|-----|
| 名前 | `seo-app` |
| 形式 | `Docker` |
| モード | `標準` |
| ロケーションタイプ | `リージョン` |
| リージョン | `asia-northeast1（東京）` |

4. **「作成」** をクリック

### 4.3 サービスアカウントへの権限付与（必須）

Cloud BuildがDockerイメージをArtifact Registryにプッシュするために、サービスアカウントに権限を付与します。

#### 方法A: GUIで設定（推奨）

1. GCPコンソール検索バーで「**IAM**」と検索 → **「IAMと管理」→「IAM」**
2. `[プロジェクト番号]-compute@developer.gserviceaccount.com` を探す
3. 右側の **鉛筆アイコン（編集）** をクリック
4. **「別のロールを追加」** をクリック
5. 以下の2つのロールを追加：
   - 「Storage」で検索 → **「Storage オブジェクト管理者」** を選択
   - 「Artifact Registry」で検索 → **「Artifact Registry 書き込み」** を選択
6. **「保存」** をクリック

> **プロジェクト番号の確認方法**: GCPコンソール → プロジェクトダッシュボード → 「プロジェクト番号」

#### 方法B: Cloud Shellで設定

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Storage オブジェクト管理者
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Artifact Registry 書き込み
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

---

## STEP 5: ソースコードのアップロード

### 5.1 Cloud Shellを開く

GCPコンソール右上の **Cloud Shellアイコン**（`>_`）をクリック

### 5.2 ソースコードをアップロード

#### 方法A: ZIPでアップロード（推奨）

1. ローカルで `seo-content-generator` フォルダをZIPに圧縮
2. Cloud Shell右上の **「︙」メニュー** → **「アップロード」**
3. ZIPファイルを選択
4. アップロードが完了するまで待機
5. アップロードが完了したら以下のコマンドを入力し、Cloud Shellで解凍：

```bash
unzip seo-content-generator.zip
cd seo-content-generator
```

#### 方法B: GitHubからクローン

```bash
git clone YOUR_REPOSITORY_URL
cd seo-content-generator
```

### 5.3 ファイル構成を確認

```bash
ls -la
```

以下のディレクトリ・ファイルが存在することを確認：
- `server/` - バックエンドサーバー
- `ai-article-imager-for-wordpress/` - 画像生成エージェント
- `Dockerfile` - SEOエージェント用
- `nginx.conf` - SEOエージェント用
- `cloudbuild.yaml` - SEOエージェント用

---

## STEP 6: バックエンドサーバーのデプロイ

**最初にバックエンドサーバーをデプロイします。**

### 6.1 serverフォルダに移動

```bash
cd ~/seo-content-generator/server
```

### 6.2 ファイルを確認

```bash
ls -la Dockerfile cloudbuild.yaml package.json scraping-server-full.js
```

### 6.3 イメージをビルド

```bash
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1
```

> **重要**: `--region=asia-northeast1` を必ず指定してください。
> デフォルト（global）だとタイムアウトする場合があります。

> **注意**: Puppeteer（Chrome）を含むため、ビルドには **10〜15分** かかります。
> `npm warn deprecated` の警告が出ても、エラーでなければ問題ありません。

ビルド中にCloud Shellの接続が切れる場合は、`--async` を追加してバックグラウンドで実行し、GCPコンソールで進捗を確認できます：

```bash
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1 --async
```

進捗確認: GCPコンソール → **Cloud Build** → **履歴**

成功すると以下のように表示されます：

```
STATUS: SUCCESS
```

### 6.4 Cloud Runにデプロイ（GUI）

1. GCPコンソール左メニュー → **「Cloud Run」**
2. **「コンテナをデプロイ」** をクリック
3. **「既存のコンテナイメージから1つのリビジョンをデプロイする」** を選択
4. **「コンテナイメージのURL」** → **「選択」** → **「Artifact Registry」** タブ → 以下を展開：
   - `asia-northeast1`
   - `seo-app`
   - `backend-server`
   - 最新のイメージを選択
5. **「選択」** をクリック

6. 基本設定：

| 項目 | 値 |
|------|-----|
| サービス名 | `backend-server` |
| リージョン | `asia-northeast1（東京）` |
| 認証 | **「未認証の呼び出しを許可」** にチェック |

7. **「コンテナ、ボリューム、ネットワーキング、セキュリティ」** を展開

8. **「コンテナ」** タブで以下を設定：

| 項目 | 値 | 理由 |
|------|-----|------|
| コンテナポート | `8080` | Cloud Runのデフォルト |
| メモリ | `2 GiB` | Puppeteer（Chrome）に必要 |
| CPU | `2` | スクレイピング処理に必要 |
| リクエストタイムアウト | `900` | 長時間のスクレイピングに対応 |
| インスタンスの最大数 | `10` | コスト管理 |

9. **「作成」** をクリック

### 6.5 URLを記録

デプロイ完了後、表示されるURLを記録してください：

```
https://backend-server-xxxxx-an.a.run.app
```

**このURLは後のステップで使用します。**

### 6.6 動作確認

ブラウザで以下にアクセス：

```
https://backend-server-xxxxx-an.a.run.app/api/health
```

**期待される応答:**
```json
{"status":"ok","message":"スクレイピングサーバーは正常に動作しています"}
```

---

## STEP 7: SEOエージェントのデプロイ

### 7.1 BACKEND_URL シークレットを更新

STEP 6 でデプロイしたバックエンドサーバーのURLで、Secret Managerの `BACKEND_URL` を更新します。

#### GUIで更新

1. GCPコンソール → **「Secret Manager」**
2. `BACKEND_URL` をクリック
3. **「新しいバージョン」** をクリック
4. シークレットの値に STEP 6 のURL（例: `https://backend-server-xxxxx-an.a.run.app`）を入力
5. **「新しいバージョンを追加」** をクリック

### 7.2 プロジェクトルートに移動

```bash
cd ~/seo-content-generator
```

### 7.3 イメージをビルド

```bash
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1
```

> **注意**: このcloudbuild.yamlはSecret Managerから直接値を取得するため、
> `--substitutions` オプションは不要です。

成功すると以下のように表示されます：

```
STATUS: SUCCESS
```

### 7.4 Cloud Runにデプロイ（GUI）

1. GCPコンソール左メニュー → **「Cloud Run」**
2. **「コンテナをデプロイ」** をクリック
3. **「既存のコンテナイメージから1つのリビジョンをデプロイする」** を選択
4. **「コンテナイメージのURL」** → **「選択」** → **「Artifact Registry」** タブ → 以下を展開：
   - `asia-northeast1`
   - `seo-app`
   - `seo-frontend`
   - 最新のイメージを選択
5. **「選択」** をクリック

6. 基本設定：

| 項目 | 値 |
|------|-----|
| サービス名 | `seo-frontend` |
| リージョン | `asia-northeast1（東京）` |
| 認証 | **「未認証の呼び出しを許可」** にチェック |

7. **「コンテナ、ボリューム、ネットワーキング、セキュリティ」** を展開

8. **「コンテナ」** タブで以下を設定：

| 項目 | 値 |
|------|-----|
| コンテナポート | `8080` |
| メモリ | `512 MiB` |
| CPU | `1` |
| インスタンスの最大数 | `10` |

9. **「作成」** をクリック

### 7.5 URLを記録

デプロイ完了後、表示されるURLを記録してください：

```
https://seo-frontend-xxxxx-an.a.run.app
```

**このURLは STEP 8 および STEP 9 で使用します。**

---

## STEP 8: 画像生成エージェントのデプロイ

### 8.1 MAIN_APP_URL シークレットを更新

STEP 7 でデプロイしたSEOエージェントのURLで、Secret Managerの `MAIN_APP_URL` を更新します。

#### GUIで更新

1. GCPコンソール → **「Secret Manager」**
2. `MAIN_APP_URL` をクリック
3. **「新しいバージョン」** をクリック
4. シークレットの値に STEP 7 のURL（例: `https://seo-frontend-xxxxx-an.a.run.app`）を入力
5. **「新しいバージョンを追加」** をクリック

### 8.2 ディレクトリに移動

```bash
cd ~/seo-content-generator/ai-article-imager-for-wordpress
```

### 8.3 イメージをビルド

```bash
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1
```

> Secret Managerから直接値を取得するため、`--substitutions` は不要です。

### 8.4 Cloud Runにデプロイ（GUI）

1. GCPコンソール左メニュー → **「Cloud Run」**
2. **「コンテナをデプロイ」** をクリック
3. **「既存のコンテナイメージから1つのリビジョンをデプロイする」** を選択
4. **「コンテナイメージのURL」** → **「選択」** → **「Artifact Registry」** タブ → 以下を展開：
   - `asia-northeast1`
   - `seo-app`
   - `ai-article-imager`
   - 最新のイメージを選択
5. **「選択」** をクリック

6. 基本設定：

| 項目 | 値 |
|------|-----|
| サービス名 | `ai-article-imager` |
| リージョン | `asia-northeast1（東京）` |
| 認証 | **「未認証の呼び出しを許可」** にチェック |

7. **「コンテナ、ボリューム、ネットワーキング、セキュリティ」** を展開

8. **「コンテナ」** タブで以下を設定：

| 項目 | 値 |
|------|-----|
| コンテナポート | `8080` |
| メモリ | `512 MiB` |
| CPU | `1` |
| インスタンスの最大数 | `10` |

9. **「作成」** をクリック

### 8.5 URLを記録

デプロイ完了後、表示されるURLを記録してください：

```
https://ai-article-imager-xxxxx-an.a.run.app
```

**このURLは STEP 9 で使用します。**

---

## STEP 9: 環境変数の相互設定

3つのサービスが相互に通信できるよう、URLを設定します。

### 9.1 IMAGE_GEN_URL シークレットを更新

STEP 8 でデプロイした画像生成エージェントのURLで、Secret Managerの `IMAGE_GEN_URL` を更新します。

1. GCPコンソール → **「Secret Manager」**
2. `IMAGE_GEN_URL` をクリック
3. **「新しいバージョン」** をクリック
4. シークレットの値に STEP 8 のURL（例: `https://ai-article-imager-xxxxx-an.a.run.app`）を入力
5. **「新しいバージョンを追加」** をクリック

### 9.2 SEOエージェントを再ビルド＆再デプロイ（新しいシークレット値を反映）

SEOエージェントは**ビルド時**に環境変数を埋め込むため、Secret Managerの値を更新した後は**再ビルド**が必要です。

> **重要**: 「新しいリビジョンの編集とデプロイ」だけでは反映されません。
> 必ず再ビルドしてから、新しいイメージを選択してデプロイしてください。

#### 1. 再ビルド（Cloud Shell）

```bash
cd ~/seo-content-generator
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1
```

#### 2. 新しいイメージをデプロイ（GUI）

1. Cloud Run → **「seo-frontend」** をクリック
2. **「新しいリビジョンの編集とデプロイ」** をクリック
3. コンテナイメージの **「選択」** をクリック
4. Artifact Registry → asia-northeast1 → seo-app → seo-frontend → **最新のイメージ**を選択
5. **「デプロイ」** をクリック

### 9.3 バックエンドサーバーの環境変数

Cloud Runで以下の環境変数を設定します。

1. Cloud Run → `backend-server` をクリック
2. **「新しいリビジョンの編集とデプロイ」** をクリック
3. **「変数とシークレット」** タブを開く

#### 必須の環境変数

**「変数を追加」** で以下を設定：

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `NODE_ENV` | `production` | 本番環境モード |
| `SEO_FRONTEND_URL` | `https://seo-frontend-xxxxx-an.a.run.app` | CORS許可（SEOエージェント） |
| `IMAGE_AGENT_URL` | `https://ai-article-imager-xxxxx-an.a.run.app` | CORS許可（画像生成エージェント） |

**「シークレットを参照」** で以下を設定：

| シークレット名 | 環境変数名 | 説明 |
|---------------|-----------|------|
| `INTERNAL_API_KEY` | `INTERNAL_API_KEY` | API認証キー（必須） |

#### 競合分析機能用（フル自動モードを使う場合は必須）

STEP 3 で設定した検索APIに応じて、**いずれか**を追加してください：

**Custom Search APIを使う場合：** **「シークレットを参照」** で以下を追加：

| シークレット名 | 環境変数名 | 説明 |
|---------------|-----------|------|
| `GOOGLE_API_KEY` | `GOOGLE_API_KEY` | Google Custom Search API |
| `GOOGLE_SEARCH_ENGINE_ID` | `GOOGLE_SEARCH_ENGINE_ID` | カスタム検索エンジンID |

**Serper APIを使う場合：** **「シークレットを参照」** で以下を追加：

| シークレット名 | 環境変数名 | 説明 |
|---------------|-----------|------|
| `SERPER_API_KEY` | `SERPER_API_KEY` | Serper API認証キー |

> **注意**: これらが未設定の場合、フル自動モード（競合分析）でエラーになります。
> 手動モード（キーワードのみ入力）は設定なしでも使用できます。

#### WordPress連携用（オプション）

WordPressへの記事・画像投稿機能を使う場合は以下を追加：

**「変数を追加」** で以下を設定：

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `WP_BASE_URL` | `https://your-wordpress-site.com` | WordPressサイトURL（末尾スラッシュなし） |
| `WP_USERNAME` | WordPressユーザー名 | 投稿権限のあるユーザー |
| `WP_APP_PASSWORD` | アプリパスワード | 下記の手順で取得 |
| `WP_DEFAULT_POST_STATUS` | `draft` | デフォルト投稿ステータス（`draft` または `publish`） |

> **注意**: これらが未設定の場合、WordPress連携機能で「WordPress設定が不完全です」エラーが発生します。

##### WordPressアプリパスワードの取得手順

1. WordPress管理画面にログイン
2. 左メニュー → **「ユーザー」** → **「プロフィール」**
3. 下にスクロールして **「アプリケーションパスワード」** セクションを探す
4. **「新しいアプリケーションパスワード名」** に `SEO Agent` と入力
5. **「新しいアプリケーションパスワードを追加」** をクリック
6. 表示されたパスワードをコピー（**この画面でしか表示されません**）
7. スペースは削除しても、そのままでもOK

> **アプリケーションパスワードが表示されない場合**:
> - WordPress 5.6以上が必要です
> - HTTPSが有効になっている必要があります
> - セキュリティプラグインが無効化している可能性があります

#### Slack通知用（オプション）

Slack通知機能を使う場合：

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` | Slack Incoming Webhook URL |

> **Slack Webhook URLの取得方法**:
> Slack API → Your Apps → Incoming Webhooks → Add New Webhook to Workspace

#### Google Drive連携用（オプション）

自社実績データをGoogle Driveから取得する場合：

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `COMPANY_DATA_FOLDER_ID` | `1ABC...xyz` | Google DriveのフォルダID |

> **フォルダIDの取得方法**:
> Google Driveでフォルダを開き、URLの `folders/` の後ろの文字列がフォルダID
> 例: `https://drive.google.com/drive/folders/1ABC123xyz` → `1ABC123xyz`

#### Googleスプレッドシート連携用（オプション）

スプレッドシートへの記事データ書き込み機能を使う場合：

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `SPREADSHEET_ID` | `1ABC...xyz` | GoogleスプレッドシートのID |

> **スプレッドシートIDの取得方法**:
> スプレッドシートを開き、URLの `/d/` と `/edit` の間の文字列がID
> 例: `https://docs.google.com/spreadsheets/d/1ABC123xyz/edit` → `1ABC123xyz`

4. **「デプロイ」** をクリック

### 9.2 CLIで設定する場合

```bash
# 基本設定
gcloud run services update backend-server \
  --region=asia-northeast1 \
  --set-env-vars="NODE_ENV=production,SEO_FRONTEND_URL=https://seo-frontend-xxxxx-an.a.run.app,IMAGE_AGENT_URL=https://ai-article-imager-xxxxx-an.a.run.app"

# シークレットを環境変数として追加（Custom Search APIの場合）
gcloud run services update backend-server \
  --region=asia-northeast1 \
  --set-secrets="INTERNAL_API_KEY=INTERNAL_API_KEY:latest,GOOGLE_API_KEY=GOOGLE_API_KEY:latest,GOOGLE_SEARCH_ENGINE_ID=GOOGLE_SEARCH_ENGINE_ID:latest"

# シークレットを環境変数として追加（Serper APIの場合）
# gcloud run services update backend-server \
#   --region=asia-northeast1 \
#   --set-secrets="INTERNAL_API_KEY=INTERNAL_API_KEY:latest,SERPER_API_KEY=SERPER_API_KEY:latest"
```

### 9.3 Cloud Runサービスアカウントへの権限付与

Cloud RunがSecret Managerからシークレットを読み取るには、サービスアカウントに権限が必要です。

```bash
# プロジェクト番号を取得
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
PROJECT_ID=$(gcloud config get-value project)

# Cloud Runのデフォルトサービスアカウント
CLOUDRUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# シークレットへのアクセス権限を付与（作成したシークレットに応じて調整）
for SECRET in INTERNAL_API_KEY GOOGLE_API_KEY GOOGLE_SEARCH_ENGINE_ID SERPER_API_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${CLOUDRUN_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID 2>/dev/null || echo "$SECRET: スキップ"
done
```

---

## STEP 10: 動作確認

### 10.1 各サービスの確認

| サービス | 確認URL | 期待される結果 |
|---------|---------|---------------|
| バックエンド | `https://backend-server-xxx.run.app/api/health` | `{"status":"ok",...}` |
| SEOエージェント | `https://seo-frontend-xxx.run.app` | UIが表示される |
| 画像生成 | `https://ai-article-imager-xxx.run.app` | UIが表示される |

### 10.2 機能テスト

1. SEOエージェントにアクセス
2. キーワードを入力して「構成生成」をクリック
3. 構成が生成されることを確認

---

## オプション: スプレッドシート機能の設定

スプレッドシートモード（Googleスプレッドシートからキーワードを読み込んで一括処理）を使用する場合は、以下の設定が必要です。

### 1. Google Sheets APIの有効化

1. GCPコンソール上部の **検索バー** で「Google Sheets API」を検索
2. **「Google Sheets API」** をクリック
3. **「有効にする」** をクリック

> **注意**: API有効化後、反映まで数分かかる場合があります。

### 2. サービスアカウントの作成

1. GCPコンソール左メニュー → **「IAMと管理」** → **「サービスアカウント」**
2. **「サービスアカウントを作成」** をクリック
3. 以下を入力：

| 項目 | 値 |
|------|-----|
| サービスアカウント名 | `sheets-api-access` |
| サービスアカウントID | `sheets-api-access`（自動入力） |

4. **「作成して続行」** をクリック
5. ロールの付与は**スキップ**して **「完了」** をクリック

### 3. JSONキーの作成

1. 作成した **「sheets-api-access」** をクリック
2. **「キー」** タブをクリック
3. **「鍵を追加」** → **「新しい鍵を作成」**
4. **「JSON」** を選択 → **「作成」**
5. JSONファイルがダウンロードされる（**大切に保管**）

### 4. Secret Managerに登録

1. GCPコンソール → **「Secret Manager」**
2. **「シークレットを作成」** をクリック
3. 以下を設定：

| 項目 | 値 |
|------|-----|
| 名前 | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| シークレットの値 | ダウンロードしたJSONファイルの**中身をすべてコピペ** |

4. **「シークレットを作成」** をクリック

5. Cloud Buildサービスアカウントにアクセス権限を付与（STEP 3.2と同様）

### 5. バックエンドサーバーに環境変数を追加

1. Cloud Run → **「backend-server」** → **「新しいリビジョンの編集とデプロイ」**
2. **「変数とシークレット」** セクション
3. **「シークレットを参照」** で以下を追加：

| シークレット | 環境変数名 | バージョン |
|-------------|-----------|-----------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `GOOGLE_APPLICATION_CREDENTIALS_JSON` | `latest` |

> **重要**: シークレット名と環境変数名が異なります。コードが `GOOGLE_APPLICATION_CREDENTIALS_JSON` を参照するため、この名前で設定してください。

4. **「変数を追加」** で以下も設定：

| 変数名 | 値 |
|--------|-----|
| `SPREADSHEET_ID` | 使用するスプレッドシートのID |

> **スプレッドシートIDの取得方法**: URLの `/d/` と `/edit` の間の文字列
> 例: `https://docs.google.com/spreadsheets/d/1ABC123xyz/edit` → `1ABC123xyz`

5. **「デプロイ」** をクリック

### 6. スプレッドシートの共有設定

使用するスプレッドシートを、サービスアカウントに共有する必要があります。

1. サービスアカウントのメールアドレスを確認：
   ```
   sheets-api-access@[PROJECT_ID].iam.gserviceaccount.com
   ```
   > `[PROJECT_ID]` は実際のプロジェクトIDに置き換え

2. 使用するGoogleスプレッドシートを開く
3. 右上の **「共有」** をクリック
4. 上記メールアドレスを追加（**閲覧者**または**編集者**）
5. **「送信」** をクリック

### 7. スプレッドシートのフォーマット

スプレッドシートは以下のフォーマットで作成してください：

| 列 | 内容 | 説明 |
|----|------|------|
| A列 | No. | 連番（任意） |
| B列 | KW | キーワード（必須） |
| C列 | 編集用URL | **処理対象マーカー** または記事編集URL |
| D列 | Slug | 記事のスラッグ |
| E列 | タイトル | 記事タイトル |
| F列 | 公開用URL | 内部リンク用URL（**読取専用**・手動入力） |
| G列 | メタディスクリプション | 記事のメタディスクリプション |

#### 処理対象のマーク方法

処理したいキーワードの **C列** に以下のいずれかを入力：

- `1`（半角）
- `１`（全角）

> **例**: B列に「AI研修 助成金」、C列に「1」と入力 → このキーワードが処理対象に

#### 処理後の動作

記事がWordPressにアップロードされると、C列〜G列が自動更新されます：
- C列: WordPress編集画面URL
- D列: 記事スラッグ
- E列: 記事タイトル
- G列: メタディスクリプション

### 8. 動作確認

1. SEOエージェントにアクセス
2. **「スプシモード」** をクリック
3. スプレッドシートからデータが読み込まれることを確認

---

## 更新時のデプロイ手順

コードを更新した場合の再デプロイ手順です。

### バックエンドサーバーの更新

```bash
cd ~/seo-content-generator/server
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1
```

その後、Cloud Run → `backend-server` → 「新しいリビジョンの編集とデプロイ」 → 最新イメージを選択 → 「デプロイ」

### SEOエージェントの更新

```bash
cd ~/seo-content-generator
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1
```

> Secret Managerから直接値を取得するため、環境変数の設定は不要です。

その後、Cloud Run → `seo-frontend` → 「新しいリビジョンの編集とデプロイ」 → 最新イメージを選択 → 「デプロイ」

### 画像生成エージェントの更新

```bash
cd ~/seo-content-generator/ai-article-imager-for-wordpress
gcloud builds submit --config=cloudbuild.yaml --region=asia-northeast1
```

> Secret Managerから直接値を取得するため、環境変数の設定は不要です。

その後、Cloud Run → `ai-article-imager` → 「新しいリビジョンの編集とデプロイ」 → 最新イメージを選択 → 「デプロイ」

---

## トラブルシューティング

### よくあるエラーと解決方法

#### エラー: 請求先アカウントが設定されていない

```
Billing account not configured
```

**解決方法**: 「お支払い」から請求先アカウントをリンク

---

#### エラー: APIが有効化されていない

```
API [run.googleapis.com] not enabled
```

**解決方法**: STEP 2 を実行してAPIを有効化

---

#### エラー: `npm ci` で失敗

```
npm error A complete log of this run can be found in...
```

**解決方法**: `package-lock.json` を再生成

```bash
rm package-lock.json
npm install
```

---

#### エラー: cloudbuild.yaml のYAML構文エラー

```
ERROR: (gcloud.builds.submit) parsing cloudbuild.yaml: while parsing a block mapping
expected <block end>, but found '<block mapping start>'
```

**原因**: YAMLのインデント（字下げ）が不正

**解決方法**: Cloud Shellで以下を実行して正しい内容で上書き

```bash
cat > cloudbuild.yaml << 'EOF'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/seo-app/backend-server'
      - '.'
images:
  - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/seo-app/backend-server'
EOF
```

---

#### エラー: シークレットにアクセスできない

```
Permission denied on secret
```

**解決方法**: Cloud BuildサービスアカウントにSecret Managerアクセス権限を付与（STEP 3.2参照）

---

#### エラー: CORSエラー

ブラウザコンソールに以下が表示される場合：

```
Access to fetch at 'https://backend-server-xxx.run.app/api/...' from origin 'https://seo-frontend-xxx.run.app' has been blocked by CORS policy
```

**解決方法**: STEP 9 で環境変数を設定

---

#### 画面が表示されない / APIキーエラー

ブラウザコンソールに以下が表示される場合：

```
An API Key must be set when running in a browser
```

**原因**: ビルド時にAPIキーが埋め込まれていない

**解決方法**:
1. Secret Managerの値が正しいか確認
2. cloudbuild.yamlの `--build-arg` が正しいか確認
3. 再ビルド＆再デプロイ

---

#### ビルドが5分以上止まる

バックエンドサーバーのビルドで `npm warn deprecated` の後に止まっている場合：

**これは正常です。** Puppeteerの依存関係インストールに5〜10分かかります。
15分以上動きがなければキャンセルして再試行。

---

#### メモリ不足エラー

```
Container memory limit exceeded
```

**解決方法**: Cloud Runのメモリを増やす（2GiB → 4GiB）

---

#### エラー: WordPress設定が不完全です

バックエンドサーバーのログに以下が表示される場合：

```
❌ WordPress設定が不完全です
```

**原因**: WordPress連携に必要な環境変数が未設定

**解決方法**:
1. Cloud Run → `backend-server` → **「新しいリビジョンの編集とデプロイ」**
2. **「変数とシークレット」** で以下を追加：
   - `WP_BASE_URL`: WordPressサイトURL
   - `WP_USERNAME`: ユーザー名
   - `WP_APP_PASSWORD`: アプリパスワード
3. **「デプロイ」**

詳細は「STEP 9.3 → WordPress連携用」を参照。

---

#### エラー: Google Sheets APIが有効化されていない

スプシモード使用時にブラウザコンソールに以下が表示される場合：

```
Google Sheets API has not been used in project XXXXXXX before or it is disabled
```

**解決方法**:
1. GCPコンソール → 検索バーで「Google Sheets API」を検索
2. **「有効にする」** をクリック
3. 数分待ってから再試行

---

#### エラー: INTERNAL_API_KEYが設定されていない

バックエンドサーバーのログに以下が表示される場合：

```
⚠️ INTERNAL_API_KEY が設定されていません
```

**解決方法**:
1. Cloud Run → `backend-server` → **「新しいリビジョンの編集とデプロイ」**
2. **「変数とシークレット」** → **「シークレットを参照」**
3. `INTERNAL_API_KEY` を環境変数として追加
4. **「デプロイ」** をクリック

---

## デプロイ済みURL一覧（記入用）

デプロイ後、以下に実際のURLを記録しておくと便利です：

| サービス | URL |
|---------|-----|
| バックエンドサーバー | `https://backend-server-_____-an.a.run.app` |
| SEOエージェント | `https://seo-frontend-_____-an.a.run.app` |
| 画像生成エージェント | `https://ai-article-imager-_____-an.a.run.app` |

---

## 料金の目安

Cloud Runは従量課金制です。

| 項目 | 無料枠 |
|------|--------|
| リクエスト | 200万リクエスト/月 |
| CPU | 180,000 vCPU秒/月 |
| メモリ | 360,000 GiB秒/月 |

通常の使用であれば、月額数百円〜数千円程度です。

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2025-12-17 | 統合マニュアル初版作成 |

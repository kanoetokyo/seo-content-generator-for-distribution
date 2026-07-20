# SEO Content Generator

キーワードを入力するだけで、SEOに最適化された記事を自動で作成できるツールです。

## はじめに

このドキュメントは、**自分のパソコンでこのツールを動かす手順**を説明しています。

| やりたいこと | 読むドキュメント |
|------------|----------------|
| まず自分のPCで試してみたい | このREADME（続きを読んでください） |
| インターネット上で公開したい | [デプロイマニュアル](docs/DEPLOY_MANUAL.md) |
| 自社の情報を反映させたい | [カスタマイズガイド](docs/CUSTOMIZATION_GUIDE.md) |

---

## このツールでできること

- キーワードから記事の構成（目次）を自動作成
- 構成をもとに記事を自動執筆
- 記事の校正・ファクトチェック
- 記事に合った画像をAIで自動生成
- 完成した記事と画像をNotionのブログ記事データベースに保存
- Googleスプレッドシートと連携して記事を一括作成

---

## パソコンで動かしてみる（ローカル実行）

このツールを自分のパソコンで動かす手順です。

### 事前に用意するもの

| 必要なもの | 説明 | 入手先 |
|-----------|------|--------|
| Node.js | このツールを動かすために必要なソフト | [公式サイト](https://nodejs.org/)からダウンロード（v18以上） |
| Gemini APIキー | AIが記事を書くために必要 | [Google AI Studio](https://aistudio.google.com/)で無料取得 |
| Custom Search APIキー | 競合サイトを調べるために必要（※） | [Google Cloud Console](https://console.cloud.google.com/)で取得 |
| カスタム検索エンジンID | 上記と一緒に使う（※） | [Programmable Search Engine](https://programmablesearchengine.google.com/)で作成 |

> **※ Custom Search API が使えない場合**
> 新規GCPプロジェクトでCustom Search APIを有効化できない場合（403エラー）は、代わりに **Serper** が使えます。
> [serper.dev](https://serper.dev) でアカウントを作成すると、2,500クレジット（約1,250記事分）が無料で付与されます。
> `.env` に `SERPER_API_KEY` を設定するだけで、他の手順は同じです。

#### オプション（なくても動きます）

| 必要なもの | 説明 | 入手先 |
|-----------|------|--------|
| OpenAI APIキー | 最終校閲（ファクトチェック・出典検証）で使用 | [OpenAI Platform](https://platform.openai.com/)で取得 |

> **OpenAI APIキーについて**
> 記事の構成作成・執筆・基本的な校閲は **Gemini だけで完結**するため、OpenAI APIキーがなくても記事は作れます。
> 設定すると、GPT-5 を使った**最終校閲**（ファクトチェック、数値・出典の検証、固有名詞チェックなど）が有効になり、記事の精度がさらに上がります。

---

### セットアップ手順

#### AIドリブンセットアップ（Cursor / Claude Code 推奨）

このリポジトリを **Cursor / Claude Code** で開き、AIに以下を依頼すると最短です（下のステップでも説明します）。

- `.env.example` をコピーして `.env` を作成し、必要な環境変数を埋める  
  - ※ `VITE_` で始まる値は **フロント（ブラウザ）に埋め込まれます**。公開デプロイ時は秘匿値を `VITE_` に入れないでください。
- `npm install` を実行
- `bash ./start.sh` で起動して、ブラウザで動作確認

#### ステップ1: 必要なファイルをダウンロード

1. このプロジェクトのフォルダを開きます

2. **コマンドプロンプト（Windows）またはターミナル（Mac）を開きます**
   - **Windows**: フォルダのアドレスバーに `cmd` と入力してEnter
   - **Mac**: フォルダを右クリック →「フォルダに新規ターミナル」

3. 以下を入力してEnterを押します：

```bash
npm install
```

これで必要なファイルが自動でダウンロードされます。数分かかることがあります。

#### ステップ2: APIキーを設定する

1. プロジェクトフォルダ内の `.env.example` というファイルをコピーして `.env` という名前に変更します

2. `.env` ファイルをメモ帳などで開いて、以下の部分を自分のAPIキーに書き換えます：

```env
# Gemini API（Google AI Studioで取得したキー）
GEMINI_API_KEY=ここにあなたのGemini APIキーを貼り付け
VITE_GEMINI_API_KEY=ここにも同じキーを貼り付け

# 競合調査用（どちらか一方を設定）
#
# 【推奨】Google Custom Search API
GOOGLE_API_KEY=ここにGoogle APIキーを貼り付け
VITE_GOOGLE_API_KEY=ここにも同じキーを貼り付け
GOOGLE_SEARCH_ENGINE_ID=ここに検索エンジンIDを貼り付け
VITE_GOOGLE_SEARCH_ENGINE_ID=ここにも同じIDを貼り付け
#
# 【代替】Custom Search APIが使えない場合はSerper APIを設定
# SERPER_API_KEY=ここにSerper APIキーを貼り付け

# バックエンド認証（競合調査/スプレッドシート/Slack/Notion連携などで使用）
# 例）openssl rand -hex 32 で生成した値を貼り付け
INTERNAL_API_KEY=任意の長いランダム文字列
VITE_INTERNAL_API_KEY=ここにも同じ値を貼り付け

# Notionブログ連携（画像生成した記事の保存先）
# Notionで作成したIntegrationのシークレットを設定し、ブログ記事DBを共有してください。
NOTION_API_KEY=ここにNotion Integrationのシークレットを貼り付け
NOTION_BLOG_DATA_SOURCE_ID=ここにブログ記事データソースIDを貼り付け
NOTION_BLOG_DEFAULT_STATUS=draft
NOTION_BLOG_DEFAULT_AUTHOR=勅使河原　将
NOTION_BLOG_DEFAULT_SHOP_SLUG=corporate
```

#### Notionブログ連携の準備

画像生成エージェントで作成した記事は、Notionの **ブログ記事 (blogs)** データベースへ保存されます。Notion API用のIntegrationを1つ作成し、対象データベースへ接続してください。

1. [Notion Integrations](https://www.notion.so/profile/integrations) で「New integration」を作成し、Content Capabilities の **Insert Content** を有効にします。
2. 表示されたIntegration Secretを `NOTION_API_KEY` に設定します。Secretはブラウザ側に公開される `VITE_` 付きの変数には入れません。
3. Notionで「ブログ記事 (blogs)」データベースを開き、右上の `...` → `接続` から作成したIntegrationを追加します。
4. `NOTION_BLOG_DATA_SOURCE_ID` には `01b356e3-01fc-4af5-a859-e817084b2a43` を設定します。

保存時には `title`、`slug`、`summary`、`status`、`published_at`、`author_name`、`category_name`、`category_slug`、`shop_slugs` を設定し、記事本文と生成画像はNotionページ本文へ保存します。カテゴリは記事内容から自動判定し、判定できない場合は「お掃除豆知識 / tips」として保存します。

3. ファイルを保存して閉じます

#### ステップ3: ツールを起動する

（推奨 / Mac・Linux）まずはワンコマンドで起動できます：

```bash
bash ./start.sh
```

> Windowsの場合や、うまく動かない場合は下の「ウィンドウ1/2（+3）」で起動してください。

**記事作成だけなら → 2つのウィンドウを開く**

**画像生成もするなら → 3つのウィンドウを開く**

> **ヒント**: 各ウィンドウは閉じずに開いたままにしておいてください。すべてのウィンドウが起動している必要があります。

---

**推奨: まとめて起動**

プロジェクトフォルダで以下を実行すると、メインアプリ、競合調査サーバー、画像生成エージェントがまとめて起動します。

```bash
bash ./start.sh
```

**個別に起動する場合**

**ウィンドウ1: メインアプリ**

プロジェクトフォルダでコマンドプロンプトを開いて（ステップ1と同じ方法）：

```bash
npm run dev
```

→ `http://localhost:5176/` で起動します

---

**ウィンドウ2: バックエンドサーバー（競合調査）**

**新しい**コマンドプロンプトを開いて（ウィンドウ1は閉じない）：

```bash
npm run server
```

→ `http://localhost:3001/` で起動します

---

**ウィンドウ3: 画像生成エージェント（フル自動モードで使う場合）**

さらに**新しい**コマンドプロンプトを開いて（ウィンドウ1・2は閉じない）：

```bash
cd ai-article-imager-for-wordpress
npm install
npm run dev
```

→ `http://localhost:5177/` で起動します

#### ステップ4: 動作確認

ブラウザ（Chrome等）を開いて、以下のURLにアクセスしてください。

> **「localhost」とは？** 自分のパソコン内で動いているサーバーを指します。インターネットには公開されていません。

| 確認項目 | URL | 正常なら |
|---------|-----|---------|
| メインアプリ | http://localhost:5176/ | ツールの画面が表示される |
| バックエンドサーバー（競合調査） | http://localhost:3001/api/health | `{"status":"ok"...}` と表示される |
| 画像生成（使う場合のみ） | http://localhost:5177/ | 画像生成の画面が表示される |

---

## よくあるトラブルと解決方法

### 「Puppeteer not available」というエラーが出る

**原因**: バックエンドサーバー（競合調査）が起動していません

**解決方法**: 別のコマンドプロンプトで以下を実行してください

```bash
npm run server
```

### バックエンドサーバー（競合調査）が起動しない

**解決方法**: `npm start`（バックグラウンド実行）が環境によって不安定なことがあります。以下のいずれかで起動してください。

```bash
# 推奨（Mac・Linux）
bash ./start.sh

# もしくは、別々のターミナルで起動
npm run server
npm run dev
```

### APIキーのエラーが出る

**原因**: `.env` ファイルにAPIキーが正しく設定されていない可能性があります

**解決方法**:
1. `.env` ファイルを開く
2. APIキーが正しくコピーされているか確認
3. キーの前後に余計なスペースが入っていないか確認
4. ファイルを保存してツールを再起動

---

## 困ったときは

- [デプロイマニュアル](docs/DEPLOY_MANUAL.md) - インターネット上で公開する方法
- [カスタマイズガイド](docs/CUSTOMIZATION_GUIDE.md) - 自社の情報を反映させる方法

import React, { useState, useCallback, useEffect, useRef } from "react";
import { NotionPostConfig, H2Section, AppState, ReportLog } from "./types";
import { extractH1Title } from "./utils/parsers";
import { parseHtmlSimple } from "./utils/intelligentParser";
import { loadDefaultImages } from "./utils/defaultImageLoader";
import { slackService } from "./services/slackService";
import { ConfigForm } from "./components/ConfigForm";
import { ProcessingView } from "./components/ProcessingView";
import { ReportView } from "./components/ReportView";
import {
  CheckCircleIcon,
  DocumentTextIcon,
  ArrowRightIcon,
} from "./components/icons";

// 外部から記事データを受け取るためのインターフェース
interface ArticleData {
  title?: string;
  htmlContent: string;
  metaDescription?: string;
  slug?: string; // slugを追加
  keyword?: string;
}

interface AppProps {
  // 将来的に外部から記事データを受け取る
  initialArticleData?: ArticleData;
}

const App: React.FC<AppProps> = ({ initialArticleData }) => {
  const [appState, setAppState] = useState<AppState>(AppState.CONFIG);

  const [postConfig, setPostConfig] = useState<NotionPostConfig>({
    title: "AI Generated Article", // 記事データから自動的に設定される
    status: "published",
  });
  const [promptStyle, setPromptStyle] = useState<string>(
    "明るく清潔で、やさしく信頼できるブログ解説イラスト"
  );

  // localStorageから記事データを取得
  const storedArticleData =
    typeof window !== "undefined"
      ? localStorage.getItem("articleDataForImageGen_5176") ||
        localStorage.getItem("articleDataForImageGen")
      : null;
  const articleDataFromStorage = storedArticleData
    ? JSON.parse(storedArticleData)
    : null;

  const [articleHtml, setArticleHtml] = useState<string | null>(
    initialArticleData?.htmlContent ||
      articleDataFromStorage?.htmlContent ||
      null
  );
  const [articleMetaData, setArticleMetaData] = useState<{
    metaDescription?: string;
    slug?: string;
    keyword?: string;
  }>({
    metaDescription:
      initialArticleData?.metaDescription ||
      articleDataFromStorage?.metaDescription,
    slug: initialArticleData?.slug || articleDataFromStorage?.slug,
    keyword: initialArticleData?.keyword || articleDataFromStorage?.keyword,
  });
  const [h2Sections, setH2Sections] = useState<H2Section[]>([]);
  const [processedSections, setProcessedSections] = useState<H2Section[]>([]);
  const [reportLogs, setReportLogs] = useState<ReportLog[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string>("");
  const [processingStartTime, setProcessingStartTime] = useState<number>(0);

  // 自動実行用のrefを追加
  const autoExecuteRef = useRef<boolean>(false);
  const processArticleRef = useRef<(() => void) | null>(null);

  const allInputsProvided = Boolean(articleHtml && articleHtml.trim() !== "");

  // postMessageリスナーを設定（メインアプリからのデータ受信用）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // セキュリティ: 許可されたオリジンからのメッセージのみ受信
      const ALLOWED_ORIGINS = [
        "http://localhost:5178", // 現行開発環境
        "http://localhost:5176", // レガシー（互換性）
        "http://localhost:5177", // 画像生成エージェント
        "http://127.0.0.1:5176", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5177", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5178", // 127.0.0.1でアクセスした場合
        import.meta.env.VITE_MAIN_APP_URL, // 本番用（.envで設定）
      ].filter(Boolean); // undefined を除外

      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        console.warn("⚠️ Rejected message from unknown origin:", event.origin);
        console.log("📋 Allowed origins:", ALLOWED_ORIGINS);
        return;
      }

      console.log("📨 postMessageを受信:", event);

      if (event.data?.type === "ARTICLE_DATA" && event.data?.data) {
        const articleData = event.data.data;

        // ✅ localStorage に保存（ページ更新に備える・容量不足時はスキップ）
        try {
          localStorage.setItem(
            "articleDataForImageGen",
            JSON.stringify(articleData)
          );
          console.log("💾 データを localStorage に保存しました");
        } catch (error) {
          // 容量不足でも処理は継続（postMessageでデータは既に受信済み）
          console.warn("⚠️ localStorage保存スキップ（容量不足）- 処理は継続します");
        }

        // HTMLからH1タイトルを自動抽出
        const extractedTitle =
          articleData.title || extractH1Title(articleData.htmlContent);

        // 投稿設定を更新（タイトルを実際の記事タイトルに）
        setPostConfig((prev) => ({
          ...prev,
          title: extractedTitle,
        }));

        // HTMLコンテンツをセット
        setArticleHtml(articleData.htmlContent);

        // メタ情報を保存
        setArticleMetaData({
          metaDescription: articleData.metaDescription,
          slug: articleData.slug,
          keyword: articleData.keyword,
        });

        // スプレッドシート行番号をlocalStorageに保存（5177側で）
        if (articleData.spreadsheetRow) {
          try {
            localStorage.setItem(
              "currentSpreadsheetRow",
              articleData.spreadsheetRow.toString()
            );
            console.log(
              "📊 スプレッドシート行番号を保存:",
              articleData.spreadsheetRow
            );
          } catch (error) {
            console.warn("⚠️ スプレッドシート行番号の保存スキップ");
          }
        }

        console.log("✅ postMessage経由で記事データを受け取りました:");
        console.log("  タイトル:", extractedTitle);
        console.log("  HTML文字数:", articleData.htmlContent.length);
        console.log("  キーワード:", articleData.keyword);
        console.log("  スコア:", articleData.score);
        console.log(
          "  スプレッドシート行:",
          articleData.spreadsheetRow || "なし"
        );

        // 🎯 自動実行フラグの判定（データソースに基づく）
        const isTestMode =
          articleData.isTestMode ||
          articleData.slug === "test-article-for-image-generation";

        if (isTestMode) {
          // テストモード：手動実行
          autoExecuteRef.current = false;
          console.log(
            "🧪 テストモード検出：手動で「Process Article」ボタンを押してください。"
          );
        } else {
          // フル自動モード：自動実行
          autoExecuteRef.current = true;
          console.log("🚀 フル自動モードを有効化しました");

          // 3秒後に自動でProcess Articleを実行
          setTimeout(() => {
            console.log("⏰ 3秒経過 - Process Articleを自動実行します");
            // Process Article処理を直接トリガー
            if (processArticleRef.current) {
              processArticleRef.current();
            }
          }, 3000);
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  // 外部から記事データが提供された場合の初期化処理
  useEffect(() => {
    // initialArticleDataまたはlocalStorageから記事データを取得
    const articleData = initialArticleData || articleDataFromStorage;

    if (articleData?.htmlContent) {
      // HTMLからH1タイトルを自動抽出
      const extractedTitle =
        articleData.title || extractH1Title(articleData.htmlContent);

      // 投稿設定を更新（タイトルを実際の記事タイトルに）
      setPostConfig((prev) => ({
        ...prev,
        title: extractedTitle,
      }));

      // HTMLコンテンツをセット
      setArticleHtml(articleData.htmlContent);

      console.log("📝 記事データを受け取りました:");
      console.log("  タイトル:", extractedTitle);
      console.log("  HTML文字数:", articleData.htmlContent.length);
      console.log("  ソース:", initialArticleData ? "props" : "localStorage");

      // localStorageから読み込んだ場合は、読み込み後にクリア
      if (!initialArticleData && storedArticleData) {
        localStorage.removeItem("articleDataForImageGen");
        console.log("  localStorageをクリアしました");
      }

      // 将来的には、ベース画像も自動的に用意できるようにする
      // 例：キーワードに基づいて適切な画像セットを自動選択
    }
  }, [initialArticleData, storedArticleData]);

  // postMessageでデータを受信（ARTICLE_DATA_TRANSFER用）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // セキュリティ: 許可されたオリジンからのメッセージのみ受信
      const ALLOWED_ORIGINS = [
        "http://localhost:5178", // 現行開発環境
        "http://localhost:5176", // レガシー（互換性）
        "http://localhost:5177", // 画像生成エージェント
        "http://127.0.0.1:5176", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5177", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5178", // 127.0.0.1でアクセスした場合
        import.meta.env.VITE_MAIN_APP_URL, // 本番用（.envで設定）
      ].filter(Boolean); // undefined を除外

      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        console.warn(
          "⚠️ Rejected ARTICLE_DATA_TRANSFER from unknown origin:",
          event.origin
        );
        console.log("📋 Allowed origins:", ALLOWED_ORIGINS);
        return;
      }

      // 記事データ転送メッセージの処理
      if (event.data?.type === "ARTICLE_DATA_TRANSFER") {
        const articleData = event.data.data;
        console.log("📨 postMessageで記事データを受信しました！");
        console.log("  タイトル:", articleData.title);
        console.log("  HTML文字数:", articleData.htmlContent?.length);

        // ✅ localStorage に保存（ページ更新に備える・容量不足時はスキップ）
        try {
          localStorage.setItem(
            "articleDataForImageGen",
            JSON.stringify(articleData)
          );
          console.log(
            "💾 ARTICLE_DATA_TRANSFER データを localStorage に保存しました"
          );
        } catch (error) {
          // 容量不足でも処理は継続（postMessageでデータは既に受信済み）
          console.warn("⚠️ localStorage保存スキップ（容量不足）- 処理は継続します");
        }

        // HTMLからH1タイトルを自動抽出
        const extractedTitle =
          articleData.title || extractH1Title(articleData.htmlContent);

        // 投稿設定を更新
        setPostConfig((prev) => ({
          ...prev,
          title: extractedTitle,
        }));

        // HTMLコンテンツをセット
        setArticleHtml(articleData.htmlContent);

        // メタ情報を保存
        setArticleMetaData({
          metaDescription: articleData.metaDescription,
          slug: articleData.slug,
          keyword: articleData.keyword,
        });
      }
    };

    // メッセージリスナーを登録
    window.addEventListener("message", handleMessage);

    // クリーンアップ
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const handleProcessArticle = useCallback(async () => {
    if (!allInputsProvided) {
      alert("記事HTMLを入力してください。");
      return;
    }

    try {
      setProcessingMessage("カノエくんの基準画像を読み込み中...");
      const baseImageMap = await loadDefaultImages();
      if (baseImageMap.size === 0) {
        throw new Error("カノエくんの基準画像が見つかりません。");
      }

      const sections = parseHtmlSimple(articleHtml, baseImageMap, promptStyle);
      if (sections.length === 0) {
        throw new Error("画像生成対象のH2見出しが見つかりません。");
      }

      setH2Sections(sections);
      setProcessingMessage("");
      setProcessingStartTime(Date.now());
      setAppState(AppState.PROCESSING);
    } catch (error) {
      console.error("記事の画像生成準備エラー:", error);
      setProcessingMessage("");
      alert(
        `画像生成の準備に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, [articleHtml, promptStyle, allInputsProvided]);

  // handleProcessArticle関数をrefに保存
  useEffect(() => {
    processArticleRef.current = handleProcessArticle;
  }, [handleProcessArticle]);

  const handleProcessingComplete = useCallback(
    async (finalSections: H2Section[], logs: ReportLog[]) => {
      setProcessedSections(finalSections);
      setReportLogs(logs);
      setAppState(AppState.REPORT);

      // 画像生成完了をSlackに通知
      try {
        const processingTime = Math.floor(
          (Date.now() - processingStartTime) / 1000
        ); // 秒単位
        const imageCount = finalSections.filter((s) => s.generatedImage).length;
        const keyword =
          articleMetaData.keyword || postConfig.title || "Unknown";

        await slackService.notifyImageGenerationComplete({
          keyword,
          imageCount,
          processingTime,
        });
      } catch (error) {
        console.error("Slack通知エラー:", error);
        // 通知エラーは無視して処理続行
      }
    },
    [processingStartTime, articleMetaData.keyword, postConfig.title]
  );

  // 戻るボタンのハンドラー
  const handleGoBack = useCallback(() => {
    if (appState === AppState.REPORT) {
      // レポート画面から処理画面に戻る
      setAppState(AppState.PROCESSING);
      // 処理済みデータは保持（再処理可能）
    } else if (appState === AppState.PROCESSING) {
      // 処理中画面から設定画面に戻る
      setAppState(AppState.CONFIG);
      // H2セクションデータをクリア
      setH2Sections([]);
    }
  }, [appState]);

  const renderContent = () => {
    switch (appState) {
      case AppState.CONFIG:
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* HTML Text Area Input */}
              <div className="bg-white p-6 rounded-lg shadow-md flex flex-col h-full">
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100">
                    {articleHtml && articleHtml.trim() !== "" ? (
                      <CheckCircleIcon className="w-8 h-8 text-indigo-600" />
                    ) : (
                      <DocumentTextIcon className="w-8 h-8 text-indigo-600" />
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">
                    記事HTML
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {articleHtml && articleHtml.trim() !== ""
                      ? articleDataFromStorage
                        ? "記事データを自動読み込みしました 🎉"
                        : "記事HTMLを読み込みました。"
                      : "記事HTMLを貼り付けてください。"}
                  </p>
                </div>
                <div className="mt-4 flex-grow">
                  <textarea
                    value={articleHtml || ""}
                    onChange={(e) => setArticleHtml(e.target.value)}
                    placeholder="<h2>見出し</h2><p>記事本文...</p>"
                    className="w-full h-full min-h-[150px] p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    aria-label="Article HTML Content"
                  />
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <img
                    src="/default-images/kanoe-kun.png"
                    alt="カノエくん"
                    className="h-40 w-40 object-contain"
                  />
                  <h3 className="mt-3 text-lg font-medium text-gray-900">
                    公式キャラクター「カノエくん」
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-gray-500">
                    GPT Image 2が顔・髪型・紺色の制服を保ち、各H2の清掃内容に合わせた場面を生成します。
                  </p>
                </div>
              </div>
            </div>
            <ConfigForm
              postConfig={postConfig}
              setPostConfig={setPostConfig}
              promptStyle={promptStyle}
              setPromptStyle={setPromptStyle}
            />

            {processingMessage && (
              <div className="p-3 bg-blue-50 rounded text-sm text-blue-700">
                {processingMessage}
              </div>
            )}
            <div className="text-center">
              <button
                onClick={handleProcessArticle}
                disabled={!allInputsProvided}
                className="inline-flex items-center px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                H2ごとの画像を準備 <ArrowRightIcon className="ml-2" />
              </button>
            </div>
          </div>
        );
      case AppState.PROCESSING:
        return (
          <div className="space-y-6">
            {/* 戻るボタン */}
            <div className="flex justify-between items-center">
              <button
                onClick={handleGoBack}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white font-medium rounded-lg shadow hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                設定に戻る
              </button>
            </div>
            <ProcessingView
              sections={h2Sections}
              onComplete={handleProcessingComplete}
              autoExecute={autoExecuteRef.current}
            />
          </div>
        );
      case AppState.REPORT:
        return (
          <div className="space-y-6">
            {/* 戻るボタン */}
            <div className="flex justify-between items-center">
              <button
                onClick={handleGoBack}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white font-medium rounded-lg shadow hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                画像生成画面に戻る
              </button>
              <div className="text-sm text-gray-500">
                ※ 生成済みの画像データは保持されます（再処理可能）
              </div>
            </div>
            <ReportView
              logs={reportLogs}
              sections={processedSections}
              articleHtml={articleHtml}
              postConfig={postConfig}
              metaData={articleMetaData}
              autoExecute={autoExecuteRef.current}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            SEO記事画像・Notion入稿エージェント
          </h1>
          <p className="mt-1 text-gray-500">
            記事に合う画像を生成し、Notionのブログ記事データベースへ保存します。
          </p>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </main>
      <footer className="text-center py-4 text-sm text-gray-500">
        <p>SEO記事生成エージェント</p>
      </footer>
    </div>
  );
};

export default App;

import React, { useEffect, useRef, useState } from "react";
import { H2Section, NotionPostConfig, ReportLog } from "../types";
import {
  createNotionArticle,
  uploadImageToNotion,
} from "../services/notionService";
import { slackService } from "../services/slackService";

interface ReportViewProps {
  logs: ReportLog[];
  sections: H2Section[];
  articleHtml: string | null;
  postConfig: NotionPostConfig;
  metaData?: {
    metaDescription?: string;
    slug?: string;
    keyword?: string;
  };
  autoExecute?: boolean;
}

interface UploadedNotionImage {
  heading: string;
  headingIndex: number;
  altText: string;
  fileUploadId: string;
}

interface PostResult {
  success: boolean;
  message: string;
  notionUrl?: string;
  publicUrl?: string | null;
}

export const ReportView: React.FC<ReportViewProps> = ({
  logs,
  sections,
  articleHtml,
  postConfig,
  metaData,
  autoExecute,
}) => {
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postResult, setPostResult] = useState<PostResult | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [finalHtml, setFinalHtml] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedNotionImage[]>([]);
  const [autoFlowExecuted, setAutoFlowExecuted] = useState(false);
  const autoFlowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const successfulGenerations = logs.filter((log) => log.status === "success").length;
  const canPost = Boolean(articleHtml?.trim());

  useEffect(() => {
    if (
      autoExecute &&
      canPost &&
      !autoFlowExecuted &&
      !finalHtml &&
      !postResult
    ) {
      autoFlowTimeoutRef.current = setTimeout(() => {
        void handlePrepareArticle();
        setAutoFlowExecuted(true);
      }, 3000);
    }

    return () => {
      if (autoFlowTimeoutRef.current) clearTimeout(autoFlowTimeoutRef.current);
    };
  }, [autoExecute, canPost, autoFlowExecuted, finalHtml, postResult]);

  useEffect(() => {
    if (
      autoExecute &&
      finalHtml &&
      !postResult &&
      !isPreparing &&
      autoFlowExecuted
    ) {
      const timeout = setTimeout(() => {
        void handleCreateArticle();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [autoExecute, finalHtml, postResult, isPreparing, autoFlowExecuted]);

  const notifyParent = () => {
    const parentOrigin = import.meta.env.VITE_MAIN_APP_URL || "http://localhost:5176";
    const parentWindow = window.parent !== window ? window.parent : window.opener;
    const isIframe = window.parent !== window;

    if (parentWindow && (isIframe || (window.opener && !window.opener.closed))) {
      parentWindow.postMessage(
        {
          type: "ARTICLE_COMPLETED",
          success: true,
          keyword: metaData?.keyword,
        },
        parentOrigin
      );
    }
  };

  const updateSpreadsheet = async (notionUrl: string) => {
    if (!metaData?.keyword) return;

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
    const response = await fetch(`${apiUrl}/spreadsheet-mode/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(import.meta.env.VITE_INTERNAL_API_KEY
          ? { "x-api-key": import.meta.env.VITE_INTERNAL_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        keyword: metaData.keyword,
        url: notionUrl,
        slug: metaData.slug,
        title: postConfig.title,
        metaDescription: metaData.metaDescription,
      }),
    });
    if (!response.ok) {
      throw new Error("スプレッドシートの更新に失敗しました。");
    }
  };

  const handlePrepareArticle = async () => {
    if (!articleHtml) {
      setPostResult({ success: false, message: "記事本文が見つかりません。" });
      return;
    }

    setIsPreparing(true);
    setPostResult(null);
    setFinalHtml(null);
    setUploadedImages([]);

    try {
      const sectionsToUpload = sections.filter(
        (section) => section.status === "success" && section.generatedImage
      );
      const completedUploads: UploadedNotionImage[] = [];

      for (let index = 0; index < sectionsToUpload.length; index += 1) {
        const section = sectionsToUpload[index];
        setProgressMessage(
          `画像をNotionへ保存中 (${index + 1}/${sectionsToUpload.length}): ${section.h2Text}`
        );
        completedUploads.push(
          await uploadImageToNotion(section, index, section.id)
        );
      }

      setUploadedImages(completedUploads);
      setFinalHtml(articleHtml);
      setProgressMessage("記事を確認してNotionへ保存できます。");
    } catch (error) {
      setPostResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Notionへの画像保存に失敗しました。",
      });
    } finally {
      setIsPreparing(false);
    }
  };

  const handleCreateArticle = async () => {
    if (!finalHtml) {
      setPostResult({ success: false, message: "記事本文が見つかりません。" });
      return;
    }

    setIsPosting(true);
    setPostResult(null);
    setProgressMessage("Notionに記事を保存中...");

    try {
      const article = await createNotionArticle(
        postConfig,
        finalHtml,
        {
          metaDescription: metaData?.metaDescription,
          slug: metaData?.slug,
          keyword: metaData?.keyword,
        },
        uploadedImages
      );
      setPostResult({
        success: true,
        message:
          article.status === "published"
            ? "Notionに公開記事として保存しました。ブログ反映後に公開URLを確認してください。"
            : "Notionに下書きを保存しました。内容を確認してから公開できます。",
        notionUrl: article.notionUrl,
        publicUrl: article.publicUrl,
      });

      notifyParent();

      void updateSpreadsheet(article.notionUrl).catch((error) => {
        console.error("スプレッドシート更新エラー:", error);
      });
      void slackService
        .notifyNotionArticleCreated({
          title: postConfig.title,
          notionUrl: article.notionUrl,
          imageCount: article.imageCount,
          status: article.status,
          metaDescription: metaData?.metaDescription,
          slug: article.slug,
        })
        .catch((error) => console.error("Slack通知エラー:", error));
    } catch (error) {
      setPostResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Notionへの記事保存に失敗しました。",
      });
    } finally {
      setIsPosting(false);
      setProgressMessage("");
    }
  };

  const handleReset = () => {
    setPostResult(null);
    setFinalHtml(null);
    setUploadedImages([]);
    setProgressMessage("");
  };

  const getStatusClass = (status: "success" | "error" | "skipped") => {
    if (status === "success") return "bg-green-100 text-green-800";
    if (status === "error") return "bg-red-100 text-red-800";
    return "bg-yellow-100 text-yellow-800";
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-gray-900">画像生成が完了しました</h2>
        <p className="mt-1 text-gray-600">
          {successfulGenerations}件の画像を生成しました。
        </p>
        {autoExecute && (
          <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 font-medium">
              フル自動モード: 画像保存からNotion入稿まで続けて実行します。
            </p>
          </div>
        )}
      </div>

      {metaData && (metaData.metaDescription || metaData.slug || metaData.keyword) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">記事情報</h3>
          {metaData.keyword && <p className="text-sm text-gray-700 mb-2">キーワード: {metaData.keyword}</p>}
          {metaData.metaDescription && (
            <p className="text-sm text-gray-700 mb-2">要約: {metaData.metaDescription}</p>
          )}
          {metaData.slug && <p className="text-sm text-gray-700 font-mono">スラッグ: {metaData.slug}</p>}
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold text-gray-800 mb-2">Notionへ保存</h3>
        <p className="text-sm text-gray-600 mb-5">
          記事本文をNotionのページ本文へ変換し、生成画像は該当する見出しの直後に配置します。
        </p>

        {!finalHtml && !postResult && (
          <div className="text-center">
            <button
              onClick={() => void handlePrepareArticle()}
              disabled={isPreparing || !canPost}
              className="inline-flex items-center px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isPreparing ? "画像を保存中..." : "1. 画像をNotionへ保存"}
            </button>
            {!canPost && <p className="text-sm text-red-600 mt-2">記事本文がないため保存できません。</p>}
            {isPreparing && <p className="text-sm text-indigo-600 mt-4 animate-pulse">{progressMessage}</p>}
          </div>
        )}

        {finalHtml && !postResult && (
          <div className="space-y-5">
            <label htmlFor="final-html" className="block text-sm font-medium text-gray-700">
              2. 記事本文を確認・編集
            </label>
            <textarea
              id="final-html"
              value={finalHtml}
              onChange={(event) => setFinalHtml(event.target.value)}
              className="w-full h-80 p-3 font-mono text-sm bg-gray-900 text-white rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Notionに保存する記事本文"
            />
            <div className="text-center">
              <button
                onClick={() => void handleCreateArticle()}
                disabled={isPosting}
                className="inline-flex items-center px-8 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
              >
                {isPosting ? "Notionへ保存中..." : "3. Notionに記事を保存"}
              </button>
              {isPosting && <p className="text-sm text-indigo-600 mt-4 animate-pulse">{progressMessage}</p>}
            </div>
          </div>
        )}

        {postResult && (
          <div className="text-center">
            <div className={`p-4 rounded-md ${postResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              <h4 className="font-bold">{postResult.success ? "保存完了" : "エラー"}</h4>
              <p>{postResult.message}</p>
              {postResult.notionUrl && (
                <a href={postResult.notionUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-semibold underline">
                  Notionの記事ページを開く
                </a>
              )}
              {postResult.publicUrl && (
                <a href={postResult.publicUrl} target="_blank" rel="noopener noreferrer" className="mt-3 ml-4 inline-block font-semibold underline">
                  公開ブログを開く
                </a>
              )}
            </div>
            <button onClick={handleReset} className="mt-4 px-6 py-2 bg-gray-500 text-white font-semibold rounded-lg shadow-md hover:bg-gray-600">
              保存し直す
            </button>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">画像生成の結果</h3>
        <div className="space-y-3">
          {logs.map((log, index) => (
            <div key={`${log.h2Text}-${index}`} className="border border-gray-200 rounded-lg p-4 flex items-start gap-4">
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusClass(log.status)}`}>
                {log.status === "success" ? "完了" : log.status === "error" ? "失敗" : "スキップ"}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-gray-800">{log.h2Text}</p>
                <p className="text-sm text-gray-600 mt-1">{log.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

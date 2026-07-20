// Google Custom Search API Service
// 正確なURLを取得するためのサービス

interface SearchResult {
  title: string;
  link: string; // 正確なURL
  snippet: string;
  displayLink: string; // ドメイン名
}

interface GoogleSearchResponse {
  items: SearchResult[];
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const errorData = await response.json();
    return errorData.error || `Server error: ${response.status}`;
  } catch {
    return `Server error: ${response.status}`;
  }
}

export async function searchGoogle(
  query: string,
  apiKey: string, // 使用しない（サーバー側で管理）
  searchEngineId: string, // 使用しない（サーバー側で管理）
  numResults: number = 20
): Promise<SearchResult[]> {
  try {
    console.log("🔍 Calling server Google search endpoint...");

    // 認証ヘッダーを取得
    const internalApiKey = import.meta.env.VITE_INTERNAL_API_KEY;

    if (!internalApiKey) {
      throw new Error(
        "内部APIキーが読み込まれていません。.env の INTERNAL_API_KEY / VITE_INTERNAL_API_KEY を確認し、サーバーを再起動してください。"
      );
    }

    // サーバーのエンドポイントを呼び出す
    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    const response = await fetch(`${backendUrl}/api/google-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": internalApiKey,
      },
      body: JSON.stringify({ query, numResults }),
    });

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      if (response.status === 401) {
        throw new Error(
          "内部API認証エラーです。.env の INTERNAL_API_KEY と VITE_INTERNAL_API_KEY を同じ値にして、bash ./start.sh を再起動してください。"
        );
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (data.success && data.results) {
      console.log(`✅ Got ${data.results.length} results from server`);
      return data.results.slice(0, numResults);
    }

    throw new Error("Invalid response from server");
  } catch (error) {
    console.error("❌ Google Custom Search API error:", error);
    throw error;
  }
}

// 検索結果をフォーマット
export function formatSearchResults(results: SearchResult[]) {
  return results.map((result, index) => ({
    rank: index + 1,
    title: result.title,
    url: result.link, // 正確なURL！
    snippet: result.snippet,
    domain: result.displayLink,
  }));
}

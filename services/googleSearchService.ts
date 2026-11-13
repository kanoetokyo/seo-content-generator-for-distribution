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

    // サーバーのエンドポイントを呼び出す
    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    const response = await fetch(`${backendUrl}/api/google-search`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, numResults }),
    });

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      if (response.status === 401) {
        throw new Error(
          "ログインの有効期限が切れました。ページを再読み込みしてログインし直してください。"
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

import { H2Section, NotionPostConfig } from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const getAuthHeaders = () => {
  const apiKey = import.meta.env.VITE_INTERNAL_API_KEY;
  return apiKey ? { "x-api-key": apiKey } : {};
};

interface UploadedNotionImage {
  h2Text: string;
  altText: string;
  fileUploadId: string;
}

interface NotionArticleResult {
  id: string;
  notionUrl: string;
  publicUrl: string | null;
  slug: string;
  status: "draft" | "published";
  imageCount: number;
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Notion連携でエラーが発生しました。");
  }
  return data;
}

export async function uploadImageToNotion(
  section: H2Section,
  index: number
): Promise<UploadedNotionImage> {
  const data = await request<{ image: UploadedNotionImage }>(
    "/notion/upload-image",
    {
      base64Image: section.generatedImage,
      h2Text: section.h2Text,
      altText: section.altText,
      index,
    }
  );
  return data.image;
}

export async function createNotionArticle(
  postConfig: NotionPostConfig,
  content: string,
  metaData: {
    metaDescription?: string;
    slug?: string;
    keyword?: string;
  },
  images: UploadedNotionImage[]
): Promise<NotionArticleResult> {
  const data = await request<{ article: NotionArticleResult }>(
    "/notion/create-article",
    {
      title: postConfig.title,
      content,
      status: postConfig.status,
      slug: metaData.slug,
      summary: metaData.metaDescription,
      keyword: metaData.keyword,
      images,
    }
  );
  return data.article;
}

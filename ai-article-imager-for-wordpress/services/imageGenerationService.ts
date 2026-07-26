const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface GeneratedImage {
  imageDataUrl: string;
  model: string;
  size: string;
  quality: string;
}

export async function generateKanoeImage(
  heading: string,
  context: string,
  customPrompt: string
): Promise<GeneratedImage> {
  const apiKey = import.meta.env.VITE_INTERNAL_API_KEY;
  const response = await fetch(`${API_BASE_URL}/images/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify({ heading, context, customPrompt }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "カノエくん画像の生成に失敗しました。");
  }
  if (!data.image?.imageDataUrl) {
    throw new Error("画像生成APIから画像データが返されませんでした。");
  }

  return data.image as GeneratedImage;
}

import { H2Section } from "../types";
import { createEnglishYAMLPrompt } from "./promptHelper";

const MAX_SECTION_CONTEXT_LENGTH = 1200;

function isSummaryHeading(h2Text: string): boolean {
  const normalized = h2Text.replace(/\s+/g, "").trim();
  return /^(まとめ|おわりに)(?:[：:].*)?$/.test(normalized);
}

function collectSectionContext(h2: Element): string {
  const parts: string[] = [];
  let nextElement = h2.nextElementSibling;

  while (nextElement && nextElement.tagName.toLowerCase() !== "h2") {
    if (!["script", "style", "noscript"].includes(nextElement.tagName.toLowerCase())) {
      const text = (nextElement.textContent || "").replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    }
    nextElement = nextElement.nextElementSibling;
  }

  return parts.join(" ").slice(0, MAX_SECTION_CONTEXT_LENGTH);
}

export function parseHtmlSimple(
  htmlContent: string,
  baseImageMap: Map<string, string>,
  promptStyle: string
): H2Section[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  const canonicalImage = Array.from(baseImageMap.entries())[0];

  if (!canonicalImage) return [];

  const [baseImageName, baseImage] = canonicalImage;
  return Array.from(doc.querySelectorAll("h2")).flatMap((h2, index) => {
    const h2Text = h2.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!h2Text || isSummaryHeading(h2Text)) {
      if (h2Text) {
        console.log(`⏭️ 「${h2Text}」はまとめ見出しのため画像生成を省略します`);
      }
      return [];
    }

    const paragraphText = collectSectionContext(h2);
    return [{
      id: index,
      h2Text,
      altText: `カノエくんが「${h2Text}」を解説するイラスト`.slice(0, 120),
      paragraphText,
      baseImageName,
      baseImage,
      prompt: createEnglishYAMLPrompt(h2Text, paragraphText, promptStyle),
      backgroundInstruction: "",
      status: "pending" as const,
      generatedImage: null,
      errorMessage: null,
      mediaId: null,
      sourceUrl: null,
      generationStep: null,
    }];
  });
}

/**
 * H2ごとに画面で調整できる追加指示を作る。
 * キャラクターの固定ルールはサーバー側で必ず付与する。
 */
export function createEnglishYAMLPrompt(
  h2Text: string,
  paragraphText: string,
  promptStyle: string,
  backgroundInstruction?: string
): string {
  const lines = [
    `「${h2Text}」の重要事項が画像だけでも直感的に伝わる場面にしてください。`,
    paragraphText
      ? `章の内容を踏まえる: ${paragraphText}`
      : "見出しに合う清掃現場や住宅設備を具体的に描いてください。",
    promptStyle || "明るく清潔で、やさしく信頼できるブログ解説イラスト",
  ];

  if (backgroundInstruction) {
    lines.push(`背景: ${backgroundInstruction}`);
  }

  return lines.join("\n");
}

export function extractAndCreatePrompt(
  h2Element: Element,
  promptStyle: string
): string {
  const h2Text = h2Element.textContent?.trim() || "";
  const paragraphText = h2Element.nextElementSibling?.textContent?.trim() || "";
  return createEnglishYAMLPrompt(
    h2Text,
    paragraphText.slice(0, 1200),
    promptStyle
  );
}

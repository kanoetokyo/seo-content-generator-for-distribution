const fs = require("node:fs");
const path = require("node:path");
const OpenAI = require("openai");
const { toFile } = require("openai");

const IMAGE_MODEL = "gpt-image-2";
const IMAGE_SIZE = "2048x1152";
const IMAGE_QUALITY = "medium";
const MAX_CONTEXT_LENGTH = 1200;
const MAX_CUSTOM_PROMPT_LENGTH = 2000;
const REFERENCE_IMAGE_PATH = path.join(
  __dirname,
  "..",
  "ai-article-imager-for-wordpress",
  "public",
  "default-images",
  "kanoe-kun.png"
);

function normalizeText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function determineSceneDirection(heading, context) {
  const content = `${heading} ${context}`;

  if (/注意|危険|失敗|NG|やってはいけない|デメリット|リスク/.test(content)) {
    return "カノエくんが危険な例を避け、安全な方法を身ぶりや清掃道具で示す注意喚起シーン";
  }
  if (/比較|違い|選び方|料金|費用|相場|メリット/.test(content)) {
    return "カノエくんが2つの状態や選択肢を見比べ、違いが一目で分かるように指し示す比較シーン";
  }
  if (/方法|手順|コツ|ポイント|掃除|清掃|洗浄|手入れ|対策/.test(content)) {
    return "カノエくんが日本の住宅や清掃現場で、適切な道具を使って作業やコツを実演するシーン";
  }
  if (/原因|仕組み|なぜ|理由|症状|構造/.test(content)) {
    return "カノエくんが対象物の仕組みや原因を、実物と分かりやすい視覚表現を使って解説するシーン";
  }

  return "カノエくんが見出しの重要事項を、関連する清掃現場や住宅設備の前で親しみやすく解説するシーン";
}

function buildKanoeImagePrompt({ heading, context, customPrompt }) {
  const safeHeading = normalizeText(heading, 200);
  const safeContext = normalizeText(context, MAX_CONTEXT_LENGTH);
  const safeCustomPrompt = normalizeText(customPrompt, MAX_CUSTOM_PROMPT_LENGTH);
  const sceneDirection = determineSceneDirection(safeHeading, safeContext);

  return `
添付画像のキャラクター「カノエくん」を使い、日本語の清掃ブログ用の横長イラストを1枚制作してください。

【記事の見出し】
${safeHeading}

【この章の内容】
${safeContext || "見出しの内容を視覚的に分かりやすく説明する"}

【シーンの役割】
${sceneDirection}

【カノエくんの固定ルール】
- 添付画像と同一人物として描く。別のマスコットや別人にしない。
- 大きな茶色の瞳、短い黒髪、丸い顔、頬の赤み、親しみやすい笑顔を維持する。
- 紺色の半袖ポロシャツ、紺色の作業ズボン、黒い靴、黒い腕時計を維持する。
- 胸の白いKANOEロゴは参照画像の形を保ち、崩れた文字や別のロゴにしない。
- 子どもっぽい等身の、清潔感と愛着がある高品質な2Dアニメ・キャラクターイラストにする。
- カノエくんは必ず1人登場させ、表情と動作で内容を説明する。

【構図と背景】
- 2048x1152の16:9横長。ブログ本文に自然に入る構図にする。
- カノエくんと重要な清掃対象が端で切れないよう、安全な余白を取る。
- 日本の住宅、店舗、清掃現場、住宅設備など、章の内容に合う具体的な背景にする。
- 見出しの内容が画像だけでも直感的に伝わる、小物・清掃道具・汚れの状態・動作を入れる。
- 同じ立ち姿の繰り返しではなく、章に合わせて作業、指差し、比較、確認などの動きを変える。

【禁止事項】
- 画像内に見出し、説明文、吹き出し、数字、透かし、署名を入れない。
- KANOEロゴ以外の文字やロゴを追加しない。
- 写実的な人間、3Dレンダリング、別の画風、暗く不安な雰囲気にしない。
- 手指や道具を不自然に増やさない。顔、制服、体型を参照画像から大きく変えない。

【追加の表現指示】
${safeCustomPrompt || "明るく清潔で、やさしく信頼できるブログ解説イラスト"}
`.trim();
}

function getRetryDelay(error, attempt) {
  const retryAfter = Number(error?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 60_000);
  }
  return Math.min(2 ** attempt * 2_000, 30_000);
}

function isRetryable(error) {
  return error?.status === 429 || (error?.status >= 500 && error?.status <= 599);
}

async function generateKanoeImage({ apiKey, heading, context, customPrompt, client }) {
  if (!apiKey) {
    const error = new Error("OpenAI APIが未設定です。OPENAI_API_KEYを設定してください。");
    error.status = 503;
    throw error;
  }
  if (!normalizeText(heading, 200)) {
    const error = new Error("画像生成にはH2見出しが必要です。");
    error.status = 400;
    throw error;
  }
  if (!fs.existsSync(REFERENCE_IMAGE_PATH)) {
    const error = new Error("カノエくんの基準画像が見つかりません。");
    error.status = 500;
    throw error;
  }

  const openai = client || new OpenAI({ apiKey, timeout: 180_000, maxRetries: 0 });
  const prompt = buildKanoeImagePrompt({ heading, context, customPrompt });
  const referenceImage = fs.readFileSync(REFERENCE_IMAGE_PATH);

  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await openai.images.edit({
        model: IMAGE_MODEL,
        image: await toFile(referenceImage, "kanoe-kun.png", {
          type: "image/png",
        }),
        prompt,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
        output_format: "jpeg",
        output_compression: 88,
        n: 1,
      });
      const imageBase64 = response?.data?.[0]?.b64_json;
      if (!imageBase64) {
        throw new Error("OpenAIから画像データが返されませんでした。");
      }

      return {
        imageDataUrl: `data:image/jpeg;base64,${imageBase64}`,
        model: IMAGE_MODEL,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
      };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, getRetryDelay(error, attempt)));
    }
  }

  const status = Number(lastError?.status) || 500;
  const message =
    status === 429
      ? "画像生成APIが混雑しています。少し待ってから再実行してください。"
      : lastError?.code === "moderation_blocked"
        ? "画像生成の安全確認により処理できませんでした。見出し表現を調整してください。"
        : "GPT Image 2での画像生成に失敗しました。";
  const error = new Error(message);
  error.status = status;
  error.cause = lastError;
  throw error;
}

module.exports = {
  IMAGE_MODEL,
  IMAGE_QUALITY,
  IMAGE_SIZE,
  REFERENCE_IMAGE_PATH,
  buildKanoeImagePrompt,
  determineSceneDirection,
  generateKanoeImage,
};

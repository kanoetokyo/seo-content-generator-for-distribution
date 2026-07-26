const test = require("node:test");
const assert = require("node:assert/strict");
const {
  IMAGE_MODEL,
  IMAGE_SIZE,
  REFERENCE_IMAGE_PATH,
  buildKanoeImagePrompt,
  determineSceneDirection,
  generateKanoeImage,
} = require("./openai-image-service.cjs");

test("GPT Image 2と16:9の出力設定を使用する", () => {
  assert.equal(IMAGE_MODEL, "gpt-image-2");
  assert.equal(IMAGE_SIZE, "2048x1152");
  assert.match(REFERENCE_IMAGE_PATH, /kanoe-kun\.png$/);
});

test("カノエくんの外見とブログ画像の禁止事項を固定する", () => {
  const prompt = buildKanoeImagePrompt({
    heading: "エアコン掃除のポイント",
    context: "フィルターを外して、ほこりを掃除機で吸い取ります。",
    customPrompt: "青空が見える明るい部屋",
  });

  assert.match(prompt, /同一人物/);
  assert.match(prompt, /紺色の半袖ポロシャツ/);
  assert.match(prompt, /カノエくんは必ず1人/);
  assert.match(prompt, /吹き出し/);
  assert.match(prompt, /2048x1152/);
  assert.match(prompt, /青空が見える明るい部屋/);
});

test("見出しに応じて清掃・注意・比較の場面を使い分ける", () => {
  assert.match(determineSceneDirection("掃除の手順", ""), /実演/);
  assert.match(determineSceneDirection("注意点", "危険な作業"), /注意喚起/);
  assert.match(determineSceneDirection("料金の比較", ""), /比較/);
});

test("カノエくん画像を参照画像付きのGPT Image 2編集として生成する", async () => {
  let request;
  const client = {
    images: {
      edit: async (params) => {
        request = params;
        return { data: [{ b64_json: Buffer.from("image").toString("base64") }] };
      },
    },
  };

  const result = await generateKanoeImage({
    apiKey: "test-key",
    heading: "浴室のカビを防ぐ方法",
    context: "換気と水分の拭き取りが重要です。",
    customPrompt: "明るい浴室",
    client,
  });

  assert.equal(request.model, "gpt-image-2");
  assert.equal(request.size, "2048x1152");
  assert.equal(request.quality, "medium");
  assert.equal(request.output_format, "jpeg");
  assert.equal(request.image.name, "kanoe-kun.png");
  assert.match(request.prompt, /浴室のカビを防ぐ方法/);
  assert.match(result.imageDataUrl, /^data:image\/jpeg;base64,/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  htmlToBlocks,
  inferCategory,
  toJstDate,
} = require("./notion-publisher.cjs");

test("HTMLをNotionの見出し・段落・リストブロックに変換する", () => {
  const { blocks } = htmlToBlocks(`
    <h1>エアコンクリーニングの目安</h1>
    <p>お手入れのタイミングを解説します。</p>
    <h2>フィルターを確認する</h2>
    <ul><li>電源を切る</li><li>フィルターを外す</li></ul>
  `);

  assert.deepEqual(
    blocks.map((block) => block.type),
    ["heading_1", "paragraph", "heading_2", "bulleted_list_item", "bulleted_list_item"]
  );
  assert.equal(
    blocks[1].paragraph.rich_text[0].text.content,
    "お手入れのタイミングを解説します。"
  );
});

test("生成画像を対応するH2見出しの直後に配置する", () => {
  const images = new Map([
    [
      "フィルターを確認する",
      [{ fileUploadId: "file-upload-id", altText: "フィルター清掃のイメージ" }],
    ],
  ]);
  const { blocks } = htmlToBlocks("<h2>フィルターを確認する</h2><p>本文です。</p>", images);

  assert.deepEqual(
    blocks.map((block) => block.type),
    ["heading_2", "image", "paragraph"]
  );
  assert.equal(blocks[1].image.file_upload.id, "file-upload-id");
});

test("記事内容から既存ブログ用のカテゴリを推定する", () => {
  assert.deepEqual(inferCategory("エアコンのカビ対策"), {
    name: "エアコンクリーニング",
    slug: "aircon",
  });
  assert.deepEqual(inferCategory("毎日の掃除のコツ"), {
    name: "お掃除豆知識",
    slug: "tips",
  });
});

test("公開日をJSTの日付で生成する", () => {
  assert.equal(toJstDate(new Date("2026-07-19T16:00:00.000Z")), "2026-07-20");
});

const fetch = require("node-fetch");
const FormData = require("form-data");
const { parseDocument } = require("htmlparser2");

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";
const MAX_NOTION_FILE_SIZE = 20 * 1024 * 1024;
const MAX_NOTION_CHILDREN = 100;

const CATEGORY_RULES = [
  {
    pattern: /エアコン|室内機|冷房|暖房|フィルター|カビ臭/i,
    name: "エアコンクリーニング",
    slug: "aircon",
  },
  {
    pattern: /洗濯機|洗濯槽|ドラム式/i,
    name: "洗濯機クリーニング",
    slug: "washing-machine",
  },
  {
    pattern: /キッチン|レンジフード|換気扇|コンロ/i,
    name: "キッチン・レンジフード",
    slug: "kitchen",
  },
  {
    pattern: /浴室|お風呂|バスルーム|トイレ|水回り|洗面/i,
    name: "浴室・水回り",
    slug: "bathroom",
  },
  {
    pattern: /ベランダ|バルコニー/i,
    name: "ベランダクリーニング",
    slug: "balcony",
  },
  {
    pattern: /外壁|高圧洗浄/i,
    name: "外壁洗浄",
    slug: "housewashing",
  },
  {
    pattern: /壁紙|クロス/i,
    name: "壁紙染色",
    slug: "wallpapercoating",
  },
  {
    pattern: /お客様の声|施工事例|事例|ビフォーアフター/i,
    name: "お客様の声・事例",
    slug: "case-study",
  },
];

class NotionPublisherError extends Error {
  constructor(message, status = 500, details) {
    super(message);
    this.name = "NotionPublisherError";
    this.status = status;
    this.details = details;
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitText(value, maxLength = 1900) {
  const text = String(value || "");
  if (!text) return [];

  const chunks = [];
  let remainder = text;
  while (remainder.length > maxLength) {
    let splitAt = remainder.lastIndexOf(" ", maxLength);
    if (splitAt < Math.floor(maxLength / 2)) splitAt = maxLength;
    chunks.push(remainder.slice(0, splitAt).trim());
    remainder = remainder.slice(splitAt).trim();
  }
  if (remainder) chunks.push(remainder);
  return chunks;
}

function richText(value) {
  return splitText(value).map((content) => ({
    type: "text",
    text: { content },
  }));
}

function textBlock(type, value) {
  const rich_text = richText(value);
  if (!rich_text.length && type !== "divider") return null;
  return {
    object: "block",
    type,
    [type]: type === "divider" ? {} : { rich_text },
  };
}

function imageBlock(fileUploadId, altText) {
  return {
    object: "block",
    type: "image",
    image: {
      type: "file_upload",
      file_upload: { id: fileUploadId },
      caption: richText(altText),
    },
  };
}

function externalImageBlock(url, altText) {
  return {
    object: "block",
    type: "image",
    image: {
      type: "external",
      external: { url },
      caption: richText(altText),
    },
  };
}

function getNodeText(node) {
  if (!node) return "";
  if (node.type === "text") return node.data || "";
  if (node.type === "comment") return "";
  if (node.type === "tag" && node.name === "br") return "\n";
  return (node.children || []).map(getNodeText).join("");
}

function getAttribute(node, name) {
  return node?.attribs?.[name] || "";
}

function getTopLevelNodes(html) {
  const document = parseDocument(html || "");
  const body = (document.children || []).find(
    (node) => node.type === "tag" && node.name === "body"
  );
  return body ? body.children || [] : document.children || [];
}

function listBlocks(node, type) {
  const blocks = [];
  for (const child of node.children || []) {
    if (child.type !== "tag" || child.name !== "li") continue;
    const text = normalizeText(getNodeText(child));
    const block = textBlock(type, text);
    if (block) blocks.push(block);
  }
  return blocks;
}

function tableBlocks(node) {
  const rows = [];
  const visit = (entry) => {
    if (entry.type === "tag" && entry.name === "tr") {
      const cells = (entry.children || [])
        .filter((child) => child.type === "tag" && ["th", "td"].includes(child.name))
        .map((cell) => normalizeText(getNodeText(cell)))
        .filter(Boolean);
      if (cells.length) rows.push(cells.join(" | "));
      return;
    }
    for (const child of entry.children || []) visit(child);
  };
  visit(node);
  return rows.map((row) => textBlock("paragraph", row)).filter(Boolean);
}

function toBlocks(nodes, imagesByHeading) {
  const blocks = [];
  const insertedHeadingImages = new Set();

  const addHeadingImages = (headingText) => {
    const key = normalizeText(headingText);
    if (insertedHeadingImages.has(key)) return;
    const images = imagesByHeading.get(key) || [];
    images.forEach((image) => blocks.push(imageBlock(image.fileUploadId, image.altText)));
    insertedHeadingImages.add(key);
  };

  const visit = (node) => {
    if (node.type === "text" || node.type === "comment") return;
    if (node.type !== "tag") return;

    const tagName = node.name.toLowerCase();
    const text = normalizeText(getNodeText(node));
    let block = null;

    if (tagName === "h1") block = textBlock("heading_1", text);
    else if (tagName === "h2") block = textBlock("heading_2", text);
    else if (["h3", "h4", "h5", "h6"].includes(tagName)) {
      block = textBlock("heading_3", text);
    } else if (tagName === "p") {
      block = textBlock("paragraph", text);
    } else if (tagName === "blockquote") {
      block = textBlock("quote", text);
    } else if (tagName === "ul") {
      blocks.push(...listBlocks(node, "bulleted_list_item"));
      return;
    } else if (tagName === "ol") {
      blocks.push(...listBlocks(node, "numbered_list_item"));
      return;
    } else if (tagName === "hr") {
      blocks.push(textBlock("divider"));
      return;
    } else if (tagName === "img") {
      const src = getAttribute(node, "src");
      if (/^https?:\/\//i.test(src)) {
        blocks.push(externalImageBlock(src, getAttribute(node, "alt")));
      }
      return;
    } else if (tagName === "table") {
      blocks.push(...tableBlocks(node));
      return;
    } else if (["main", "section", "article", "div", "figure", "body"].includes(tagName)) {
      for (const child of node.children || []) visit(child);
      return;
    } else {
      block = textBlock("paragraph", text);
    }

    if (block) blocks.push(block);
    if (tagName === "h2") addHeadingImages(text);
  };

  nodes.forEach(visit);
  return { blocks, insertedHeadingImages };
}

function htmlToBlocks(html, imagesByHeading = new Map()) {
  return toBlocks(getTopLevelNodes(html), imagesByHeading);
}

function inferCategory(...values) {
  const target = values.filter(Boolean).join(" ");
  const rule = CATEGORY_RULES.find((entry) => entry.pattern.test(target));
  return rule
    ? { name: rule.name, slug: rule.slug }
    : { name: "お掃除豆知識", slug: "tips" };
}

function toJstDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function createFallbackSlug(title) {
  const cleaned = String(title || "article")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return cleaned || `article-${Date.now()}`;
}

function parseBase64Image(value) {
  const match = String(value || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  const contentType = match?.[1] || "image/png";
  const encoded = match?.[2] || String(value || "");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) {
    throw new NotionPublisherError("画像データを読み取れませんでした。", 400);
  }
  if (buffer.length > MAX_NOTION_FILE_SIZE) {
    throw new NotionPublisherError("画像ファイルは20MB以下にしてください。", 413);
  }
  return { buffer, contentType };
}

function extensionFor(contentType) {
  const type = contentType.split("/")[1]?.toLowerCase();
  if (type === "jpeg") return "jpg";
  if (["png", "webp", "gif", "jpg"].includes(type)) return type;
  return "png";
}

async function notionRequest(token, path, options = {}) {
  const response = await fetch(`${NOTION_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new NotionPublisherError(
      data.message || "Notion APIのリクエストに失敗しました。",
      response.status,
      data
    );
  }
  return data;
}

async function uploadImageToNotion(token, image, index) {
  const { buffer, contentType } = parseBase64Image(image.base64Image);
  const filename = `seo-image-${index + 1}.${extensionFor(contentType)}`;
  const upload = await notionRequest(token, "/file_uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "single_part",
      filename,
      content_type: contentType,
    }),
  });

  const form = new FormData();
  form.append("file", buffer, { filename, contentType });
  await notionRequest(token, `/file_uploads/${upload.id}/send`, {
    method: "POST",
    headers: form.getHeaders(),
    body: form,
  });

  return {
    heading: normalizeText(image.h2Text),
    altText: normalizeText(image.altText),
    fileUploadId: upload.id,
  };
}

async function createNotionArticle({
  token,
  dataSourceId,
  title,
  content,
  slug,
  summary,
  keyword,
  status = "draft",
  images = [],
  authorName = "勅使河原　将",
  shopSlug = "corporate",
}) {
  if (!token || !dataSourceId) {
    throw new NotionPublisherError(
      "Notion連携が未設定です。NOTION_API_KEY と NOTION_BLOG_DATA_SOURCE_ID を設定してください。",
      503
    );
  }
  if (!normalizeText(title) || !normalizeText(content)) {
    throw new NotionPublisherError("記事タイトルと本文は必須です。", 400);
  }

  const articleStatus = status === "published" ? "published" : "draft";
  const uploadedImages = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (image.fileUploadId) {
      uploadedImages.push({
        heading: normalizeText(image.h2Text),
        altText: normalizeText(image.altText),
        fileUploadId: image.fileUploadId,
      });
      continue;
    }
    uploadedImages.push(await uploadImageToNotion(token, image, index));
  }

  const imagesByHeading = new Map();
  uploadedImages.forEach((image) => {
    if (!image.heading) return;
    const list = imagesByHeading.get(image.heading) || [];
    list.push(image);
    imagesByHeading.set(image.heading, list);
  });

  const { blocks, insertedHeadingImages } = htmlToBlocks(content, imagesByHeading);
  if (!blocks.some((block) => block.type === "heading_1")) {
    blocks.unshift(textBlock("heading_1", normalizeText(title)));
  }

  for (const image of uploadedImages) {
    if (!insertedHeadingImages.has(image.heading)) {
      blocks.push(imageBlock(image.fileUploadId, image.altText));
    }
  }

  const category = inferCategory(title, keyword, summary, content);
  const resolvedSlug = normalizeText(slug) || createFallbackSlug(title);
  const properties = {
    title: { title: richText(normalizeText(title)) },
    slug: { rich_text: richText(resolvedSlug) },
    summary: { rich_text: richText(normalizeText(summary)) },
    status: { select: { name: articleStatus } },
    published_at: { date: { start: toJstDate() } },
    author_name: { select: { name: authorName } },
    category_name: { multi_select: [{ name: category.name }] },
    category_slug: { multi_select: [{ name: category.slug }] },
    shop_slugs: { select: { name: shopSlug } },
  };

  const firstBatch = blocks.slice(0, MAX_NOTION_CHILDREN);
  const page = await notionRequest(token, "/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
      ...(firstBatch.length ? { children: firstBatch } : {}),
      ...(uploadedImages[0]
        ? {
            cover: {
              type: "file_upload",
              file_upload: { id: uploadedImages[0].fileUploadId },
            },
          }
        : {}),
    }),
  });

  for (let offset = MAX_NOTION_CHILDREN; offset < blocks.length; offset += MAX_NOTION_CHILDREN) {
    await notionRequest(token, `/blocks/${page.id}/children`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ children: blocks.slice(offset, offset + MAX_NOTION_CHILDREN) }),
    });
  }

  return {
    id: page.id,
    notionUrl: page.url,
    publicUrl:
      articleStatus === "published"
        ? `https://osoujiblog.kanoe.biz/blog/${encodeURIComponent(resolvedSlug)}`
        : null,
    slug: resolvedSlug,
    status: articleStatus,
    imageCount: uploadedImages.length,
  };
}

module.exports = {
  NotionPublisherError,
  createNotionArticle,
  inferCategory,
  htmlToBlocks,
  normalizeText,
  toBlocks,
  toJstDate,
  uploadImageToNotion,
};

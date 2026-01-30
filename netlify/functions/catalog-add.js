// netlify/functions/catalog-add.js
// Appends a new item into catalog.json stored in Cloudflare R2.
// Requires env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL (optional)

const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function cleanItem(item) {
  // Minimal validation + normalization
  const out = { ...item };

  if (!out.id || typeof out.id !== "string") throw new Error("Item.id is required");
  if (out.type !== "photo" && out.type !== "screenshot") throw new Error("Item.type must be photo|screenshot");
  if (!out.src || typeof out.src !== "string") throw new Error("Item.src is required");
  if (!out.thumb || typeof out.thumb !== "string") out.thumb = out.src;

  // year as number
  if (out.year != null) out.year = Number(out.year);
  if (!Number.isFinite(out.year)) {
    // try from date "YYYY-MM-DD"
    const y = Number(String(out.date || "").slice(0, 4));
    out.year = Number.isFinite(y) ? y : new Date().getFullYear();
  }

  // Optional: strip undefined
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);

  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let item;
  try {
    item = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  let cleaned;
  try {
    cleaned = cleanItem(item);
  } catch (e) {
    return json(400, { error: e.message || "Invalid item" });
  }

  // Env vars
  let accountId, accessKeyId, secretAccessKey, bucket;
  try {
    accountId = requireEnv("R2_ACCOUNT_ID");
    accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
    secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
    bucket = requireEnv("R2_BUCKET");
  } catch (e) {
    return json(500, { error: e.message });
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const CATALOG_KEY = "catalog.json";

  // 1) Read current catalog.json
  let catalog = { items: [] };
  try {
    const getRes = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: CATALOG_KEY })
    );

    const text = await streamToString(getRes.Body);
    const parsed = JSON.parse(text || "{}");
    catalog.items = Array.isArray(parsed.items) ? parsed.items : [];
  } catch (e) {
    // If missing, start fresh (but better to seed once)
    catalog = { items: [] };
  }

  // 2) De-duplicate by id (overwrite existing)
  const idx = catalog.items.findIndex((x) => x && x.id === cleaned.id);
  if (idx >= 0) {
    catalog.items[idx] = cleaned;
  } else {
    catalog.items.push(cleaned);
  }

  // Optional: newest-first sort by date
  catalog.items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  // 3) Write back catalog.json
  const body = Buffer.from(JSON.stringify(catalog), "utf-8");
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: CATALOG_KEY,
      Body: body,
      ContentType: "application/json",
      // Cache is controlled by headers on the public URL; this ensures object metadata is sane
    })
  );

  return json(200, {
    ok: true,
    item: cleaned,
    count: catalog.items.length,
    catalogKey: CATALOG_KEY,
  });
};

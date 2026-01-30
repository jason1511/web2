// netlify/functions/r2-sign.js
// Returns a presigned PUT URL for Cloudflare R2 (S3-compatible)
// Browser uploads image directly to R2 using the signed URL.

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // CORS (adjust if you want stricter origin checks)
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function sanitizeFilename(name) {
  // Keep it simple + safe for URLs/keys
  return String(name || "image")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "image";
}

function detectExt(contentType, fallbackName) {
  // Prefer content-type mapping; fall back to original filename extension if present
  const map = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  };
  if (contentType && map[contentType.toLowerCase()]) return map[contentType.toLowerCase()];
  const m = String(fallbackName || "").toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|avif)$/);
  if (!m) return ".jpg";
  return m[0] === ".jpeg" ? ".jpg" : m[0];
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Required env vars
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  // Optional: your public base URL for serving objects (e.g. https://media.yoursite.com)
  const publicBase = process.env.R2_PUBLIC_BASE_URL || "";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return json(500, {
      error: "Server is missing R2 env vars. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.",
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const {
    type,        // "photo" | "screenshot"
    source,      // optional string for metadata later
    filename,    // original local filename
    contentType, // e.g. "image/jpeg"
  } = payload;

  const t = type === "screenshot" ? "screenshots" : "photos";

  // Basic allow-list for content types
  const allowed = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ]);
  const ct = String(contentType || "").toLowerCase();
  if (!allowed.has(ct)) {
    return json(400, { error: `Unsupported contentType: ${contentType}` });
  }

  // Build an object key:
  // images/{photos|screenshots}/YYYY/MM/{timestamp}_{safeName}.{ext}
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

  const safeName = sanitizeFilename(filename || "image");
  const ext = detectExt(ct, safeName);
  const ts = Date.now();

  // Ensure filename ends with ext
  const baseNoExt = safeName.replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, "");
  const finalName = `${baseNoExt}${ext}`;

  const key = `images/${t}/${yyyy}/${mm}/${ts}_${finalName}`;

  // R2 endpoint (S3-compatible)
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: ct,
    // Optional: if you want all objects public, you typically do that via bucket policy
    // not ACL (R2 doesn't support ACL in the same way as S3).
  });

  // Signed URL valid for 5 minutes
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });

  // Public URL:
  // - If you have a custom domain/public base, use it.
  // - Otherwise you can still use an R2 public bucket + its public URL (configured in Cloudflare).
  const publicUrl = publicBase
    ? `${publicBase.replace(/\/$/, "")}/${key}`
    : `/${key}`; // placeholder (you'll set R2_PUBLIC_BASE_URL later)

  return json(200, {
    key,
    uploadUrl,
    publicUrl,
    // These are useful for your catalog creation later:
    type: t,
    source: source || "",
    contentType: ct,
  }, {
    "Cache-Control": "no-store",
  });
};

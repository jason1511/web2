// netlify/functions/catalog-get.js
// Returns the catalog.json stored in Cloudflare R2.

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

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

  try {
    const getRes = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: CATALOG_KEY })
    );

    const text = await streamToString(getRes.Body);
    const parsed = JSON.parse(text || "{}");
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return json(200, { items });
  } catch (e) {
    // If not found or parse issues, return empty catalog instead of failing the site
    return json(200, { items: [] });
  }
};

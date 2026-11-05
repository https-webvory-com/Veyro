import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import prisma from "../db.server.js";

function encryptionKey() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("AI credential storage is unavailable. Contact the app administrator.");
  return Buffer.from(hkdfSync("sha256", secret, "veyro-ai-v1", "merchant-credentials", 32));
}

export function encryptKey(value, shop) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(shop));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptKey(value, shop) {
  try {
    const [version, iv, tag, data] = value.split(".");
    if (version !== "v1") throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    cipher.setAAD(Buffer.from(shop));
    cipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([cipher.update(Buffer.from(data, "base64")), cipher.final()]).toString("utf8");
  } catch { throw new Error("The saved AI key cannot be read. Save your key again in AI settings."); }
}

export async function loadAiSettings(shop, db = prisma) {
  const record = await db.aiConnection.findUnique({ where: { shop } });
  let configured = false;
  if (record) { try { configured = Boolean(decryptKey(record.encryptedKey, shop) && record.model); } catch { /* A new key is required. */ } }
  return { configured, hasKey: Boolean(record), model: record?.model || "" };
}

export async function getAiCredentials(shop, db = prisma) {
  if (!shop) throw new Error("A store is required for AI analysis.");
  const record = await db.aiConnection.findUnique({ where: { shop } });
  if (!record) throw new Error("Add your OpenAI API key and model in AI settings first.");
  return { apiKey: decryptKey(record.encryptedKey, shop), model: record.model };
}

export async function handleAiSettings({ shop, formData, db = prisma }) {
  const intent = formData.get("intent");
  if (intent === "disconnect") {
    await db.$transaction(async (tx) => {
      await tx.aiConnection.deleteMany({ where: { shop } });
      await tx.imageSettings.updateMany({ where: { shop }, data: { autoProcess: false, autoApprove: false } });
    });
    return { message: "AI disconnected and automatic processing disabled. An already-running request may finish." };
  }
  if (intent !== "save") return { error: "Unknown settings action." };
  const apiKey = String(formData.get("apiKey") || "").trim();
  const model = String(formData.get("model") || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(model)) return { error: "Enter a valid vision-capable OpenAI model ID." };
  if (apiKey && (apiKey.length < 16 || apiKey.length > 512 || /\s|[^\x21-\x7e]/.test(apiKey))) return { error: "Enter a valid OpenAI API key without spaces." };
  const existing = await db.aiConnection.findUnique({ where: { shop } });
  if (!apiKey && !existing) return { error: "Enter your OpenAI API key." };
  let encryptedKey;
  try {
    if (!apiKey) decryptKey(existing.encryptedKey, shop);
    encryptedKey = apiKey ? encryptKey(apiKey, shop) : existing.encryptedKey;
  } catch (error) { return { error: error.message }; }
  await db.aiConnection.upsert({ where: { shop }, create: { shop, encryptedKey, model }, update: { encryptedKey, model } });
  return { message: "AI settings saved. Model access will be checked when you analyze an image." };
}

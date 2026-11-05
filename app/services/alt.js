export const DEFAULT_TEMPLATE = "[Category] [Product Title] [Color]";

const normalize = (value) => String(value).normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function matchColor(color, colors) {
  return colors.find((candidate) => normalize(candidate) === normalize(color)) || null;
}

export function generateAlt(template, { title, category, color }) {
  const titleWords = ` ${normalize(title)} `;
  const values = {
    "Product Title": title,
    Category: category && !titleWords.includes(` ${normalize(category)} `) ? category : "",
    Color: color && !titleWords.includes(` ${normalize(color)} `) ? color : "",
  };
  return template.replace(/\[(Product Title|Category|Color)\]/g, (_, key) => values[key])
    .replace(/\s+/g, " ").trim().slice(0, 512);
}

export function validateSettings(formData) {
  const altTemplate = String(formData.get("altTemplate") || "").trim();
  const confidenceThreshold = Number(formData.get("confidenceThreshold"));
  if (!altTemplate.includes("[Product Title]") || altTemplate.length > 300 || /\[[^\]]*\]/.test(altTemplate.replace(/\[(Product Title|Category|Color)\]/g, ""))) {
    throw new Error("Use [Product Title] and optional [Category] / [Color] tokens, within 300 characters.");
  }
  if (!Number.isInteger(confidenceThreshold) || confidenceThreshold < 70 || confidenceThreshold > 100) {
    throw new Error("Choose a confidence threshold between 70 and 100.");
  }
  return { altTemplate, confidenceThreshold };
}

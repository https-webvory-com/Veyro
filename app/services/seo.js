export function cleanText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

export function clipText(value, max) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  const shortened = text.slice(0, max - 1);
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary > max * 0.6 ? boundary : undefined).trimEnd()}…`;
}

export function suggestMetadata(product) {
  return {
    suggestedTitle: clipText(product.seo?.title || product.title, 70),
    suggestedDescription: clipText(product.seo?.description || product.description, 160),
  };
}

export function auditProducts(products) {
  const effectiveTitle = (product) => cleanText(product.seo?.title || product.title);
  const normalize = (text) => text.normalize("NFKC").toLocaleLowerCase();
  return products.map((product) => {
    const title = effectiveTitle(product);
    const description = cleanText(product.seo?.description || product.description);
    const duplicate = products.some((other) => other.id !== product.id && normalize(effectiveTitle(other)) === normalize(title));
    const checks = [
      { id: "title", label: "Search title", passed: title.length > 0 && title.length <= 70,
        detail: `${title.length} characters. ${product.seo?.title ? "Custom SEO title." : "Using product title fallback."} Veyro suggests up to 70 characters.` },
      { id: "description", label: "Search description", passed: description.length > 0 && description.length <= 160,
        detail: `${description.length} characters. ${product.seo?.description ? "Custom SEO description." : "Using product description fallback."} Veyro suggests up to 160 characters; this is an editorial guideline.` },
      { id: "content", label: "Product description", passed: Boolean(cleanText(product.description)), detail: "Give shoppers a useful description of this product." },
      { id: "images", label: "Product imagery", passed: product.imageCount > 0, detail: `${product.imageCount} images found in the inspected media.` },
      { id: "alt", label: "Image ALT coverage", passed: product.imageCount > 0 && product.missingAltCount === 0,
        detail: `${product.missingAltCount} images lack ALT in the first 20 media items.${product.mediaTruncated ? " More media exists and has not been checked." : ""}` },
      { id: "unique", label: "Distinct search title", passed: !duplicate, detail: duplicate ? "Another product on this page has the same effective title." : "No duplicate title among products on this page." },
    ];
    return { ...product, ...suggestMetadata(product), audit: { checks, passed: checks.filter((check) => check.passed).length, total: checks.length } };
  });
}

export function validateMetadata(formData) {
  const title = cleanText(formData.get("title"));
  const description = cleanText(formData.get("description"));
  if (!title || title.length > 70) throw new Error("Enter a search title between 1 and 70 characters.");
  if (!description || description.length > 320) throw new Error("Enter a search description between 1 and 320 characters.");
  return { title, description };
}

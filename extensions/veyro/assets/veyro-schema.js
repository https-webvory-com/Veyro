(() => {
  function typesIn(value, types) {
    if (!value || typeof value !== "object") return;
    for (const type of [].concat(value["@type"] || [])) types.add(type);
    for (const child of Object.values(value)) if (child && typeof child === "object") typesIn(child, types);
  }
  function addMissing() {
    const types = new Set();
    document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
      try { typesIn(JSON.parse(node.textContent), types); } catch { /* Existing invalid markup must be repaired separately. */ }
    });
    document.querySelectorAll("[itemtype]").forEach((node) => {
      for (const value of node.getAttribute("itemtype").split(/\s+/)) types.add(value.split("/").pop());
    });
    document.querySelectorAll("script[data-veyro-schema]").forEach((candidate) => {
      const product = candidate.dataset.veyroSchema === "product";
      const equivalents = product ? ["Product", "ProductGroup"] : ["Organization", "Store", "OnlineStore", "LocalBusiness"];
      if (equivalents.some((type) => types.has(type))) return;
      try {
        const data = JSON.parse(candidate.textContent);
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.textContent = JSON.stringify(data);
        document.head.appendChild(script);
        typesIn(data, types);
      } catch { /* Do not inject malformed candidate data. */ }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addMissing, { once: true });
  else addMissing();
})();

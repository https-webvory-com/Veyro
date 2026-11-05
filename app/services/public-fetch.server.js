import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

export function publicUrl(value, origin) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || (origin && url.origin !== origin)) throw new Error("Only HTTPS URLs on the approved public host can be checked.");
  return url;
}

// Pin the validated DNS result into the socket lookup to prevent DNS rebinding.
export async function publicGet(value, { origin, maxBytes = 2 * 1024 * 1024, redirects = 3 } = {}) {
  const url = publicUrl(value, origin);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("The host does not resolve exclusively to public internet addresses.");
  const chosen = addresses[0];
  const started = Date.now();
  const response = await new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "Veyro-SEO/1.0", "Accept-Encoding": "identity" },
      lookup: (_host, options, callback) => options.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
    }, (incoming) => {
      const chunks = []; let size = 0;
      incoming.on("data", (chunk) => { size += chunk.length; if (size > maxBytes) { request.destroy(new Error("Response exceeds the scan size limit.")); } else chunks.push(chunk); });
      incoming.on("error", reject);
      incoming.on("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks), responseMs: Date.now() - started, url: url.href }));
    });
    const deadline = setTimeout(() => request.destroy(new Error("Public URL request timed out.")), 15000);
    request.on("close", () => clearTimeout(deadline));
    request.on("error", reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
    if (!redirects) throw new Error("Too many redirects.");
    return publicGet(new URL(response.headers.location, url).href, { origin: origin || url.origin, maxBytes, redirects: redirects - 1 });
  }
  return response;
}

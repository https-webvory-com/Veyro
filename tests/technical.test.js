import test from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, publicUrl } from "../app/services/public-fetch.server.js";
import { relativePath, inspectHtml, handleTechnical } from "../app/services/technical.server.js";

test("public fetch rejects loopback, private, link-local, and mapped private addresses", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
});
test("fetch URLs cannot cross origins or carry credentials", () => {
  for (const url of ["http://shop.example/", "https://user:password@shop.example/", "https://other.example/", "https://shop.example:8443/"]) assert.throws(() => publicUrl(url, "https://shop.example"));
});
test("store paths reject encoded unsafe and account routes", () => {
  for (const path of ["https://other.example/", "//other.example", "/%2fother.example", "/car%74/add", "/foo/../admin", "/%5cother.example", "/account", "/checkout"]) assert.throws(() => relativePath(path), path);
  assert.equal(relativePath("/products/dress"), "/products/dress");
});
test("HTML scan parses ProductGroup, metadata, and bounded public links", () => {
  const html = `<title>Dress &amp; more</title><meta name="description" content="A dress"><meta name="robots" content="noindex"><link rel="canonical" href="https://shop.example/products/dress"><h1>Dress</h1><script type="application/ld+json">{"@graph":[{"@type":"ProductGroup"}]}</script><a href="/collections/all">Shop</a><a href="https://external.example">External</a><a href="/cart/add">Cart</a><a href="/products/dress?variant=1">Variant</a>`;
  const report = inspectHtml(html, "https://shop.example/products/dress");
  assert.equal(report.title, "Dress & more"); assert.equal(report.hasProductSchema, true); assert.equal(report.robotsNoindex, true); assert.equal(report.h1Count, 1);
  assert.deepEqual(report.linkUrls, ["https://shop.example/collections/all"]);
});
test("redirect creation verifies broken source and working destination", async () => {
  const queries = [];
  const admin = { graphql: async (query, { variables }) => {
    queries.push(query);
    if (!query.includes("mutation")) return Response.json({ data: { shop: { primaryDomain: { url: "https://shop.example" } } } });
    assert.deepEqual(variables.redirect, { path: "/old", target: "/new" });
    return Response.json({ data: { urlRedirectCreate: { urlRedirect: { id: "redirect" }, userErrors: [] } } });
  } };
  const formData = new FormData(); formData.set("intent", "redirect"); formData.set("path", "/old"); formData.set("target", "/new");
  const result = await handleTechnical({ admin, shop: "shop", formData, get: async (url) => ({ status: url.endsWith("/old") ? 404 : 200 }) });
  assert.match(result.message, /created/); assert.equal(queries.length, 2);
  const failed = await handleTechnical({ admin, shop: "shop", formData, get: async () => ({ status: 200 }) });
  assert.match(failed.error, /source must/); assert.equal(queries.length, 3);
});

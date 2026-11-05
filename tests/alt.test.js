import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATE, generateAlt, matchColor, validateSettings } from "../app/services/alt.js";

test("ALT omits color already present in the title without removing substrings", () => {
  assert.equal(generateAlt(DEFAULT_TEMPLATE, { title: "Long Black Evening Dress", category: "Formal Dresses", color: "Black" }), "Formal Dresses Long Black Evening Dress");
  assert.equal(generateAlt(DEFAULT_TEMPLATE, { title: "Blackberry dress", category: "", color: "Black" }), "Blackberry dress Black");
});
test("color matching is exact after normalization and never guesses", () => {
  assert.equal(matchColor("navy-blue", ["Navy Blue", "Black"]), "Navy Blue");
  assert.equal(matchColor("blue", ["Navy Blue"]), null);
});
test("settings reject unsupported tokens and invalid thresholds", () => {
  const form = new FormData();
  form.set("altTemplate", DEFAULT_TEMPLATE); form.set("confidenceThreshold", "95");
  assert.equal(validateSettings(form).confidenceThreshold, 95);
  form.set("confidenceThreshold", "69"); assert.throws(() => validateSettings(form));
  form.set("confidenceThreshold", "95"); form.set("altTemplate", "[Product Title] [Price]");
  assert.throws(() => validateSettings(form));
});

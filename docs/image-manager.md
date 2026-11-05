# Veyro image manager — first MVP

This page describes the original manual slice. The app now also supports automatic processing, variant assignment, compression/restore, and technical SEO. Read [current operations and limits](automation-and-operations.md) for the updated capabilities and setup.

Veyro now also includes an **SEO workspace** with product audits, metadata drafts, search previews, and publishing history. See [SEO expansion and roadmap](seo-suite-roadmap.md).

The `/app` screen now loads the latest 20 Shopify products and each product's first 20 media items. An Analyze action sends one previously unreviewed image to OpenAI, detects its visible color, matches exact normalized color option labels, and saves an ALT suggestion using the merchant's template. Each suggestion requires merchant approval. The app writes approved ALT text using Shopify `fileUpdate` and retains the pre-analysis ALT text. It does not assign variant images.

## Run

1. Run `npm install` and `npm run setup` (on Windows PowerShell, use `npm.cmd` if script execution is disabled).
2. Set `OPENAI_API_KEY` and `OPENAI_VISION_MODEL` in the server environment. Choose a vision-capable model supporting Structured Outputs. Never put the key in client code. Each Analyze click sends the Shopify-hosted image URL and color option labels to OpenAI and consumes API usage. With no configuration, the library and settings remain usable and analysis is disabled.
3. Run `npm run dev`, connect a development store, and open the embedded app. Accept updated file permissions when Shopify requests them. The existing scopes are preserved; `read_files` and `write_files` were added.
4. Analyze a product, inspect/edit its ALT suggestion, then approve. Confirm the resulting ALT in Shopify. Dismiss leaves Shopify unchanged.

## Checks

`node --test tests/*.test.js`, `npm run lint`, `npm run build`, and `npm run typecheck`.

## Current boundaries

- SQLite and request-time processing are retained from the starter. There is no Redis worker, webhook automation, bulk catalog pagination, auto-approval, variant assignment, billing, or production deployment in this slice.
- Confidence is an AI estimate, not calibrated accuracy. The saved threshold flags suggestions for closer review; it never authorizes automatic writes.
- The dashboard shows the most recent 100 reviews. Analysis skips media with an existing review, including dismissed reviews. Reprocessing and a complete history browser are future work.
- Shopify errors and AI failures surface in the interface. Requests to AI time out after 45 seconds. Shopify ALT is checked before writing to avoid knowingly overwriting later merchant changes; Shopify does not provide an atomic compare-and-set for this mutation, so a simultaneous external edit remains possible.
- An interrupted process during publishing can leave an `applying` record. Reconcile the ALT in Shopify before manually recovering that record. A durable worker with leases and reconciliation is needed before unattended use.
- Uninstallation removes this shop's sessions, settings, and reviews. Production readiness still requires the applicable Shopify privacy/compliance flows and a full installed-store acceptance test.

## API references

- [Shopify fileUpdate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/fileUpdate)
- [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

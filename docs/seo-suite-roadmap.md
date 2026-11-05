# Veyro SEO expansion

The automation, optimization, technical SEO, structured-data embed, and Google integration follow-up is now implemented. See [current operations and limits](automation-and-operations.md) for setup, live-test requirements, and the persistent SQLite queue architecture.

Reviewed September 11, 2026 using Avada's public Shopify listing and help center. This is a review of documented capabilities, not an installed-app benchmark or verification of performance claims.

## What the comparison shows

Avada covers image optimization, on-page audits, metadata, technical SEO, and speed optimization. Its broader workflows connect finding an issue with editing the affected content. Veyro's next useful step is to connect its existing image review flow with a product SEO audit and publishing workspace. The implementation uses Veyro's own interface and code.

| Capability | Veyro status |
| --- | --- |
| Image ALT analysis and merchant approval | Existing MVP |
| Product SEO checklist | Added: six deterministic checks on product metadata, content, imagery, ALT, and duplicate titles within each page |
| Search titles and meta descriptions | Added: bulk draft preparation, editable previews, and individual publishing |
| Publishing history | Added: original overrides and attempted/published values, shop isolation, stale-edit checks and interrupted-write reconciliation |
| Full catalog navigation | Added for SEO: cursor-based product pagination, 20 products per page |
| Compression and resizing | Added: JPEG/PNG backup, preview, measured savings, publishing, restore, and background processing |
| Broken links and redirects | Added: bounded page scans, HTTP evidence, and reviewed redirects |
| Structured data | Added: HTML JSON-LD inspection and optional missing-schema theme embed |
| Page speed | Added: Google mobile Lighthouse measurements and image-size optimization; theme-wide tuning remains separate |
| Sitemap/Search Console | Added: service-account traffic sync and explicit sitemap submission, requiring Google configuration |
| Image automation | Added: product webhooks, durable jobs, high-confidence approval, and optional empty-variant image assignment |
| AI content and keyword research | Later: extend beyond image analysis and deterministic metadata drafts |
| Collections, pages, and blog articles | Later: expand the product-only editor and audit |

## Run and use the new workspace

1. `npm.cmd run setup` applies migrations and generates Prisma (use `npm` on shells where supported).
2. `npm.cmd run dev`, then open **SEO workspace** in the installed app.
3. Review product checklists. Select up to 20 products and choose **Prepare SEO drafts**.
4. Edit each title and description, inspect the illustrative preview, then **Publish SEO changes**. Dismiss unwanted drafts.
5. If an update is interrupted, wait two minutes and choose **Check update status**. This reads Shopify and reconciles the saved attempt; it does not publish another write.

The SEO workspace works without an OpenAI key. Drafts are excerpts of existing product content or SEO overrides, never AI-generated claims. Empty source descriptions remain empty for merchant input. The original image-analysis feature still requires its OpenAI configuration.

## Implementation boundaries

- Audit data comes from Shopify Admin, not rendered storefront HTML. Theme overrides, actual H1 tags, schema, canonical tags, robots rules, crawlability, and performance are not checked.
- Each product audit inspects its first 20 media items; it explicitly discloses remaining media. Duplicate-title checks apply only to the current 20-product page.
- Up to 50 review/history records are shown. Active drafts are returned oldest first so completing them reveals the next drafts; recent completed history fills remaining slots. One active draft per product prevents duplicate pending work. Bulk draft preparation does not publish in bulk.
- A missing custom SEO value uses product content as an estimated fallback, not an automatic failure. Actual storefront rendering depends on the theme. Length suggestions are editorial guidance, not Google ranking rules. Veyro allows title edits up to 70 characters and descriptions up to 320, with a 160-character draft target.
- Publishing changes only `product.seo` through `productUpdate` using the existing `write_products` scope. It preserves the original override values in history and does not touch the product title, body, handle, theme, or files.
- External edits between the stale check and Shopify mutation remain possible because the API does not expose a metadata compare-and-set operation. Failed mutations with unknown outcomes stay in `applying` until reconciled. A durable worker is still needed for unattended automation.
- Database migrations add `SeoDraft`. Uninstall cleanup deletes that shop's SEO drafts along with its other app data.
- Live store mutation acceptance tests require an authenticated development store. Automated tests use mocked Shopify responses and never update a merchant's products.

## Sources

- [Avada Shopify listing](https://apps.shopify.com/avada-seo-suite)
- [Avada help center](https://docs.avada.io/seo-suite-help-center/)
- [Avada on-page checklist](https://docs.avada.io/seo-suite-help-center/seo-on-page-audit/checklist/)
- [Avada metadata tools](https://docs.avada.io/seo-suite-help-center/search-appearance/meta-tags/)
- [Avada image compression](https://docs.avada.io/seo-suite-help-center/image-optimization/image-compression/)
- [Shopify productUpdate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productUpdate)
- [Shopify SEOInput](https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/SEOInput)
- [Google: snippets and descriptions](https://developers.google.com/search/docs/appearance/snippet)

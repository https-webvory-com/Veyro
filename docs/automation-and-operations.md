# Veyro automation and operations

## Implemented workflows

- **Automation:** persisted jobs, offline Shopify authentication, product-create/update webhooks, catalog pagination, full product-media pagination, retry/backoff, lease renewal, worker heartbeat, and job retry/cancellation controls.
- **Automatic image approval:** explicit merchant opt-in; requires a matching color, confidence at or above the configured threshold (minimum 95%), and empty original ALT. Existing ALT is preserved for merchant review. Changing a product/image/template creates a fresh analysis; ALT-only webhook events do not create endless updates. Pending reviews are preserved.
- **Variant assignment:** optional during manual approval or auto-approval. Reads all current variants, matches Color/Colour values without guessing synonyms, includes size variants, and assigns only variants without existing media. Manual assignments require at least 70% confidence. Existing assignments are preserved.
- **Image optimization:** JPEG and PNG originals up to 20 MB / 40 megapixels; resize without enlargement, JPEG quality control, lossless PNG compression, original bytes backed up in the database, authenticated before/after previews, measured savings, approved publishing, and original restoration. Animated images and other formats are rejected rather than converted silently.
- **Technical SEO:** public HTML scans, title/description/canonical/H1/noindex and JSON-LD observations, up to 20 same-origin public links checked per scan, 404/410 findings, and reviewed redirects. Redirect creation requires a broken source and a successful destination.
- **Google integrations:** queued mobile Lighthouse/PageSpeed reports, Search Console daily traffic over a 28-day window ending three days ago, and explicit Shopify sitemap submission. All data is bound to the Shopify primary-domain URL-prefix property.
- **Structured data:** optional `Veyro missing schema` theme app embed. Both types default off. It uses Shopify's product structured-data filter and basic organization data, checks existing JSON-LD/microdata, then inserts missing markup after DOM readiness. It does not edit theme files.

## Start locally

1. Use Node 22.12 or newer within the package's supported engine range. Run `npm.cmd install` and `npm.cmd run setup`.
2. Put the Shopify API key, secret, and app URL in the server environment or ignored `.env`. The worker needs the same Shopify credentials and SQLite database as the web process. Shopify CLI supplies web-process credentials during development, but a separately launched worker also needs those values.
3. Open **Veyro > AI settings** in Shopify Admin and save the store's OpenAI API key and vision-capable model ID. Merchant credentials are stored per shop; environment OpenAI credentials are no longer used. The catalog action may make one paid AI request per image needing analysis.
4. Run `npm.cmd run dev` for the web app and `npm.cmd run worker` in another terminal. Open **Automation** to confirm the worker heartbeat. `npm.cmd run worker -- --once` processes at most one job for operational checks.
5. Accept the app's new navigation scopes and synchronize the app webhook configuration through Shopify's development/deployment workflow. Local config validation/build does not deploy those subscriptions.
6. Enable automation preferences only when ready. Catalog processing can be queued manually while webhook processing is off. Automatic publishing still follows its separate switch.

## Google configuration

- Enable the PageSpeed Insights API and set `PAGESPEED_API_KEY` on both web and worker processes.
- Enable the Search Console API. Set a one-line service account JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`, stored as a deployment secret. Add its `client_email` as an authorized user of the exact `https://primary-domain/` URL-prefix Search Console property. Domain-only properties are not used by this version.
- Sync uses read-only authorization. Sitemap submission uses write authorization only for that explicit job. Tokens are short-lived and not returned to the browser. The app does not create or verify ownership of Search Console properties.
- A Google configuration flag means credentials are present, not that Google access has been verified. Failed API calls appear in reports and job history. A retained report after a failed refresh is historical data.
- Lighthouse is a lab measurement, not real-user Core Web Vitals. Search Console can return no rows for a new or low-traffic property. Sitemap submission does not guarantee indexing.

## Theme extension

Deploy the app extension, then enable **Veyro missing schema** in the theme editor's App embeds and select only needed types. Validate the rendered page with Google's Rich Results Test. The HTML scanner does not execute JavaScript and therefore does not observe JSON-LD injected by this embed. Markup added by other apps after DOM readiness can still need manual duplicate checks. Product schema is not appropriate for every storefront page.

## Persistence, recovery, and limits

- This implementation uses the existing Prisma/SQLite database as a durable queue and backup store. It does **not** use the diagram's Redis/BullMQ/PostgreSQL stack. Run one worker against the same persistent database volume as the web app. Do not run replicas with independent SQLite files or deploy to ephemeral serverless storage. PostgreSQL/Redis migration is a separate scaling task.
- Jobs are attempted up to three times, with 30/60-second backoff and a renewed two-minute lease. Failures are visible and can be retried. Cancelling a queued/failed job preserves completed work; cancelling a catalog job does not remove product jobs already queued by it.
- A process crash may repeat an AI request. Review fingerprints and unique constraints prevent duplicate stored reviews. Shopify writes are reconciled where possible, but Shopify's APIs do not provide atomic compare-and-set across a local database and remote state. Simultaneous merchant edits between checks and mutation remain possible.
- The optimizer verifies original-content hashes before replacement/restoration. It checks the resulting original bytes after upload. If Shopify transforms an upload or its outcome cannot be verified, the job stays unresolved instead of assuming success. Inspect the result and retry from Automation. Originals are retained; restoration is not claimed until verified.
- Backups are stored as database bytes. Provision disk space and database backups appropriate to the image catalog. There is no automatic retention purge; uninstall removes the shop's optimization backups, scans, integration reports, jobs, settings, and reviews. Shopify images already changed are not automatically reverted by uninstall.
- Image optimization is not blanket JavaScript/CSS/theme acceleration. This release provides image-size reductions, measured performance reports, and findings for further tuning. No untested theme-wide lazy-loading or minification is injected.
- The optimizer displays the latest 30 files and 50 optimization records; job history shows the latest 50 jobs. A complete history browser, per-shop job quotas, image-backup export, billing, and hosted multi-worker scaling are not yet implemented.
- Public scans are HTTPS-only, pin validated public DNS addresses, reject private/link-local IPs, bound response size/time, and do not follow off-origin redirects. Password-protected stores, challenge pages, blocked crawlers, and external redirects may not be inspectable. A failed fetch is reported separately from a confirmed 404/410.
- Live Shopify/OpenAI/Google acceptance testing requires real credentials, an installed development store, and a running worker. Local tests use fixtures/mocks plus real in-memory image compression; they do not publish merchant changes.

## Verification and dependency note

Run `node --test tests/*.test.js`, `npm.cmd run lint`, `npm.cmd run build`, and `npm.cmd run typecheck`. Shopify CLI config validation and theme extension build also run locally; neither publishes the app.

The production dependency audit reported four high-severity entries in the existing Prisma → `@prisma/config` → `deepmerge-ts` dependency chain. The suggested automatic fix downgrades Prisma/Shopify session packages across breaking versions, so it was not applied. Resolve and retest this chain before production release. The newly added image/network/parser packages were not named in that production audit.

## References

- [Shopify variant media updates](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkUpdate)
- [Shopify file updates](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/fileUpdate)
- [Shopify redirects](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/urlRedirectCreate)
- [Shopify structured-data filter](https://shopify.dev/docs/api/liquid/filters/structured_data)
- [Sharp resizing](https://sharp.pixelplumbing.com/api-resize/)
- [PageSpeed API](https://developers.google.com/speed/docs/insights/v5/get-started)
- [Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [Google service-account authorization](https://developers.google.com/identity/protocols/oauth2/service-account)

## Merchant AI credential storage

Keys are encrypted using AES-256-GCM with shop-bound authenticated data. The encryption key is derived with HKDF from the existing Shopify app secret. The web app and worker must use the same Shopify app secret. Back up that secret securely with the database; rotating it currently requires merchants to re-enter their AI keys. Keys are never included in loader/action responses or job payloads. Disconnect removes the credential and disables automatic processing/approval; in-flight calls may finish. Saving validates input format, not provider access. Shopify-authenticated users with access to Veyro can manage their store connection. Uninstall removes saved credentials.

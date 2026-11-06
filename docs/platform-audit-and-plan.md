# Veyro platform expansion: audit, preservation plan, and phased roadmap

Status: **proposal, awaiting approval.** Nothing in the application has been changed as part of this audit.
Audited: 6 November 2026, branch `postgres-and-domain-setup` at commit `8cf0b66` (in sync with `origin`), plus uncommitted work listed in section 2.4.

---

## 1. Summary

Veyro today is a single-tenant-per-install Shopify embedded app with a mature **image and SEO suite** and an early **tracking suite** that is mostly scaffolding. The SEO side is well built: durable job queue, backups before every write, restore paths, and 79 passing tests. The tracking side has real Google OAuth and order storage, but most tracking pages display data that nothing currently writes.

The requested platform is large: 15 modules, six ad platforms, three email platforms, server-side tracking, attribution models, AI, and reporting. It is achievable as a phased program, but several parts depend on **external approvals that code cannot shortcut** (section 7), and two requirements, **combined multi-store dashboards** and **custom role permissions**, need an identity layer that a Shopify embedded app does not provide on its own (decision D1).

Before new modules are built, four existing issues should be fixed. All four are small, and two block Shopify App Store approval (section 5).

**Shopify standard:** every module in this plan is designed to meet the [Shopify App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) and the [Built for Shopify requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements), both read on 6 November 2026. Section 1A maps each applicable requirement to Veyro's current status and the phase that closes it.

### Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| D1 | How users reach multiple stores and how roles work | Everything stays inside the Shopify admin (Built for Shopify 3.1.2: primary workflows must not need an external site). Phase 2a: Shopify staff permissions plus Veyro roles per store, using online-session user identity. Phase 2b (optional): link stores into an organization, so each store's embedded app can show a combined view to users verified as staff on every linked store |
| D2 | What happens to a store's data on uninstall | Stop deleting immediately; keep data until Shopify's `shop/redact` request (48 hours after uninstall), then delete |
| D3 | Who sends conversions when Shopify's own Google or Meta channel apps are installed | Detect them and let the merchant choose one sender per platform, to prevent double counting |
| D4 | Order of ad platforms | Google Ads + GA4 first (OAuth exists), then Meta, Microsoft, TikTok, Pinterest, Snapchat |
| D5 | Uncommitted attribution work (2.4) | Keep it as the order-level summary layer; commit on a feature branch after review |
| D6 | Encryption key for new platform credentials | Add a dedicated `VEYRO_ENCRYPTION_KEY` (versioned) instead of deriving from `SHOPIFY_API_SECRET` |

---

## 1A. Shopify standards compliance

Status key: ✅ meets it today · ⚠️ gap to close · 🔜 applies to a module not built yet (built to the rule from the start).

### App Store requirements

| Ref | Requirement | Veyro today | Action | Phase |
|---|---|---|---|---|
| 1.1.1 | Session tokens; works without third-party cookies or local storage | ✅ `shopify-app-react-router` token auth; no browser storage in app code | Keep | — |
| 1.1.4 | Use only factual information | ✅ no fabricated data; placeholder pages show empty states | Hide placeholder pages until they work | 0 |
| 1.2.1–1.2.3 | Charges only through Shopify Billing API or Shopify App Pricing; plan changes without support or reinstall | ⚠️ no billing implemented | If Veyro is paid: Shopify App Pricing (managed plans) or Billing API, with in-app plan change | 0 (before listing) |
| 2.1.1–2.1.3 | No 404/500/3xx web errors; UI free of display bugs | ⚠️ not yet tested end to end on a review store | Review-store test pass each phase | Every phase |
| 2.1.4 | Synced data consistent with Shopify admin | 🔜 | Reconciliation job compares Veyro totals with Shopify after every sync | 3 |
| 2.2.3 | Latest App Bridge `app-bridge.js` before other scripts | ✅ provided by `AppProvider` | Keep | — |
| 2.2.4 | GraphQL Admin API only (new public apps, since 1 April 2025) | ✅ no REST Admin calls in the code | Historical import uses GraphQL bulk operations | 3 |
| 2.3.1 | No manual entry of a `myshopify.com` domain during install or configuration | ⚠️ public landing page (`app/routes/_index`) shows a shop-domain form | Remove the form from the production landing page; install only from Shopify surfaces | 0 |
| 2.3.2–2.3.4 | OAuth immediately on install and reinstall, then redirect to app UI | ✅ managed installation | Keep; retest after the uninstall-retention change (D2) | 0 |
| 3.1.1 | Valid TLS | ✅ `https://veyro.webvory.com` | Monitor expiry in Store health | 10 |
| 3.1.2 | Expiring offline access tokens | ✅ `expiringOfflineAccessTokens: true` | Keep | — |
| 3.2 | Request only necessary scopes; use optional scopes for features not every merchant uses | ⚠️ `read_themes`, `write_themes`, `read_reports` have no matching API use in the code | Remove unused scopes or move them to `optional_scopes`; request new scopes (customers, inventory, pixels) only in the phase that uses them | 0, then per phase |
| 4.x | Listing: no stats, guarantees, or "best/first/only" claims; pricing only in the pricing section; screencast; test credentials | 🔜 | Listing checklist before submission | Before listing |
| 5.1.1–5.1.3 | Storefront changes only through theme app extensions; onboarding for app embeds with a deep link | ✅ structured data and star rating are theme app extension blocks | Add a deep link to enable the embed from the home page | 2 |
| 5.1.5 | Return customer data collected in the Online Store to the merchant's admin | 🔜 | Veyro collects events, not customer profiles; no customer database separate from Shopify | 4 |
| Mandatory webhooks | `customers/data_request`, `customers/redact`, `shop/redact` | ⚠️ missing | Add the `compliance_topics` subscription and handlers covering every table that holds customer data | 0 |
| Protected customer data | Level 1 for orders; level 2 for email/phone (Enhanced Conversions, Meta matching) | ⚠️ not requested | Request in Partner Dashboard with data-use justification, retention, and encryption details | 0 |

### Built for Shopify requirements

| Ref | Requirement | Veyro today | Action | Phase |
|---|---|---|---|---|
| 2.1 | Admin Web Vitals at p75: LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms | ⚠️ not measured; some tracking pages load whole tables | Dashboards read pre-aggregated `DailyMetric`; paginate lists; measure each phase | 0, 8 |
| 2.2.1 | Storefront Lighthouse score drops by no more than 10 points | ✅ theme blocks are light; 🔜 tracking uses a sandboxed Web Pixel, not theme scripts | Lighthouse before/after on a test theme in every phase that touches the storefront | 4 |
| 3.1.1 | Embedded; no external web pages embedded | ✅ | Keep | — |
| 3.1.2 | Primary workflows inside the Shopify admin | ✅ | No external dashboard (D1) | 2 |
| 3.1.3 | Usable immediately after install | ✅ no sign-up | Keep; integrations stay optional steps | — |
| 3.1.4, 4.2.3 | Home page shows key metrics and whether the app is set up and working (use `app.extensions()` for embed status) | ⚠️ home is the image manager | New Overview home: setup checklist, embed and pixel status, key metrics | 2 |
| 3.1.5 | Third-party connection settings inside the app; disconnect at any time | ✅ Google connect/disconnect; OpenAI disconnect | Same pattern for every new platform | 6 |
| 3.2.2 | Don't edit theme files with the Asset API | ✅ no Asset API use | Drop `write_themes` | 0 |
| 4.1.1 | Polaris look: card containers, Polaris buttons, WCAG 2.1 AA contrast, back button on sub-pages | ⚠️ SEO and image pages use custom `v-*` CSS components; needs a visual review against Polaris | Move those pages to Polaris web components one page at a time, keeping behavior identical and covered by tests | 2 |
| 4.1.2 | Mobile: no page-wide horizontal scroll; columns stack | ⚠️ not verified | Check every page at phone width | 2 |
| 4.1.4 | Use `s-app-nav`; sub-pages highlight their parent; no separate nav item to home; no emojis | ⚠️ 17 entries, and "Image manager" is a separate link to the home route | New navigation (section 8) | 2 |
| 4.1.5 | Forms saved with the Contextual Save Bar; can't navigate away with unsaved changes | ⚠️ AI settings, automation rules, and Google credentials use plain submit buttons | Add `data-save-bar` to settings forms | 2 |
| 4.2.4 | Errors red, next to the field, never auto-dismissed | ⚠️ to verify per page | `s-banner tone="critical"` and field `error` attributes; no auto-hiding toasts for errors | 2 |
| 4.3.1 | No guaranteed or promised outcomes | ✅ | AI insights phrased as observations with evidence | 10 |
| 4.3.4 | No multi-paragraph text blocks; no stacked banners | ⚠️ some explanatory pages are text-heavy | Shorten during the Polaris migration | 2 |
| 4.3.5 | AI features must not use Shopify Magic purple or the Sidekick icon | ✅ | Keep for Veyro AI | 10 |
| 4.3.7 | Paid-plan features visibly disabled and labelled | 🔜 | Plan gating in one helper used by every page | 0 |
| 5.3.1 | Analytics apps: Web Pixel extensions only, no script tags or copied JavaScript | 🔜 | All browser tracking through a Web Pixel extension with `customer_privacy` settings, so Shopify enforces consent | 4 |
| 5.1.2, 5.6, 5.13 | Ads, email, and SMS category apps must also ship customer segment action extensions and use the visitors API | n/a | List Veyro under Analytics (and SEO), not Ads or Email marketing, unless those extensions are built | Listing |

---

## 2. Current application

### 2.1 Technology stack

| Layer | Technology |
|---|---|
| App framework | React Router 7 (server-rendered), Shopify `shopify-app-react-router` 1.2, embedded in Shopify admin |
| UI | Polaris web components (`s-page`, `s-section`, `s-table` …), App Bridge `s-app-nav` |
| Shopify API | Admin GraphQL, version `2026-07`; offline, expiring access tokens |
| Database | PostgreSQL via Prisma 6 (`prisma/schema.prisma`, 3 migrations) |
| Background work | `scripts/worker.js`: single polling worker over the `WorkJob` table (lease, heartbeat, 3 attempts, exponential backoff) |
| AI | Merchant-supplied OpenAI key (encrypted per shop), used for image analysis |
| Google | Service account (Search Console, PageSpeed); per-store OAuth clients (GA4, Ads, GTM) |
| Theme extension | `extensions/veyro`: structured-data embed, star rating block |
| Hosting | Server via SSH + pm2; GitHub Actions runs tests and build, then deploys `main` when `DEPLOY_ENABLED=true` |
| Tests | `node --test tests/*.test.js`: 79 tests, all passing |

### 2.2 Feature inventory

Status key: **Working**: implemented end to end with tests. **Partial**: real logic but missing inputs or verification. **Placeholder**: page exists, data source not built.

| Area | Route | What it does | Status |
|---|---|---|---|
| Image manager | `/app` | AI color detection, ALT suggestions, merchant approval, history | Working |
| Automation | `/app/automation` | Product webhooks, queued catalog processing, auto-approve (≥95% confidence), variant image assignment | Working |
| Image optimizer | `/app/optimize`, `/app/optimization-preview` | JPEG/PNG resize and compress, original backup, publish, restore | Working |
| SEO workspace | `/app/seo` | Product SEO checklist, meta title/description drafts, previews, publishing history | Working |
| Technical SEO | `/app/technical` | Page scans, broken links, redirects, JSON-LD inspection, PageSpeed, Search Console sync, sitemap submit | Working (Google parts need service account) |
| AI settings | `/app/settings` | Per-store OpenAI key and model | Working |
| Structured data | Theme extension | Product schema embed, star rating block | Working |
| Integrations | `/app/tracking/integrations` | Per-store Google OAuth client, connect/disconnect GA4, Ads, GTM | Partial: token obtained, but no account selected or verified |
| Tracking dashboard | `/app/tracking` | Connection status, health score, metrics | Partial: GA4/Ads/duplicate/missing counts are hard-coded to 0 |
| Order sources | `/app/tracking/orders` | Order attribution by channel and campaign | Partial (uncommitted, 2.4) |
| GA4 events | `/app/tracking/ga4` | Lists stored GA4 events | Placeholder: nothing writes GA4 events |
| Ads conversions | `/app/tracking/ads` | Lists stored Ads events | Placeholder: nothing writes or uploads conversions |
| Duplicates, Transaction IDs, Reconciliation | `/app/tracking/…` | Logic over `TrackingEvent` | Partial: logic exists, no events to analyze; reconciliation loads all orders unbounded |
| GTM inspector | `/app/tracking/gtm` | Container listing | Placeholder: returns empty list |
| Conversion Linker, Enhanced Conversions | `/app/tracking/linker`, `/enhanced` | Status checks | Placeholder: run on empty input, always "Missing" / "Not enabled" |
| Test lab | `/app/tracking/test-lab` | Stores manual test notes as audit issues | Partial |
| Webhooks | `/webhooks/*` | Uninstall, scopes update, products (active); orders (code ready, **subscription disabled**) | Mixed |

### 2.3 Database map

All tables are tenant-scoped by a `shop` string (the `*.myshopify.com` domain). There are no foreign keys between tables.

| Group | Tables | Notes |
|---|---|---|
| Auth | `Session` | Offline sessions only; online (per-user) sessions not used |
| AI / images | `AiConnection`, `ImageSettings`, `ImageReview`, `ImageChange`, `ImageOptimization` | `ImageOptimization` stores original and optimized image bytes in the database, the main driver of database size and backup time |
| SEO | `SeoDraft`, `SiteScan`, `Video`, `IntegrationReport` | `SeoDraft` holds original values used for restore; must never be dropped |
| Jobs | `WorkJob`, `WorkerHeartbeat` | Shared queue for all background work |
| Tracking | `Integration`, `GoogleCredential`, `ShopifyOrder`, `TrackingEvent`, `TrackingHealth`, `AuditIssue` | Credentials and tokens encrypted (AES-256-GCM, shop-bound) |

### 2.4 Uncommitted work in the working tree

Made earlier in this session, before this audit, **not committed and not migrated**:

- `app/services/attribution.server.js`, `app/services/channels.js`: channel classification from Shopify's customer journey (landing page, referrer, UTMs, click IDs), last-non-direct model, order sync, channel and campaign breakdowns.
- `prisma/migrations/20261106120000_order_attribution`: adds 16 nullable columns and one index to `ShopifyOrder` (additive only).
- Updated `webhooks.orders.jsx`, `app.tracking.orders.jsx`, `app.tracking._index.jsx`, `tracking.server.js`; new `tests/attribution.test.js` (9 tests).
- `app/entry.server.jsx` shows as modified, but only its line endings differ.

This fits Phase 4 as the order-level summary. Its channel list is narrower than section 5 of the brief (no SMS, affiliate, per-network paid social). That is addressed by the editable channel rules in Phase 4 without changing these columns.

---

## 3. Existing tracking and integrations: detail

- **Order data:** `ShopifyOrder` is filled only by the orders webhook, which is turned off pending Shopify's protected customer data approval, and by the new sync. No line items, refunds, customers, or discounts are stored.
- **Events:** nothing in the codebase creates `TrackingEvent` rows. There is no web pixel, no storefront collection endpoint, and no platform dispatcher.
- **Google OAuth:** sound design: signed, expiring state; encrypted tokens; tokens never sent to the browser. However, after OAuth the integration is marked `connected` without choosing a GA4 property, Ads customer, or GTM container, and without a test API call. That conflicts with the brief's rule "never display an integration as connected merely because credentials were entered." Refresh-token use is not implemented, so access tokens expire after an hour with nothing to renew them.
- **Health score:** awards points for "connected" integrations, so it inherits the issue above.
- **Scopes:** `read_orders` is in `shopify.app.toml` and `.env` but missing from `shopify.app.local.toml`, so the local dev app cannot read orders.

---

## 4. Conflicts between the brief and the current app

| Conflict | Impact | Resolution |
|---|---|---|
| Shopify's `s-app-nav` shows a flat list; it has no expandable categories | The 15-module sidebar cannot be nested in the Shopify admin sidebar | Top-level nav = modules (about 10 entries); each module page has its own sub-navigation (tabs/links) |
| Embedded apps open one store at a time | "Switch between stores" and "combined dashboard" are not possible inside one embedded session | D1. Phase 2b adds an organization layer shown inside each store's embedded app. A standalone dashboard outside Shopify is ruled out by Built for Shopify 3.1.2 |
| Custom roles (SEO Manager, Analyst …) | The app only uses offline tokens, so it does not know which staff member is using it | Enable online sessions to get user identity; map users to Veyro roles per store |
| Uninstall deletes all data immediately | Contradicts "never delete historical data"; reinstall loses SEO history | D2: soft-deactivate on uninstall, delete on `shop/redact` |
| Shopify's Google & YouTube and Facebook & Instagram channel apps may already send conversions | Veyro sending the same purchases causes double counting | D3: detect, warn, single sender per platform |
| Raw page-view events at storefront volume in PostgreSQL | Table growth, slow dashboards | Raw-event retention (e.g. 90 days), daily summary tables for dashboards |
| Encryption key derived from `SHOPIFY_API_SECRET` | Rotating the Shopify secret makes every stored credential unreadable | D6: dedicated, versioned key for new data; existing `v1` values keep working |
| `docs/seo-suite-roadmap.md` refers to an SQLite queue | Documentation drift only | Update the doc in Phase 1 |

---

## 5. Findings to fix first (Phase 0)

| Severity | Finding | Why it matters |
|---|---|---|
| **Critical** | No mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) | Required for App Store distribution, and required before handling order and customer data |
| **Critical** | Protected customer data access not yet requested | Order, customer, and journey data are unavailable outside development stores until approved; level 2 (email, phone) is needed for Enhanced Conversions and Meta matching |
| High | Uninstall webhook deletes all data immediately (D2) | Data loss on accidental uninstall; conflicts with preservation rules |
| High | Integrations shown as connected without verification; no token refresh | Misleading status; Google calls fail after one hour |
| Medium | Reconciliation and duplicate pages load all orders and events on every page view | Will slow down as data grows |
| Medium | Local dev config lacks `read_orders` | Local testing of order features fails |
| Low | Placeholder pages are listed in the navigation as if working | Merchants cannot tell what is real; label them "Coming soon" or hide until built |

---

## 6. Backup and rollback plan

**Before every phase that includes a migration:**

1. On the production server: `pg_dump --format=custom --file=veyro-$(date +%Y%m%d-%H%M).dump "$DATABASE_URL"`, copied off the server (the dump includes image backup bytes, so expect it to be large).
2. Verify the dump by restoring it into a scratch database (`pg_restore --dbname=<scratch> …`) and counting rows in `SeoDraft`, `ImageReview`, `ImageOptimization`, `ImageChange`, `Session`.
3. Tag the release in git (`git tag pre-phase-N`).
4. Record the `_prisma_migrations` table contents.

**Migration rules:**

- Additive only: new tables, new nullable columns, new indexes. No drops, renames, type changes, or resets.
- Each migration folder gets a hand-written `down.sql` that removes only what that migration added (Prisma has no automatic down migrations).
- New code must run correctly before its migration has been applied.

**Rollback:**

1. Redeploy the previous tag. Old code ignores new tables and columns, so this is safe without touching data.
2. Only if a new object itself causes harm: run that migration's `down.sql` after a fresh backup.
3. Full restore from the dump is the last resort, because it discards data written since the dump.

**Pipeline note:** merging to `main` auto-deploys and runs `prisma migrate deploy` once `DEPLOY_ENABLED` is on. Proposal: add a `pg_dump` step to `scripts/deploy.sh` before `npm run setup`. That changes the deploy process, so it needs your approval.

---

## 7. External approvals and accounts (not solvable in code)

| Item | Needed for | Typical wait |
|---|---|---|
| Shopify protected customer data, levels 1 and 2 | Orders, customers, journeys, hashed matching | Review in Partner Dashboard |
| Google Ads API developer token (Basic access) | Offline/click conversion uploads, spend import | Application + review |
| Meta app with `ads_management`, business verification, App Review | Conversions API at scale, spend import | Review |
| Microsoft Advertising developer token | Offline conversions, spend | Application |
| TikTok, Pinterest, Snapchat developer apps | Events APIs, spend | Per-platform review |
| Klaviyo / Omnisend API keys (per merchant) | Email and SMS analytics | Merchant supplies |
| Shopify Email | No public reporting API for campaign revenue | Attribute via UTMs only; state the limit in the UI |

Each integration will be reported as one of: fully implemented and tested / awaiting credentials / connected awaiting verification / partial / not implemented.

---

## 8. Proposed navigation

Built to Shopify's App Bridge navigation rules: a single level ("You can't nest navigation items inside other navigation items"), labels of one or two words, no emojis, and the app name links to home, so there is no separate home entry. Each module page carries its own sub-navigation, sub-pages have a back button, and the parent nav item stays highlighted.

| Sidebar entry | Sub-pages inside the module | Existing pages kept |
|---|---|---|
| *(app name → home)* | Overview: setup checklist, key metrics, alerts, tracking and store health summary, Veyro AI | `/app/tracking` dashboard content moves here; `/app` becomes this home (`rel="home"`) |
| SEO | Products, Technical, Images, Optimizer, Automation, Schema, Reports | `/app/seo`, `/app/technical`, `/app/optimize`, `/app/automation`; the image manager moves from `/app` to `/app/images` |
| Marketing | Attribution, Channels, Campaigns, Landing pages, Funnel | `/app/tracking/orders` |
| Advertising | Overview, one tab per connected platform, Profitability | `/app/tracking/ads` |
| Tracking | Events, Deliveries, Failed events, Reconciliation, Diagnostics, Test lab | GA4, duplicates, transaction IDs, reconciliation, GTM, linker, enhanced, test lab |
| Sales | Revenue, Orders, Products, Inventory, Refunds | (new) |
| Customers | Overview, Cohorts, Segments, Email & SMS | (new) |
| Store health | Speed, Web vitals, Broken links, Webhooks, Integrations | PageSpeed and scan results also appear here |
| Reports | Library, Scheduled, Exports | (new) |
| Settings | General, Integrations, Attribution, Privacy, Team, Audit log, Plan | `/app/settings`, `/app/tracking/integrations` |

All existing URLs keep working: nav entries change, routes do not. The one move (image manager to `/app/images`) is linked from the SEO module and from the Overview setup checklist. A module appears in the sidebar only once it works; nothing is listed as a placeholder.

---

## 9. Proposed architecture additions

All additive. Every new table carries `shop` and is queried only through helpers that require it.

### 9.1 New tables (by phase)

| Phase | Tables | Purpose |
|---|---|---|
| 0 | `Store` | One row per shop: name, currency, timezone, primary domain, install status, uninstalledAt |
| 2 | `Organization`, `OrganizationStore`, `Member`, `RoleAssignment`, `AuditLog` | Multi-store grouping, roles per module and store, activity log (D1) |
| 3 | `OrderLineItem`, `Refund`, `Customer` (minimal, hashed contact fields), `Product`, `Variant`, `InventorySnapshot`, `SyncRun` | Shopify mirror; `SyncRun` stores cursor, counts, errors for resumable imports |
| 4 | `Visitor`, `VisitSession`, `Touchpoint`, `AttributionRecord`, `AttributionCredit`, `ChannelRule` | Raw touchpoints kept separate from calculated credits; channel rules editable without code |
| 5 | `TrackingEvent` (extended: `eventId` unique per shop, `source`, `sessionId`, `consent`), `EventDelivery`, `Destination` | Event store, per-destination delivery state, platform settings and encrypted credentials |
| 7 | `AdAccount`, `Campaign`, `AdDailyMetric`, `CostInput` | Spend and performance; actual vs estimated cost flagged per row |
| 8–10 | `DailyMetric` (summary), `AlertRule`, `Alert`, `ReportSchedule`, `AiInsight` | Pre-aggregated dashboards, alerting, reports, AI audit trail |

### 9.2 Event pipeline (Phase 5)

```
Shopify Web Pixel (consent-aware) ──► /collect endpoint ─┐
Shopify webhooks (orders, refunds) ──────────────────────┤
                                                         ▼
                validate ► consent check ► dedupe (shop + eventId) ► store TrackingEvent
                                                         ▼
                         attribution update      EventDelivery row per enabled destination
                                                         ▼
                 dispatcher worker ► platform adapter (Google, Meta, …) ► response recorded
                                                         ▼
           status: queued / sent / accepted / rejected / failed / retrying / expired / deduplicated
```

- **Purchases come from the order webhook, not the browser.** The browser `checkout_completed` event is matched to it and used only for deduplication and identifiers.
- **Stable event IDs:** purchase `eventId` derives from the Shopify order ID, so retries and replays can never create a second purchase.
- **Retries:** exponential backoff up to a per-platform expiry window (each platform rejects conversions older than its limit), then dead-letter with a manual retry button.
- **Independence:** one adapter per platform; a failing platform only marks its own deliveries.
- **Volume:** a separate dispatcher loop from the SEO worker, so tracking load cannot delay SEO jobs.

### 9.3 Metric definitions

One module (`app/services/metrics/`) defines each metric once (formula, date basis, currency handling), and dashboards, reports, exports, and the AI assistant all read from it. Order-date basis is the default, and every report states its basis.

---

## 10. Phased implementation plan

Each phase ends with: tests passing, existing SEO features re-checked, a written phase report, and your approval before the next phase.

| Phase | Scope | Depends on | Ships |
|---|---|---|---|
| **0. Safety & Shopify compliance** | Mandatory compliance webhooks; protected customer data request; uninstall retention (D2); `Store` table; integration verification + token refresh; scope clean-up (drop unused, use optional scopes); remove the shop-domain form from the landing page; Shopify billing (if paid); hide placeholder pages; commit 2.4 on a branch | Approval of this plan | Every ⚠️ App Store item in section 1A closed |
| **1. Audit close-out** | Backup procedure on the server, `down.sql` convention, doc corrections | 0 | Verified backup and restore |
| **2. Navigation, design & tenancy** | New nav (section 8); Overview home with setup status; SEO and image pages moved to Polaris web components; Contextual Save Bar; mobile check; online sessions; roles per store (2a); organization layer if approved (2b) | 1, D1 | Built for Shopify design items in section 1A closed; all existing routes still work |
| **3. Shopify data** | Bulk historical import (GraphQL bulk operations), incremental sync, webhooks for orders/refunds/customers/products/inventory, `SyncRun` monitoring, manual resync | 2, protected data approval | Complete, reconciled Shopify mirror |
| **4. Attribution** | Web Pixel extension (consent enforced by Shopify, no script tags), touchpoints, channel rules UI, six attribution models, attribution status and confidence, diagnostics | 3 | Order sources with evidence, per-model credits |
| **5. Event pipeline** | `/collect`, event store, dedupe, deliveries, retry, dead-letter, delivery logs | 4 | Reliable event infrastructure, no destinations yet |
| **6. Conversion APIs** | One platform at a time, each with test events and logs: Google Ads + Enhanced Conversions, GA4 Measurement Protocol, then Meta, Microsoft, TikTok, Pinterest, Snapchat | 5, platform approvals, D3 | Per-platform status as defined in section 7 |
| **7. Advertising analytics** | Spend import, ROAS, CPA, CAC, profitability (actual vs estimated) | 6 (accounts) | Advertising module |
| **8. E-commerce intelligence** | Sales, products, variants (size, colour, designer), inventory, refunds, summary tables | 3 | Sales & products module |
| **9. CRO & retention** | Funnels from pixel events, cohorts, segments, LTV, Klaviyo/Omnisend | 4, 8 | Customers & retention, funnel views |
| **10. Health, alerts, AI, reports** | Store health consolidation, alert rules and notifications, AI analyst over metric layer, CSV/Excel/PDF exports, scheduled reports | 8 | Remaining modules |

Phases 7 and 8 can run in parallel once 6 and 3 are done.

---

## 11. Preservation checklist (run after every phase)

- Row counts unchanged or growing in `SeoDraft`, `ImageReview`, `ImageChange`, `ImageOptimization`, `Video`, `SiteScan`.
- Image manager: analyze, approve, and restore one test image.
- SEO workspace: create and publish one draft; history shows the original.
- Optimizer: preview and restore one image.
- Technical SEO: run one scan.
- Worker processes a queued job; heartbeat updates.
- Existing Google connections still show the same status.
- Full test suite passes.
- Section 1A re-checked for anything the phase touched: admin Web Vitals, storefront Lighthouse, mobile layout, scopes, and no new web errors.

---

## 12. What happens after approval

On approval of this document and decisions D1–D6, work starts with Phase 0 on a feature branch, with a pull request into `main` for review. No migration runs against production until the backup in section 6 has been taken and verified.

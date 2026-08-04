# ehsebly

Snap a photo of a receipt, let AI extract the line items, and split the bill fairly among friends — including tax, service charges, and discounts. ehsebly also supports ongoing groups (roommates, recurring trips) with a running ledger and settle-up flow.

- Landing page: https://ehsebly.eslamradi.com
- Cost/usage dashboard: https://dash.ehsebly.eslamradi.com

## Repo layout

```
client/                    Expo (React Native) app — iOS/Android/web
  app/                      Screens, navigation, domain logic, API clients
  backend/worker/           Cloudflare Worker API (Hono-less, hand-rolled router)
    src/routes/              HTTP route handlers (auth, groups, settlements, account, admin)
    src/db/                  D1 query helpers
    migrations/               D1 schema migrations, applied in order
  scripts/                  Standalone verification scripts (run with ts-node/tsx)

landing/                   Static marketing site (self-contained HTML/CSS/JS), deployed to Cloudflare Pages
dashboard/                 Static cost/usage admin dashboard, deployed to its own Cloudflare Pages project

_bmad/, _bmad-output/      BMAD planning workflow config and generated planning artifacts (PRD, epics, stories)
design-artifacts/          Design references
recipts/                   Sample receipt photos used for manual extraction testing
```

## How it works

1. **Capture** — user photographs one or more receipt images (paper receipt or delivery-app screenshot) in the Expo app.
2. **Extract** — the images are POSTed to the Cloudflare Worker, which runs a two-tier vision extraction pipeline:
   - Try Gemini 3.1 Flash-Lite first (cheap). Its result is only trusted if it clears a confidence threshold *and* its line items + tax/service/discount reconcile against the printed total.
   - Otherwise fall back to Claude Sonnet 5 (always trusted, no gating).
   - Every request's outcome and real token cost is logged to the `extraction_requests` D1 table (see `client/backend/worker/src/extract.ts`).
3. **Assign & review** — user assigns items to people, reviews tax/service/discount handling (integer piastres, round-half-up, no LLM arithmetic — the server does all money math).
4. **Groups** — expenses can be logged against a persistent group instead of (or in addition to) a one-off breakdown, with a running ledger and a settle-up flow to record payments between members.

Auth is email + one-time-code (via Brevo) — no passwords.

## Local development

**App:**
```
cd client
npm install
npm run start        # or: npm run ios / npm run android / npm run web
```

**Worker API:**
```
cd client/backend/worker
npm install
npm run dev           # wrangler dev
npm run typecheck
npm run deploy         # deploys the default (production) environment
npx wrangler deploy --env staging
```

D1 migrations live in `client/backend/worker/migrations/` and are applied with:
```
npx wrangler d1 migrations apply <database-name> --remote           # or --env staging
```

## Cost/usage dashboard

`dashboard/index.html` is a static, dependency-free page that calls the Worker's `GET /admin/stats` endpoint (bearer-token protected via the `ADMIN_DASHBOARD_TOKEN` secret) to show request volume, Gemini/Sonnet accept-vs-fallback rates, and real per-request cost. Deployed as its own Cloudflare Pages project so it can sit behind its own token without touching the main app's auth.

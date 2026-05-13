# ShopMy Creator Intelligence — Setup Guide

## Prerequisites
- Node.js 20+
- A free [Supabase](https://supabase.com) account
- A free [Netlify](https://netlify.com) account
- A ShopMy account (for scraping)

---

## 1. Supabase

1. Create a new project at supabase.com
2. In the SQL Editor, run `supabase/schema.sql`
3. Note your **Project URL** and **anon key** (Settings → API)
4. Note your **service_role key** too (for the scraper)

---

## 2. Seed the baseline data

```bash
cd scraper
npm install
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=your-service-role-key \
node seed.js
```

---

## 3. Save your ShopMy session (first-time scraper auth)

Run this **locally** (opens a real browser):

```bash
cd scraper
node scraper.js --auth-only
```

Log in to ShopMy when the browser opens. The session is saved to
`playwright/.auth/session.json`. **Never commit this file.**

---

## 4. Test the scraper locally

```bash
cd scraper
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scraper.js --creator themommydictionary --debug
```

Check `playwright/screenshots/` to see what the scraper saw.
If products aren't being extracted, inspect those screenshots and adjust
the `SELECTORS` object at the top of `scraper/scraper.js`.

---

## 5. Deploy to Netlify

```bash
# From the shopmy-dashboard root:
npm install
```

In the Netlify dashboard:
- **New site from Git** → connect your repo → build command: `npm run build`, publish dir: `dist`
- **Environment variables** → add:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

---

## 6. GitHub Actions — daily cron

In your GitHub repo → **Settings → Secrets → Actions**, add:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | your Supabase URL |
| `SUPABASE_SERVICE_KEY` | your service_role key |
| `SHOPMY_SESSION` | contents of `playwright/.auth/session.json` |

The workflow runs daily at 7 AM UTC. You can also trigger it manually from
**Actions → Daily ShopMy Scrape → Run workflow**.

---

## 7. Refreshing the session

ShopMy sessions last roughly 30 days. When the cron job starts failing:

1. Run `node scraper.js --auth-only` locally
2. Copy the new `playwright/.auth/session.json` content
3. Update the `SHOPMY_SESSION` GitHub secret

---

## Selector troubleshooting

The scraper uses CSS selectors to find product cards. If ShopMy updates
its UI and products stop being extracted:

1. Run `node scraper.js --debug --creator themommydictionary`
2. Check the screenshots in `playwright/screenshots/`
3. Open Chrome DevTools on `shopmy.us/shop/themommydictionary?tab=latest`
4. Find the correct selector for product cards
5. Update the `SELECTORS` object in `scraper/scraper.js`

/**
 * ShopMy scraper — Playwright + Node.js
 *
 * Usage:
 *   node scraper.js              # scrape all 29 creators
 *   node scraper.js --auth-only  # open browser to log in and save session, then exit
 *   node scraper.js --debug      # headful browser + verbose logging + screenshots
 *   node scraper.js --creator themommydictionary  # single creator
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────────
const SESSION_FILE = path.join(__dirname, '../playwright/.auth/session.json');
const SCREENSHOT_DIR = path.join(__dirname, '../playwright/screenshots');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CREATORS = [
  'betweencarpools', 'faigyrabinowitz', 'rachelshalam', 'alysondweck',
  'bestmomsfinds', 'themommydictionary', 'shimal123', 'moonlight',
  'twasser', 'findsbyrivka', 'chezchaya', 'wardrobestaples',
  'eishesstyle', 'thehomezest', 'familygetup', 'marblespoon',
  'sarahsoliani', 'shanilechan', 'devora', 'gowncloset',
  'rivkirabinowitz', 'ladiesshoppinglinks', 'bigcityshopper',
  'styledbynomi', 'rachelw', 'shiraadar', 'looksbybecs',
  'designerthreads', 'shopwithdass',
];

const SCROLL_TIMEOUT_MS = 2500;
const MAX_SCROLL_ATTEMPTS = 40;   // ~100 products before giving up
const DAYS_BACK = 30;
const AUTH_TIMEOUT_MS = 180_000;  // 3 min for user to log in

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const AUTH_ONLY = args.includes('--auth-only');
const DEBUG     = args.includes('--debug');
const CREATOR_FILTER = (() => {
  const i = args.indexOf('--creator');
  return i !== -1 ? args[i + 1] : null;
})();

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(...msg) { console.log(new Date().toISOString().slice(11, 19), ...msg); }
function warn(...msg) { console.warn('⚠', ...msg); }

/**
 * Convert a ShopMy relative date string to an absolute Date.
 * Base is the scrape time (now). Examples: "2 hours ago", "yesterday", "3 days ago"
 */
function parseRelativeDate(str, base = new Date()) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  if (s === 'just now' || s === 'moments ago') return new Date(base);
  if (s === 'yesterday') {
    const d = new Date(base);
    d.setDate(d.getDate() - 1);
    return d;
  }
  const m = s.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const d = new Date(base);
  switch (unit) {
    case 'second': d.setSeconds(d.getSeconds() - n); break;
    case 'minute': d.setMinutes(d.getMinutes() - n); break;
    case 'hour':   d.setHours(d.getHours() - n); break;
    case 'day':    d.setDate(d.getDate() - n); break;
    case 'week':   d.setDate(d.getDate() - n * 7); break;
    case 'month':  d.setMonth(d.getMonth() - n); break;
    case 'year':   d.setFullYear(d.getFullYear() - n); break;
  }
  return d;
}

function daysSince(date) {
  return (Date.now() - date.getTime()) / 86_400_000;
}

async function screenshot(page, name) {
  if (!DEBUG) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

// ── Session management ───────────────────────────────────────────────────────
async function ensureSession(browser) {
  if (fs.existsSync(SESSION_FILE)) {
    log('Loading saved session from', SESSION_FILE);
    return browser.newContext({ storageState: SESSION_FILE });
  }
  log('No session found — opening browser for manual login…');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://shopmy.us/login');
  log('Please log in to ShopMy in the browser window. Waiting up to 3 minutes…');
  // Wait until the URL changes away from /login
  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/login'),
    { timeout: AUTH_TIMEOUT_MS }
  );
  log('Login detected — saving session.');
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  await context.storageState({ path: SESSION_FILE });
  return context;
}

async function checkSessionValid(page) {
  // If we ended up on a login page, the session expired
  return !page.url().includes('/login');
}

// ── Infinite-scroll loader ──────────────────────────────────────────────────
/**
 * Scroll the page until no new items load OR the oldest item is > daysBack old.
 * Returns when stable.
 */
async function scrollUntilDone(page, getItemCount, isOldEnough) {
  let prev = 0;
  let stale = 0;
  for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_TIMEOUT_MS);

    const count = await getItemCount();
    if (DEBUG) log(`  scroll ${i + 1}: ${count} items`);

    if (count === prev) {
      stale++;
      if (stale >= 3) break; // no new items after 3 attempts
    } else {
      stale = 0;
      prev = count;
    }

    if (await isOldEnough()) break;
  }
}

// ── Scraping: Latest Finds ──────────────────────────────────────────────────
/**
 * SELECTOR NOTES (adjust here if ShopMy updates its DOM):
 *
 * ShopMy renders product cards inside a scrollable grid. Each card is an <article>
 * (or similar block element) that contains:
 *   - An <a> link to the product (href contains the affiliate/product URL)
 *   - A product name element
 *   - A brand element
 *   - A price element
 *   - A category element
 *   - For the Latest tab: a relative-time string like "3 days ago"
 *   - For the Popular tab: a rank number like "#8"
 *
 * Run with --debug to get screenshots and verbose output so you can inspect
 * the actual DOM and update these selectors.
 */

const SELECTORS = {
  // The repeating product card container
  card: [
    'article[data-id]',
    '[class*="CollectionItem"]',
    '[class*="collection-item"]',
    '[class*="ProductCard"]',
    '[class*="product-card"]',
    '[data-testid*="collection"]',
  ].join(', '),

  productName: [
    '[class*="product-name"]',
    '[class*="ProductName"]',
    '[class*="title"]',
    'h3',
    'h4',
  ].join(', '),

  brand: [
    '[class*="brand"]',
    '[class*="Brand"]',
    '[class*="merchant"]',
  ].join(', '),

  price: [
    '[class*="price"]',
    '[class*="Price"]',
    '[data-testid*="price"]',
  ].join(', '),

  category: [
    '[class*="category"]',
    '[class*="Category"]',
    '[class*="tag"]',
  ].join(', '),

  // Latest tab: relative time text
  relativeTime: [
    'time',
    '[class*="time"]',
    '[class*="Time"]',
    '[class*="date"]',
    '[class*="ago"]',
    '[class*="posted"]',
  ].join(', '),

  // Popular tab: rank number element (often "#1", "#2", etc.)
  rank: [
    '[class*="rank"]',
    '[class*="Rank"]',
    '[class*="position"]',
    '[data-testid*="rank"]',
  ].join(', '),

  // Product link (affiliate URL on the card)
  link: 'a[href]',
};

async function scrapeLatest(page, username, scrapeDate) {
  const url = `https://shopmy.us/shop/${username}?tab=latest`;
  log(`[${username}] Scraping Latest: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await screenshot(page, `${username}-latest-top`);

  const cutoff = new Date(scrapeDate);
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);

  await scrollUntilDone(
    page,
    async () => {
      return page.locator(SELECTORS.card).count().catch(() =>
        page.locator('article').count()
      );
    },
    async () => {
      // Check if the last visible item is older than our cutoff
      const lastTimeEl = page.locator(SELECTORS.relativeTime).last();
      if (!(await lastTimeEl.isVisible().catch(() => false))) return false;
      const text = await lastTimeEl.textContent().catch(() => '');
      const d = parseRelativeDate(text, scrapeDate);
      return d && daysSince(d) > DAYS_BACK;
    }
  );

  await screenshot(page, `${username}-latest-scrolled`);
  return extractLatestItems(page, scrapeDate);
}

async function extractLatestItems(page, scrapeDate) {
  return page.evaluate(({ selectors, scrapeTs, daysBack }) => {
    const base = new Date(scrapeTs);

    function parseRelativeDate(str) {
      if (!str) return null;
      const s = str.toLowerCase().trim();
      if (s === 'just now' || s === 'moments ago') return new Date(base);
      if (s === 'yesterday') {
        const d = new Date(base);
        d.setDate(d.getDate() - 1);
        return d;
      }
      const m = s.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      const unit = m[2];
      const d = new Date(base);
      switch (unit) {
        case 'second': d.setSeconds(d.getSeconds() - n); break;
        case 'minute': d.setMinutes(d.getMinutes() - n); break;
        case 'hour':   d.setHours(d.getHours() - n); break;
        case 'day':    d.setDate(d.getDate() - n); break;
        case 'week':   d.setDate(d.getDate() - n * 7); break;
        case 'month':  d.setMonth(d.getMonth() - n); break;
        case 'year':   d.setFullYear(d.getFullYear() - n); break;
      }
      return d;
    }

    const cards = Array.from(document.querySelectorAll(selectors.card));
    const items = [];

    for (const card of cards) {
      const nameEl     = card.querySelector(selectors.productName);
      const brandEl    = card.querySelector(selectors.brand);
      const priceEl    = card.querySelector(selectors.price);
      const categoryEl = card.querySelector(selectors.category);
      const timeEl     = card.querySelector(selectors.relativeTime);
      const linkEl     = card.querySelector(selectors.link);

      const product_name = nameEl?.textContent?.trim() || '';
      if (!product_name) continue;

      const brand    = brandEl?.textContent?.trim()    || null;
      const price    = priceEl?.textContent?.trim()    || null;
      const category = categoryEl?.textContent?.trim() || null;
      const timeText = timeEl?.textContent?.trim()     || timeEl?.getAttribute('datetime') || null;
      const product_url = linkEl?.href || null;

      const posted_at = parseRelativeDate(timeText);

      items.push({ product_name, brand, price, category, product_url, posted_at: posted_at?.toISOString() || null });
    }

    return items;
  }, {
    selectors: {
      card: SELECTORS.card,
      productName: SELECTORS.productName,
      brand: SELECTORS.brand,
      price: SELECTORS.price,
      category: SELECTORS.category,
      relativeTime: SELECTORS.relativeTime,
      link: SELECTORS.link,
    },
    scrapeTs: scrapeDate.toISOString(),
    daysBack: DAYS_BACK,
  });
}

// ── Scraping: Popular ────────────────────────────────────────────────────────
async function scrapePopular(page, username) {
  const url = `https://shopmy.us/shop/${username}?tab=popular`;
  log(`[${username}] Scraping Popular: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await screenshot(page, `${username}-popular-top`);

  // Load as many items as possible (aim for top 100)
  await scrollUntilDone(
    page,
    async () => page.locator(SELECTORS.card).count().catch(() => page.locator('article').count()),
    async () => {
      const count = await page.locator(SELECTORS.card).count().catch(() => 0);
      return count >= 100;
    }
  );

  await screenshot(page, `${username}-popular-scrolled`);

  return page.evaluate(({ selectors }) => {
    const cards = Array.from(document.querySelectorAll(selectors.card));
    const items = [];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const nameEl     = card.querySelector(selectors.productName);
      const brandEl    = card.querySelector(selectors.brand);
      const priceEl    = card.querySelector(selectors.price);
      const categoryEl = card.querySelector(selectors.category);
      const rankEl     = card.querySelector(selectors.rank);
      const linkEl     = card.querySelector(selectors.link);

      const product_name = nameEl?.textContent?.trim() || '';
      if (!product_name) continue;

      // Rank: try the rank element first, fall back to card index + 1
      let popular_rank = i + 1;
      if (rankEl) {
        const rankText = rankEl.textContent?.replace(/[^0-9]/g, '');
        if (rankText) popular_rank = parseInt(rankText, 10);
      }

      items.push({
        product_name,
        brand:        brandEl?.textContent?.trim()    || null,
        price:        priceEl?.textContent?.trim()    || null,
        category:     categoryEl?.textContent?.trim() || null,
        product_url:  linkEl?.href                    || null,
        popular_rank,
      });
    }

    return items;
  }, {
    selectors: {
      card:        SELECTORS.card,
      productName: SELECTORS.productName,
      brand:       SELECTORS.brand,
      price:       SELECTORS.price,
      category:    SELECTORS.category,
      rank:        SELECTORS.rank,
      link:        SELECTORS.link,
    },
  });
}

// ── Cross-reference ──────────────────────────────────────────────────────────
function crossReference(latestItems, popularItems) {
  // Build a lookup map: normalised "brand|name" → popular_rank
  const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const rankMap = new Map();
  const urlMap  = new Map();
  for (const item of popularItems) {
    const key = `${normalize(item.brand)}|${normalize(item.product_name)}`;
    rankMap.set(key, item.popular_rank);
    if (item.product_url) urlMap.set(item.product_url, item.popular_rank);
  }

  return latestItems.map(item => {
    const urlRank = item.product_url ? urlMap.get(item.product_url) : undefined;
    const nameRank = rankMap.get(`${normalize(item.brand)}|${normalize(item.product_name)}`);
    return { ...item, popular_rank: urlRank ?? nameRank ?? null };
  });
}

// ── Supabase upsert ──────────────────────────────────────────────────────────
async function upsertRows(supabase, username, scanDate, rows) {
  if (!rows.length) {
    warn(`[${username}] No rows to upsert.`);
    return;
  }

  const dateStr = scanDate.toISOString().slice(0, 10);
  const records = rows.map(r => ({
    creator_username: username,
    scan_date:        dateStr,
    product_url:      r.product_url   || null,
    product_name:     r.product_name,
    brand:            r.brand         || null,
    category:         r.category      || null,
    price:            r.price         || null,
    posted_at:        r.posted_at     || null,
    popular_rank:     r.popular_rank  ?? null,
  }));

  const { error } = await supabase
    .from('scans')
    .upsert(records, { onConflict: 'creator_username,scan_date,product_name,brand' });

  if (error) {
    warn(`[${username}] Upsert error:`, error.message);
  } else {
    log(`[${username}] Upserted ${records.length} rows for ${dateStr}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    if (!AUTH_ONLY) {
      console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars before scraping.');
      process.exit(1);
    }
  }

  const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

  const browser = await chromium.launch({ headless: !DEBUG && !AUTH_ONLY });
  const context = await ensureSession(browser);

  if (AUTH_ONLY) {
    log('Session saved. Exiting.');
    await browser.close();
    return;
  }

  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  // Verify session is still valid
  await page.goto('https://shopmy.us/', { waitUntil: 'networkidle', timeout: 30_000 });
  if (!(await checkSessionValid(page))) {
    console.error('Session expired. Delete playwright/.auth/session.json and re-run with --auth-only to refresh it.');
    await browser.close();
    process.exit(1);
  }

  const creators = CREATOR_FILTER ? [CREATOR_FILTER] : CREATORS;
  const scrapeDate = new Date();
  let successCount = 0;

  for (const username of creators) {
    try {
      log(`\n── ${username} ─────────────────────`);

      const latestRaw = await scrapeLatest(page, username, scrapeDate);
      log(`[${username}] Latest Finds: ${latestRaw.length} items`);

      const popularItems = await scrapePopular(page, username);
      log(`[${username}] Popular: ${popularItems.length} items`);

      const merged = crossReference(latestRaw, popularItems);

      if (supabase) {
        await upsertRows(supabase, username, scrapeDate, merged);
      } else {
        // Dry-run: print to stdout
        console.log(JSON.stringify({ username, merged }, null, 2));
      }
      successCount++;
    } catch (err) {
      warn(`[${username}] Failed:`, err.message);
      if (DEBUG) console.error(err);
      await screenshot(page, `${username}-error`);
    }
  }

  await browser.close();
  log(`\nDone. ${successCount}/${creators.length} creators scraped successfully.`);
  if (successCount < creators.length) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

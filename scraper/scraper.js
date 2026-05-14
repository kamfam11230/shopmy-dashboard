/**
 * ShopMy scraper - ShopMy products API
 *
 * Usage:
 *   node scraper.js              # scrape all creators and upsert to Supabase
 *   node scraper.js --dry-run    # scrape and print JSON without Supabase
 *   node scraper.js --creator themommydictionary  # single creator
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SHOPMY_HEADERS = {
  accept: 'application/json',
  origin: 'https://shopmy.us',
  referer: 'https://shopmy.us/',
  'user-agent': 'Mozilla/5.0',
};

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

const DAYS_BACK = 30;
const API_LIMIT = 100;

const args = process.argv.slice(2);
const DEBUG = args.includes('--debug');
const DRY_RUN = args.includes('--dry-run');
const CREATOR_FILTER = (() => {
  const i = args.indexOf('--creator');
  return i !== -1 ? args[i + 1] : null;
})();

function log(...msg) {
  console.log(new Date().toISOString().slice(11, 19), ...msg);
}

function warn(...msg) {
  console.warn('WARN', ...msg);
}

function canonicalProductUrl(product) {
  const id = product.Product_id || product.id;
  return id ? `https://shopmy.us/shop/product/${id}` : null;
}

function publicImageUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'production-shopmyshelf-uploads.s3.us-east-2.amazonaws.com') {
      const key = parsed.pathname.replace(/^\/+/, '');
      return key ? `https://static.shopmy.us/uploads/${key}` : null;
    }
    if (parsed.hostname === 'production-shopmyshelf-pins.s3.us-east-2.amazonaws.com') {
      const key = parsed.pathname.replace(/^\/+/, '');
      return key ? `https://static.shopmy.us/pins/${key}` : null;
    }
    return url;
  } catch {
    return url;
  }
}

function formatPrice(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.startsWith('$') ? value : `$${value}`;
  if (!Number.isFinite(value)) return null;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function ageDays(postedAt, scanDate) {
  return Math.max(0, (scanDate.getTime() - postedAt.getTime()) / 86_400_000);
}

function timeframeBucket(age) {
  if (age <= 1) return '1d';
  if (age <= 3) return '3d';
  if (age <= 7) return '7d';
  if (age <= 14) return '14d';
  return '30d';
}

function momentumScore(age, popularRank) {
  const recencyScore = Math.max(0, (DAYS_BACK - age) / DAYS_BACK) * 50;
  const popularityScore = popularRank
    ? ((API_LIMIT - popularRank + 1) / API_LIMIT) * 50
    : 0;
  return Math.round((recencyScore + popularityScore) * 100) / 100;
}

async function fetchProducts(username, tab, limit = API_LIMIT) {
  const apiUrl = `https://apiv3.shopmy.us/api/Shop/products?Curator_username=${encodeURIComponent(username)}&tab=${tab}&limit=${limit}&searchVariant=similar-products-v1`;
  const res = await fetch(apiUrl, { headers: SHOPMY_HEADERS });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  const results = Array.isArray(body.results) ? body.results : [];
  log(`[${username}] ${tab} success=${res.ok} results=${results.length}`);

  if (!res.ok || !Array.isArray(body.results)) {
    throw new Error(`ShopMy ${tab} API failed (${res.status})`);
  }

  return results;
}

function buildPopularRankMap(popularProducts) {
  const ranks = new Map();
  for (let i = 0; i < popularProducts.length; i++) {
    const url = canonicalProductUrl(popularProducts[i]);
    if (url && !ranks.has(url)) ranks.set(url, i + 1);
  }
  return ranks;
}

function normalizeLatestProduct(product, scanDate, popularRanks, latestWindowIncomplete) {
  const postedAt = product.publishedAt ? new Date(product.publishedAt) : null;
  if (!postedAt || Number.isNaN(postedAt.getTime())) return null;

  const age = ageDays(postedAt, scanDate);
  if (age > DAYS_BACK) return null;

  const productUrl = canonicalProductUrl(product);
  if (!productUrl) return null;

  const popularRank = popularRanks.get(productUrl) ?? null;
  const roundedAge = Math.round(age * 100) / 100;

  return {
    product_name: product.title || null,
    brand: product.AllBrand_name || null,
    category: product.Category_name || product.Department_name || null,
    price: formatPrice(product.fallbackPrice),
    product_url: productUrl,
    image_url: publicImageUrl(product.image || product.images?.find(img => img?.isFeatured)?.image || product.images?.[0]?.image),
    posted_at: postedAt.toISOString(),
    age_days: roundedAge,
    timeframe_bucket: timeframeBucket(age),
    popular_rank: popularRank,
    matched_in_popular: popularRank != null,
    momentum_score: momentumScore(age, popularRank),
    latest_window_incomplete: latestWindowIncomplete,
  };
}

function buildRecentFeed(latestProducts, popularProducts, scanDate) {
  const oldestFetched = latestProducts
    .map(p => (p.publishedAt ? new Date(p.publishedAt) : null))
    .filter(d => d && !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b)[0];

  const oldestFetchedAge = oldestFetched ? ageDays(oldestFetched, scanDate) : null;
  const latestWindowIncomplete = latestProducts.length >= API_LIMIT
    && oldestFetchedAge != null
    && oldestFetchedAge <= DAYS_BACK;

  const popularRanks = buildPopularRankMap(popularProducts);
  const rows = [];
  const seen = new Set();

  for (const product of latestProducts) {
    const row = normalizeLatestProduct(product, scanDate, popularRanks, latestWindowIncomplete);
    if (!row || !row.product_name) continue;
    if (seen.has(row.product_url)) continue;
    seen.add(row.product_url);
    rows.push(row);
  }

  return {
    rows,
    diagnostics: {
      latest_fetched: latestProducts.length,
      popular_fetched: popularProducts.length,
      recent_kept: rows.length,
      oldest_latest_age_days: oldestFetchedAge == null ? null : Math.round(oldestFetchedAge * 100) / 100,
      latest_window_incomplete: latestWindowIncomplete,
    },
  };
}

async function scrapeCreator(username, scanDate) {
  log(`[${username}] Fetching latest API (${API_LIMIT})`);
  const latestProducts = await fetchProducts(username, 'latest');

  log(`[${username}] Fetching popular API (${API_LIMIT})`);
  const popularProducts = await fetchProducts(username, 'popular');

  if (latestProducts.length === 0 && popularProducts.length === 0) {
    warn(`[${username}] Zero products returned for both latest and popular.`);
  }

  const feed = buildRecentFeed(latestProducts, popularProducts, scanDate);
  const d = feed.diagnostics;
  log(`[${username}] Latest fetched: ${d.latest_fetched}; recent kept: ${d.recent_kept}; popular fetched: ${d.popular_fetched}`);
  if (d.latest_window_incomplete) {
    warn(`[${username}] latest_window_incomplete=true; oldest latest item fetched is ${d.oldest_latest_age_days} days old`);
  }

  return feed;
}

async function upsertRows(supabase, username, scanDate, rows) {
  if (!rows.length) {
    warn(`[${username}] No recent rows to upsert.`);
    return;
  }

  const dateStr = scanDate.toISOString().slice(0, 10);
  const records = rows.map(r => ({
    creator_username: username,
    scan_date: dateStr,
    product_url: r.product_url,
    image_url: r.image_url,
    product_name: r.product_name,
    brand: r.brand,
    category: r.category,
    price: r.price,
    posted_at: r.posted_at,
    age_days: r.age_days,
    timeframe_bucket: r.timeframe_bucket,
    popular_rank: r.popular_rank,
    matched_in_popular: r.matched_in_popular,
    momentum_score: r.momentum_score,
    latest_window_incomplete: r.latest_window_incomplete,
  }));

  const { error } = await supabase
    .from('scans')
    .upsert(records, { onConflict: 'creator_username,scan_date,product_url' });

  if (error) {
    warn(`[${username}] Upsert error:`, error.message);
  } else {
    log(`[${username}] Upserted ${records.length} recent rows for ${dateStr}`);
  }
}

async function main() {
  if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars before scraping, or run with --dry-run.');
    process.exit(1);
  }

  const supabase = (!DRY_RUN && SUPABASE_URL && SUPABASE_SERVICE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

  const creators = CREATOR_FILTER ? [CREATOR_FILTER] : CREATORS;
  const scanDate = new Date();
  let successCount = 0;

  for (const username of creators) {
    try {
      log(`\n-- ${username} ---------------------`);
      const { rows, diagnostics } = await scrapeCreator(username, scanDate);

      if (supabase) {
        await upsertRows(supabase, username, scanDate, rows);
      } else {
        console.log(JSON.stringify({ username, diagnostics, rows }, null, 2));
      }
      successCount++;
    } catch (err) {
      warn(`[${username}] Failed:`, err.message);
      if (DEBUG) console.error(err);
    }
  }

  log(`\nDone. ${successCount}/${creators.length} creators scraped successfully.`);
  if (successCount < creators.length) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

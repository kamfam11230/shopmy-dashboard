/**
 * ShopMy scraper - ShopMy products API
 *
 * Usage:
 *   node scraper.js              # scrape all creators and upsert to Supabase
 *   node scraper.js --dry-run    # scrape and print JSON without Supabase
 *   node scraper.js --creator themommydictionary  # single creator
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
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
  'designerthreads', 'leahslinks', 'yglamm15',
  'fitsbyyaf', 'shanatoiv', 'thebestkeptsecret', 'thisthat',
];

const DAYS_BACK = 30;
const API_LIMIT = 100;
const PAGE_SIZE = API_LIMIT;
const LATEST_MAX_PRODUCTS = 1500;
const POPULAR_MAX_PRODUCTS = 1500;
const POPULAR_SIGNAL_LIMIT = 1000;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(value, start, end, startScore, endScore) {
  if (value <= start) return startScore;
  if (value >= end) return endScore;
  const progress = (value - start) / (end - start);
  return startScore + progress * (endScore - startScore);
}

function popularRankScore(rank) {
  if (rank <= 10) return interpolate(rank, 1, 10, 55, 50);
  if (rank <= 50) return interpolate(rank, 10, 50, 50, 35);
  if (rank <= 100) return interpolate(rank, 50, 100, 35, 25);
  if (rank <= 250) return interpolate(rank, 100, 250, 25, 15);
  if (rank <= 500) return interpolate(rank, 250, 500, 15, 5);
  if (rank <= POPULAR_SIGNAL_LIMIT) return interpolate(rank, 500, POPULAR_SIGNAL_LIMIT, 5, 0);
  return 0;
}

function freshPopularBoost(age, rank) {
  if (age <= 1 && rank <= 25) return 10;
  if (age <= 3 && rank <= 50) return 8;
  if (age <= 7 && rank <= 100) return 5;
  if (age <= 14 && rank <= 50) return 3;
  return 0;
}

function momentumScore(age, popularRank) {
  const rank = Number(popularRank);
  if (!Number.isFinite(rank) || rank <= 0) return 0;

  const freshness = clamp((DAYS_BACK - age) / DAYS_BACK, 0, 1);
  const recencyScore = freshness * 35;
  const staleDiscount = 0.35 + freshness * 0.65;
  const popularityScore = popularRankScore(rank) * staleDiscount;
  const total = recencyScore + popularityScore + freshPopularBoost(age, rank);

  return Math.round(clamp(total, 0, 100) * 100) / 100;
}

function productKey(product) {
  return String(product.Product_id || product.id || '');
}

function oldestPublishedAt(products) {
  return products
    .map(p => (p.publishedAt ? new Date(p.publishedAt) : null))
    .filter(d => d && !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b)[0] || null;
}

async function fetchProducts(username, tab, { limit = PAGE_SIZE, page = null } = {}) {
  const params = new URLSearchParams({
    Curator_username: username,
    tab,
    limit: String(limit),
    searchVariant: 'similar-products-v1',
  });
  if (page != null) params.set('page', String(page));

  const apiUrl = `https://apiv3.shopmy.us/api/Shop/products?${params.toString()}`;
  const res = await fetch(apiUrl, { headers: SHOPMY_HEADERS });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  const results = Array.isArray(body.results) ? body.results : [];
  const pageLabel = page == null ? '' : ` page=${page}`;
  log(`[${username}] ${tab}${pageLabel} success=${res.ok} results=${results.length}`);

  if (!res.ok || !Array.isArray(body.results)) {
    throw new Error(`ShopMy ${tab} API failed (${res.status})`);
  }

  return results;
}

async function fetchLatestProducts(username, scanDate) {
  const products = [];
  const seen = new Set();
  let pagesFetched = 0;
  let stoppedReason = 'max_cap_reached';

  for (let page = 0; products.length < LATEST_MAX_PRODUCTS; page++) {
    const pageProducts = await fetchProducts(username, 'latest', { limit: PAGE_SIZE, page });
    pagesFetched++;

    const newProducts = [];
    for (const product of pageProducts) {
      const key = productKey(product);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      newProducts.push(product);
    }

    if (newProducts.length === 0) {
      stoppedReason = 'no_new_products';
      break;
    }

    products.push(...newProducts.slice(0, LATEST_MAX_PRODUCTS - products.length));

    const oldestFetched = oldestPublishedAt(products);
    if (oldestFetched && ageDays(oldestFetched, scanDate) > DAYS_BACK) {
      stoppedReason = 'older_than_30_days';
      break;
    }

    if (pageProducts.length < PAGE_SIZE) {
      stoppedReason = 'short_page';
      break;
    }
  }

  return { products, pagesFetched, stoppedReason };
}

async function fetchPagedProducts(username, tab, maxProducts) {
  const products = [];
  const seen = new Set();
  let pagesFetched = 0;
  let stoppedReason = 'max_cap_reached';

  for (let page = 0; products.length < maxProducts; page++) {
    const pageProducts = await fetchProducts(username, tab, { limit: PAGE_SIZE, page });
    pagesFetched++;

    const newProducts = [];
    for (const product of pageProducts) {
      const key = productKey(product);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      newProducts.push(product);
    }

    if (newProducts.length === 0) {
      stoppedReason = 'no_new_products';
      break;
    }

    products.push(...newProducts.slice(0, maxProducts - products.length));

    if (pageProducts.length < PAGE_SIZE) {
      stoppedReason = 'short_page';
      break;
    }
  }

  return { products, pagesFetched, stoppedReason };
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
  const oldestFetched = oldestPublishedAt(latestProducts);
  const oldestFetchedAge = oldestFetched ? ageDays(oldestFetched, scanDate) : null;
  const latestWindowIncomplete = latestProducts.length >= LATEST_MAX_PRODUCTS
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
  log(`[${username}] Fetching latest API (${PAGE_SIZE}/page, max ${LATEST_MAX_PRODUCTS})`);
  const latestFetch = await fetchLatestProducts(username, scanDate);
  const latestProducts = latestFetch.products;

  log(`[${username}] Fetching popular API (${PAGE_SIZE}/page, max ${POPULAR_MAX_PRODUCTS})`);
  const popularFetch = await fetchPagedProducts(username, 'popular', POPULAR_MAX_PRODUCTS);
  const popularProducts = popularFetch.products;

  if (latestProducts.length === 0 && popularProducts.length === 0) {
    warn(`[${username}] Zero products returned for both latest and popular.`);
  }

  const feed = buildRecentFeed(latestProducts, popularProducts, scanDate);
  const d = feed.diagnostics;
  d.latest_pages_fetched = latestFetch.pagesFetched;
  d.latest_stopped_reason = latestFetch.stoppedReason;
  d.popular_pages_fetched = popularFetch.pagesFetched;
  d.popular_stopped_reason = popularFetch.stoppedReason;
  log(`[${username}] Latest fetched: ${d.latest_fetched}; recent kept: ${d.recent_kept}; popular fetched: ${d.popular_fetched}`);
  log(`[${username}] Latest pages: ${d.latest_pages_fetched}; stopped: ${d.latest_stopped_reason}`);
  log(`[${username}] Popular pages: ${d.popular_pages_fetched}; total fetched: ${d.popular_fetched}; stopped: ${d.popular_stopped_reason}`);
  if (d.latest_window_incomplete) {
    warn(`[${username}] latest_window_incomplete=true; oldest latest item fetched is ${d.oldest_latest_age_days} days old`);
  }

  return feed;
}

async function upsertRows(username, scanDate, rows) {
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

  const params = new URLSearchParams({
    on_conflict: 'creator_username,scan_date,product_url',
  });
  const endpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/scans?${params.toString()}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(records),
  });

  if (!res.ok) {
    const text = await res.text();
    warn(`[${username}] Upsert error:`, `HTTP ${res.status} ${text}`);
    return;
  }

  log(`[${username}] Upserted ${records.length} recent rows for ${dateStr}`);
}

async function main() {
  if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars before scraping, or run with --dry-run.');
    process.exit(1);
  }

  const creators = CREATOR_FILTER ? [CREATOR_FILTER] : CREATORS;
  const scanDate = new Date();
  let successCount = 0;

  for (const username of creators) {
    try {
      log(`\n-- ${username} ---------------------`);
      const { rows, diagnostics } = await scrapeCreator(username, scanDate);

      if (!DRY_RUN) {
        await upsertRows(username, scanDate, rows);
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

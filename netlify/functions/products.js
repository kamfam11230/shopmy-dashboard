import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

function isVisibleRanked(row) {
  return row.matched_in_popular && row.popular_rank != null && Number(row.momentum_score) > 0;
}

function diagnosticsRow(row) {
  return {
    creator_username: row.creator_username,
    posted_at: row.posted_at,
    popular_rank: row.popular_rank,
    matched_in_popular: row.matched_in_popular,
    momentum_score: row.momentum_score,
  };
}

async function fetchLatestScanDate() {
  const { data, error } = await supabase
    .from('scans')
    .select('scan_date')
    .order('scan_date', { ascending: false })
    .limit(1);

  if (error) return { scanDate: null, error };
  return { scanDate: data?.[0]?.scan_date || null, error: null };
}

async function fetchRowsSince(cutoff, scanDate) {
  const pageSize = 1000;
  const allRows = [];
  let pageCount = 0;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('scans')
      .select('creator_username, product_name, brand, category, price, product_url, image_url, posted_at, popular_rank, matched_in_popular, momentum_score, scan_date')
      .gte('posted_at', cutoff)
      .eq('scan_date', scanDate)
      .range(from, to);

    if (error) return { rows: null, error };

    pageCount++;
    allRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return { rows: allRows, pageCount, error: null };
}

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const params = event.queryStringParameters || {};
  const includeDebug = params.debug === '1';
  const startedAt = performance.now();
  const days = Math.min(parseInt(params.days || '7', 10), 90);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  // Work from the current daily snapshot. Older scan_date snapshots contain
  // duplicate product history and were the main source of function timeouts.
  const scanDateStartedAt = performance.now();
  const { scanDate, error: scanDateError } = await fetchLatestScanDate();
  const scanDateMs = performance.now() - scanDateStartedAt;
  if (scanDateError) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: scanDateError.message }) };
  }

  if (!scanDate) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: {}, all_data: {}, diagnostics: {}, last_updated: null }),
    };
  }

  const fetchStartedAt = performance.now();
  const { rows, pageCount, error } = await fetchRowsSince(cutoff, scanDate);
  const fetchMs = performance.now() - fetchStartedAt;

  if (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }

  const processStartedAt = performance.now();
  // Deduplicate: per (creator, product) keep the row with the most-recent scan_date.
  // Since rows are already sorted scan_date DESC, first-seen wins.
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    row.image_url = publicImageUrl(row.image_url);
    const key = `${row.creator_username}|${row.product_url || row.product_name}|${row.brand || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  const diagnostics = {};
  const grouped = {};
  const allGrouped = {};
  let visibleRows = 0;
  let allDataRows = 0;
  for (const row of deduped) {
    if (!diagnostics[row.creator_username]) {
      diagnostics[row.creator_username] = {
        recent_total: 0,
        ranked_total: 0,
        unranked_total: 0,
        hidden_momentum_total: 0,
        visible_ranked_total: 0,
      };
    }

    if (!allGrouped[row.creator_username]) allGrouped[row.creator_username] = [];
    allGrouped[row.creator_username].push(diagnosticsRow(row));
    allDataRows++;

    diagnostics[row.creator_username].recent_total++;
    if (!row.matched_in_popular || row.popular_rank == null) {
      diagnostics[row.creator_username].unranked_total++;
    } else if (!isVisibleRanked(row)) {
      diagnostics[row.creator_username].ranked_total++;
      diagnostics[row.creator_username].hidden_momentum_total++;
    } else {
      diagnostics[row.creator_username].ranked_total++;
      diagnostics[row.creator_username].visible_ranked_total++;
      if (!grouped[row.creator_username]) grouped[row.creator_username] = [];
      grouped[row.creator_username].push(row);
      visibleRows++;
    }
  }
  const processMs = performance.now() - processStartedAt;

  const body = { data: grouped, all_data: allGrouped, diagnostics, last_updated: scanDate };
  if (includeDebug) {
    body.debug = {
      days,
      scan_date: scanDate,
      rows_returned: rows.length,
      rows_processed: deduped.length,
      visible_rows: visibleRows,
      all_data_rows: allDataRows,
      creators_processed: Object.keys(diagnostics).length,
      supabase_pages: pageCount,
      timings_ms: {
        scan_date_fetch: Math.round(scanDateMs),
        row_fetch: Math.round(fetchMs),
        processing: Math.round(processMs),
        total: Math.round(performance.now() - startedAt),
      },
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(body),
  };
}

const SUPABASE_SELECT = [
  'creator_username',
  'product_name',
  'brand',
  'category',
  'price',
  'product_url',
  'image_url',
  'posted_at',
  'popular_rank',
  'matched_in_popular',
  'momentum_score',
  'scan_date',
].join(',');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(),
  });
}

function responseHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800',
  };
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

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
  };
}

function supabaseUrl(env, path, params) {
  const url = new URL(path, env.SUPABASE_URL.replace(/\/+$/, '') + '/');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchSupabase(env, path, params) {
  const res = await fetch(supabaseUrl(env, path, params), {
    headers: supabaseHeaders(env),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }

  return res.json();
}

async function fetchLatestScanDate(env) {
  const data = await fetchSupabase(env, 'rest/v1/scans', {
    select: 'scan_date',
    order: 'scan_date.desc',
    limit: '1',
  });

  return data?.[0]?.scan_date || null;
}

async function fetchRowsSince(env, cutoff, scanDate) {
  const pageSize = 1000;
  const allRows = [];
  let pageCount = 0;

  for (let offset = 0; ; offset += pageSize) {
    const data = await fetchSupabase(env, 'rest/v1/scans', {
      select: SUPABASE_SELECT,
      posted_at: `gte.${cutoff}`,
      scan_date: `eq.${scanDate}`,
      limit: String(pageSize),
      offset: String(offset),
    });

    pageCount++;
    allRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return { rows: allRows, pageCount };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders() });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }, 500);
  }

  try {
    const params = new URL(request.url).searchParams;
    const includeDebug = params.get('debug') === '1';
    const startedAt = performance.now();
    const days = Math.min(parseInt(params.get('days') || '7', 10), 90);
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    const scanDateStartedAt = performance.now();
    const scanDate = await fetchLatestScanDate(env);
    const scanDateMs = performance.now() - scanDateStartedAt;

    if (!scanDate) {
      return jsonResponse({ data: {}, all_data: {}, diagnostics: {}, last_updated: null });
    }

    const fetchStartedAt = performance.now();
    const { rows, pageCount } = await fetchRowsSince(env, cutoff, scanDate);
    const fetchMs = performance.now() - fetchStartedAt;

    const processStartedAt = performance.now();
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

    return jsonResponse(body);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

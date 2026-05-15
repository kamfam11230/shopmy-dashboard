const { createClient } = require('@supabase/supabase-js');

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

async function fetchRowsSince(cutoff) {
  const pageSize = 1000;
  const allRows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('scans')
      .select('creator_username, product_name, brand, category, price, product_url, image_url, posted_at, popular_rank, matched_in_popular, momentum_score, scan_date')
      .gte('posted_at', cutoff)
      .order('scan_date', { ascending: false })
      .range(from, to);

    if (error) return { rows: null, error };

    allRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return { rows: allRows, error: null };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const params = event.queryStringParameters || {};
  const days = Math.min(parseInt(params.days || '7', 10), 90);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  // Fetch all rows where posted_at is within the window.
  // Order by scan_date DESC so dedup keeps the freshest rank per product.
  const { rows, error } = await fetchRowsSince(cutoff);

  if (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }

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
  let latestScanDate = null;
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
    allGrouped[row.creator_username].push(row);

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
    }

    if (!latestScanDate || row.scan_date > latestScanDate) {
      latestScanDate = row.scan_date;
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ data: grouped, all_data: allGrouped, diagnostics, last_updated: latestScanDate }),
  };
};

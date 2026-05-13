const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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
  const { data: rows, error } = await supabase
    .from('scans')
    .select('creator_username, product_name, brand, category, price, product_url, posted_at, popular_rank, scan_date')
    .gte('posted_at', cutoff)
    .order('scan_date', { ascending: false });

  if (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }

  // Deduplicate: per (creator, product_name, brand) keep the row with the most-recent scan_date.
  // Since rows are already sorted scan_date DESC, first-seen wins.
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = `${row.creator_username}|${row.product_name}|${row.brand || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  // Group by creator
  const grouped = {};
  let latestScanDate = null;
  for (const row of deduped) {
    if (!grouped[row.creator_username]) grouped[row.creator_username] = [];
    grouped[row.creator_username].push(row);
    if (!latestScanDate || row.scan_date > latestScanDate) {
      latestScanDate = row.scan_date;
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ data: grouped, last_updated: latestScanDate }),
  };
};

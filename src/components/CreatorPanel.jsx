import { useState } from 'react';

function daysSince(isoString) {
  if (!isoString) return Infinity;
  return (Date.now() - new Date(isoString).getTime()) / 86_400_000;
}

function fallbackTrendScore(rank, posted_at) {
  if (!rank) return null;
  const d = daysSince(posted_at);
  return (1000 / rank) * (1 / (d + 1));
}

function formatPosted(isoString) {
  if (!isoString) return '-';
  const d = daysSince(isoString);
  if (d < 1 / 24) return 'just now';
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 2) return 'yesterday';
  if (d < 30) return `${Math.floor(d)}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RankBadge({ rank }) {
  if (!rank) return <span className="empty-value">-</span>;
  const cls = rank <= 10 ? 'rank-top' : rank <= 25 ? 'rank-mid' : 'rank-low';
  return <span className={`rank-badge ${cls}`}>#{rank}</span>;
}

function TrendCell({ score }) {
  if (score == null) return <span className="empty-value">-</span>;
  const cls = score >= 75 ? 'trend-hot' : score >= 40 ? 'trend-warm' : 'trend-cool';
  return <span className={`trend-score ${cls}`}>{Number(score).toFixed(1)}</span>;
}

function productScore(item) {
  return item.momentum_score ?? fallbackTrendScore(item.popular_rank, item.posted_at);
}

function isVisibleRanked(item) {
  return item.matched_in_popular && item.popular_rank != null && Number(productScore(item)) > 0;
}

function ProductThumb({ item }) {
  const [broken, setBroken] = useState(false);
  if (!item.image_url || broken) return <div className="product-thumb placeholder" />;
  return (
    <img
      className="product-thumb"
      src={item.image_url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

function ProductCopy({ item, creatorLabel }) {
  return (
    <div className="product-copy">
      {item.brand && <div className="product-brand-line">{item.brand}</div>}
      <div className="product-name">
        {item.product_url
          ? <a href={item.product_url} target="_blank" rel="noopener noreferrer">{item.product_name}</a>
          : item.product_name}
      </div>
      <div className="product-meta-mobile">
        {creatorLabel && <span>{creatorLabel}</span>}
        {item.price && <span>{item.price}</span>}
      </div>
    </div>
  );
}

function ProductRow({ item, creatorLabel }) {
  return (
    <tr>
      <td><RankBadge rank={item.popular_rank} /></td>
      <td><ProductThumb item={item} /></td>
      <td><ProductCopy item={item} creatorLabel={creatorLabel} /></td>
      <td className="creator-cell">{creatorLabel}</td>
      <td className="brand">{item.brand || '-'}</td>
      <td className="price">{item.price || '-'}</td>
      <td><span className="category-tag">{item.category || '-'}</span></td>
      <td className="posted-time">{formatPosted(item.posted_at)}</td>
      <td><TrendCell score={productScore(item)} /></td>
    </tr>
  );
}

const TABLE_COLS = [
  { key: 'popular_rank', label: 'Rank' },
  { key: 'image',        label: '' },
  { key: 'product_name', label: 'Product' },
  { key: 'creator_name', label: 'Creator' },
  { key: 'brand',        label: 'Brand' },
  { key: 'price',        label: 'Price' },
  { key: 'category',     label: 'Category' },
  { key: 'posted_at',    label: 'Posted' },
  { key: 'trend_score',  label: 'Score' },
];

function CountSummary({ diagnostics, rankedCount }) {
  const recentTotal = diagnostics?.recent_total ?? rankedCount;
  const rankedTotal = diagnostics?.ranked_total ?? rankedCount;
  const unrankedTotal = diagnostics?.unranked_total ?? Math.max(0, recentTotal - rankedTotal);
  const hiddenMomentumTotal = diagnostics?.hidden_momentum_total ?? 0;
  const visibleRankedTotal = diagnostics?.visible_ranked_total ?? rankedCount;

  return (
    <span className="panel-count">
      {visibleRankedTotal} shown / {rankedTotal} ranked / {recentTotal} recent
      {unrankedTotal > 0 && <span className="unranked-count"> {unrankedTotal} unranked</span>}
      {hiddenMomentumTotal > 0 && <span className="hidden-count"> {hiddenMomentumTotal} low momentum</span>}
    </span>
  );
}

export default function CreatorPanel({ creator, products, diagnostics }) {
  const [localSort, setLocalSort] = useState('trend_score');
  const [sortDir, setSortDir] = useState('desc');

  const activeSort = localSort;
  const creatorLabel = creator.name || creator.username;

  function handleHeaderClick(key) {
    if (localSort === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setLocalSort(key);
      setSortDir('desc');
    }
  }

  const ranked = products
    .filter(isVisibleRanked)
    .map(p => ({ ...p, _score: productScore(p) }));

  const recentTotal = diagnostics?.recent_total ?? ranked.length;
  const rankedTotal = diagnostics?.ranked_total ?? ranked.length;
  const unrankedTotal = diagnostics?.unranked_total ?? Math.max(0, recentTotal - rankedTotal);
  const hiddenMomentumTotal = diagnostics?.hidden_momentum_total ?? 0;

  function sortItems(items) {
    return [...items].sort((a, b) => {
      let va, vb;
      if (activeSort === 'trend_score') {
        va = a._score ?? -Infinity;
        vb = b._score ?? -Infinity;
      } else if (activeSort === 'posted_at') {
        va = new Date(a.posted_at || 0).getTime();
        vb = new Date(b.posted_at || 0).getTime();
      } else if (activeSort === 'popular_rank') {
        va = a.popular_rank ?? Infinity;
        vb = b.popular_rank ?? Infinity;
        return sortDir === 'asc' ? va - vb : vb - va;
      } else if (activeSort === 'creator_name') {
        va = creatorLabel;
        vb = creatorLabel;
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      } else {
        va = String(a[activeSort] || '');
        vb = String(b[activeSort] || '');
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  if (ranked.length === 0) {
    const message = rankedTotal > 0 && hiddenMomentumTotal > 0
      ? `${rankedTotal} ranked recent post${rankedTotal !== 1 ? 's' : ''} found, but none meet the current momentum filter.`
      : recentTotal > 0
      ? `${recentTotal} recent Latest post${recentTotal !== 1 ? 's' : ''} found, but none ranked in Popular yet.`
      : 'No recent Latest posts found in this timeframe.';

    return (
      <div className="creator-panel">
        <div className="panel-header">
          <h2>{creator.name}</h2>
          <a href={`https://shopmy.us/shop/${creator.username}`} target="_blank" rel="noopener noreferrer">
            ShopMy -&gt;
          </a>
          <CountSummary diagnostics={diagnostics} rankedCount={ranked.length} />
        </div>
        <div className={`no-data${recentTotal > 0 ? ' pending-rank' : ''}`}>
          {message}
          {recentTotal > 0 && (
            <span className="no-data-detail">
              Hidden by default: {unrankedTotal} unranked and {hiddenMomentumTotal} low-momentum recent item{unrankedTotal + hiddenMomentumTotal !== 1 ? 's' : ''}.
            </span>
          )}
        </div>
      </div>
    );
  }

  const sortedRanked = sortItems(ranked);

  return (
    <div className="creator-panel">
      <div className="panel-header">
        <h2>{creator.name}</h2>
        <a href={`https://shopmy.us/shop/${creator.username}`} target="_blank" rel="noopener noreferrer">
          ShopMy -&gt;
        </a>
        <CountSummary diagnostics={diagnostics} rankedCount={ranked.length} />
      </div>

      <table className="product-table creator-products-table">
        <thead>
          <tr>
            {TABLE_COLS.map(col => (
              col.key === 'image' ? (
                <th key={col.key} aria-label="Image"></th>
              ) : (
                <th
                  key={col.key}
                  className={activeSort === col.key ? 'sorted' : ''}
                  onClick={() => handleHeaderClick(col.key)}
                >
                  {col.label}
                  {activeSort === col.key && (
                    <span className="sort-arrow">{sortDir === 'desc' ? 'v' : '^'}</span>
                  )}
                </th>
              )
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRanked.map((item, i) => (
            <ProductRow key={`${item.product_url || item.product_name}-${i}`} item={item} creatorLabel={creatorLabel} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

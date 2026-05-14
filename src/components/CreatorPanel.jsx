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

function ProductThumb({ item }) {
  if (!item.image_url) return <div className="product-thumb placeholder" />;
  return (
    <img
      className="product-thumb"
      src={item.image_url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function ProductIdentity({ item }) {
  return (
    <div className="product-identity">
      <ProductThumb item={item} />
      <div className="product-copy">
        <div className="product-name">
          {item.product_url
            ? <a href={item.product_url} target="_blank" rel="noopener noreferrer">{item.product_name}</a>
            : item.product_name}
        </div>
        <div className="product-meta-mobile">
          <span>{item.brand || '-'}</span>
          <span>{item.price || '-'}</span>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ item }) {
  return (
    <tr>
      <td><RankBadge rank={item.popular_rank} /></td>
      <td><ProductIdentity item={item} /></td>
      <td className="brand">{item.brand || '-'}</td>
      <td className="price">{item.price || '-'}</td>
      <td><span className="category-tag">{item.category || '-'}</span></td>
      <td className="posted-time">{formatPosted(item.posted_at)}</td>
      <td><TrendCell score={productScore(item)} /></td>
    </tr>
  );
}

function UnrankedRow({ item }) {
  return (
    <tr>
      <td colSpan={7}>
        <div className="unranked-row">
          <span className="rank-empty">-</span>
          <ProductIdentity item={item} />
          <span className="brand">{item.brand || '-'}</span>
          <span className="price">{item.price || '-'}</span>
          <span className="posted-time">{formatPosted(item.posted_at)}</span>
        </div>
      </td>
    </tr>
  );
}

const TABLE_COLS = [
  { key: 'popular_rank', label: 'Rank' },
  { key: 'product_name', label: 'Product' },
  { key: 'brand',        label: 'Brand' },
  { key: 'price',        label: 'Price' },
  { key: 'category',     label: 'Category' },
  { key: 'posted_at',    label: 'Posted' },
  { key: 'trend_score',  label: 'Momentum' },
];

export default function CreatorPanel({ creator, products, sortBy }) {
  const [localSort, setLocalSort] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const activeSort = localSort || sortBy;

  function handleHeaderClick(key) {
    if (localSort === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setLocalSort(key);
      setSortDir('desc');
    }
  }

  const ranked = products
    .filter(p => p.popular_rank != null)
    .map(p => ({ ...p, _score: productScore(p) }));

  const unranked = products.filter(p => p.popular_rank == null);

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
      } else {
        va = String(a[activeSort] || '');
        vb = String(b[activeSort] || '');
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  if (products.length === 0) {
    return (
      <div className="creator-panel">
        <div className="panel-header">
          <h2>{creator.name}</h2>
          <a href={`https://shopmy.us/shop/${creator.username}`} target="_blank" rel="noopener noreferrer">
            ShopMy -&gt;
          </a>
        </div>
        <div className="no-data">No posts in this timeframe</div>
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
        <span className="panel-count">{products.length} item{products.length !== 1 ? 's' : ''}</span>
      </div>

      <table className="product-table">
        <thead>
          <tr>
            {TABLE_COLS.map(col => (
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
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRanked.map((item, i) => (
            <ProductRow key={`${item.product_url || item.product_name}-${i}`} item={item} />
          ))}
        </tbody>
      </table>

      {unranked.length > 0 && (
        <div className="watch-section">
          <div className="watch-label">Too New to Rank - Watch These</div>
          <table className="product-table">
            <tbody>
              {unranked.map((item, i) => (
                <UnrankedRow key={`unranked-${item.product_url || i}`} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

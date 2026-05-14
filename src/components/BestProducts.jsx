import { useState } from 'react';

const DEFAULT_VISIBLE_COUNT = 25;
const VISIBLE_COUNT_OPTIONS = [25, 50, 75, 100];
const SHOW_ALL_VALUE = 'all';

function daysSince(isoString) {
  if (!isoString) return Infinity;
  return (Date.now() - new Date(isoString).getTime()) / 86_400_000;
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

function productKey(item) {
  return `${item.product_url || item.product_name}|${item.brand || ''}`;
}

function isVisibleRanked(item) {
  return item.matched_in_popular && item.popular_rank != null && Number(item.momentum_score) > 0;
}

function bestProducts(data, visibleCreators, minMomentum) {
  const visibleUsernames = new Set(visibleCreators.map(c => c.username));
  const bestByProduct = new Map();

  for (const [username, products] of Object.entries(data)) {
    if (!visibleUsernames.has(username)) continue;
    for (const product of products || []) {
      if (!isVisibleRanked(product)) continue;
      if (Number(product.momentum_score) < Number(minMomentum)) continue;
      const key = productKey(product);
      const existing = bestByProduct.get(key);
      const creatorSet = existing?._creatorSet || new Set();
      creatorSet.add(username);
      if (!existing || Number(product.momentum_score) > Number(existing.momentum_score)) {
        bestByProduct.set(key, {
          ...product,
          _creatorSet: creatorSet,
          creator_count: creatorSet.size,
        });
      } else {
        existing.creator_count = creatorSet.size;
      }
    }
  }

  return [...bestByProduct.values()]
    .map(item => ({ ...item, creator_count: item._creatorSet.size }))
    .sort((a, b) => Number(b.momentum_score) - Number(a.momentum_score));
}

export default function BestProducts({ data, visibleCreators, minMomentum }) {
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_COUNT);
  const products = bestProducts(data, visibleCreators, minMomentum);
  const effectiveVisibleCount = visibleCount === SHOW_ALL_VALUE ? products.length : visibleCount;
  const visibleProducts = products.slice(0, effectiveVisibleCount);
  const hiddenCount = Math.max(0, products.length - visibleProducts.length);
  const canShowMore = effectiveVisibleCount < products.length;
  const canCollapse = effectiveVisibleCount > DEFAULT_VISIBLE_COUNT;

  return (
    <section className="creator-panel best-products-panel">
      <div className="panel-header">
        <h2>Best Products</h2>
        <span className="panel-count">
          {visibleProducts.length} shown / {products.length} item{products.length !== 1 ? 's' : ''}
        </span>
        {products.length > DEFAULT_VISIBLE_COUNT && (
          <div className="panel-actions">
            <select
              className="compact-select"
              value={visibleCount}
              onChange={e => setVisibleCount(e.target.value === SHOW_ALL_VALUE ? SHOW_ALL_VALUE : Number(e.target.value))}
            >
              {VISIBLE_COUNT_OPTIONS.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
              <option value={SHOW_ALL_VALUE}>Show all</option>
            </select>
            {canShowMore && (
              <button
                className="btn panel-action"
                onClick={() => setVisibleCount(v => Math.min((v === SHOW_ALL_VALUE ? products.length : v) + 25, products.length))}
              >
                Show more
              </button>
            )}
            {canCollapse && (
              <button className="btn panel-action" onClick={() => setVisibleCount(DEFAULT_VISIBLE_COUNT)}>
                Collapse
              </button>
            )}
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className="no-data">No ranked products at momentum {minMomentum}+ in this timeframe.</div>
      ) : (
        <table className="product-table best-products-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Photo</th>
              <th>Product</th>
              <th>Creator</th>
              <th>Brand</th>
              <th>Price</th>
              <th>Category</th>
              <th>Posted</th>
              <th>Momentum</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((item, i) => (
              <tr key={`${productKey(item)}-${i}`}>
                <td><RankBadge rank={item.popular_rank} /></td>
                <td>
                  <ProductThumb item={item} />
                </td>
                <td>
                  <div className="product-copy">
                    <div className="product-name">
                      {item.product_url
                        ? <a href={item.product_url} target="_blank" rel="noopener noreferrer">{item.product_name}</a>
                        : item.product_name}
                    </div>
                    <div className="product-meta-mobile">
                      <span>{item.creator_username}</span>
                      <span>{item.price || '-'}</span>
                    </div>
                  </div>
                </td>
                <td className="creator-cell">
                  {item.creator_username}
                  {item.creator_count > 1 && <span className="creator-count"> +{item.creator_count - 1}</span>}
                </td>
                <td className="brand">{item.brand || '-'}</td>
                <td className="price">{item.price || '-'}</td>
                <td><span className="category-tag">{item.category || '-'}</span></td>
                <td className="posted-time">{formatPosted(item.posted_at)}</td>
                <td><TrendCell score={item.momentum_score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hiddenCount > 0 && (
        <div className="table-footer">
          Showing top {visibleProducts.length}. {hiddenCount} more product{hiddenCount !== 1 ? 's' : ''} match this filter.
        </div>
      )}
    </section>
  );
}

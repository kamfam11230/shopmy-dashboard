import { useState, useEffect, useCallback } from 'react';
import { CREATORS } from './creators.js';
import Controls from './components/Controls.jsx';
import CreatorPanel from './components/CreatorPanel.jsx';
import BestProducts from './components/BestProducts.jsx';

const ALL_USERNAMES = new Set(CREATORS.map(c => c.username));
const API_DAYS = 30;

function isWithinTimeframe(item, days) {
  if (!item.posted_at) return false;
  const postedAt = new Date(item.posted_at).getTime();
  if (Number.isNaN(postedAt)) return false;
  return Date.now() - postedAt <= Number(days) * 86_400_000;
}

function isRanked(item) {
  return item.matched_in_popular && item.popular_rank != null;
}

function hasVisibleMomentum(item) {
  return isRanked(item) && Number(item.momentum_score) > 0;
}

function filterDataByTimeframe(data, days) {
  return Object.fromEntries(
    Object.entries(data).map(([username, products]) => [
      username,
      (products || []).filter(item => isWithinTimeframe(item, days)),
    ])
  );
}

function buildTimeframeDiagnostics(data) {
  return Object.fromEntries(
    CREATORS.map(({ username }) => {
      const products = data[username] || [];
      const recentTotal = products.length;
      const rankedTotal = products.filter(isRanked).length;
      const visibleRankedTotal = products.filter(hasVisibleMomentum).length;

      return [
        username,
        {
          recent_total: recentTotal,
          ranked_total: rankedTotal,
          unranked_total: Math.max(0, recentTotal - rankedTotal),
          hidden_momentum_total: Math.max(0, rankedTotal - visibleRankedTotal),
          visible_ranked_total: visibleRankedTotal,
        },
      ];
    })
  );
}

export default function App() {
  const [days, setDays] = useState(4);
  const [selectedCreators, setSelectedCreators] = useState(ALL_USERNAMES);
  const [sortBy, setSortBy] = useState('trend_score');
  const [minMomentum, setMinMomentum] = useState(50);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
  setLoading(true);
  setError(null);

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || "/.netlify/functions";

  try {
    const res = await fetch(`${apiBase}/products?days=${API_DAYS}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const json = await res.json();
    setData(json.data || {});
    setLastUpdated(json.last_updated || null);
  } catch (e) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visibleCreators = CREATORS.filter(c => selectedCreators.has(c.username));
  const timeframeData = filterDataByTimeframe(data, days);
  const timeframeDiagnostics = buildTimeframeDiagnostics(timeframeData);

  return (
    <>
      <div className="header">
        <h1>ShopMy Creator Intelligence</h1>
        {lastUpdated && (
          <span className="subtitle">
            Last scan: {new Date(lastUpdated).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            })}
          </span>
        )}
      </div>

      <Controls
        days={days}
        setDays={setDays}
        selectedCreators={selectedCreators}
        setSelectedCreators={setSelectedCreators}
        sortBy={sortBy}
        setSortBy={setSortBy}
        minMomentum={minMomentum}
        setMinMomentum={setMinMomentum}
      />

      <div className="main">
        {loading && <div className="loading">Loading…</div>}
        {error && <div className="error-msg">Error: {error}</div>}
        {!loading && !error && (
          <BestProducts
            data={timeframeData}
            visibleCreators={visibleCreators}
            minMomentum={minMomentum}
          />
        )}
        {!loading && !error && visibleCreators.map(creator => (
          <CreatorPanel
            key={creator.username}
            creator={creator}
            products={timeframeData[creator.username] || []}
            diagnostics={timeframeDiagnostics[creator.username]}
            sortBy={sortBy}
            days={days}
          />
        ))}
      </div>
    </>
  );
}

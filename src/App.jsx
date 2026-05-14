import { useState, useEffect, useCallback } from 'react';
import { CREATORS } from './creators.js';
import Controls from './components/Controls.jsx';
import CreatorPanel from './components/CreatorPanel.jsx';
import BestProducts from './components/BestProducts.jsx';

const ALL_USERNAMES = new Set(CREATORS.map(c => c.username));

export default function App() {
  const [days, setDays] = useState(7);
  const [selectedCreators, setSelectedCreators] = useState(ALL_USERNAMES);
  const [sortBy, setSortBy] = useState('trend_score');
  const [viewMode, setViewMode] = useState('both');
  const [minMomentum, setMinMomentum] = useState(50);
  const [data, setData] = useState({});
  const [diagnostics, setDiagnostics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
  setLoading(true);
  setError(null);

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || "/.netlify/functions";

  try {
    const res = await fetch(`${apiBase}/products?days=${days}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const json = await res.json();
    setData(json.data || {});
    setDiagnostics(json.diagnostics || {});
    setLastUpdated(json.last_updated || null);
  } catch (e) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
}, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visibleCreators = CREATORS.filter(c => selectedCreators.has(c.username));

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
        viewMode={viewMode}
        setViewMode={setViewMode}
        minMomentum={minMomentum}
        setMinMomentum={setMinMomentum}
      />

      <div className="main">
        {loading && <div className="loading">Loading…</div>}
        {error && <div className="error-msg">Error: {error}</div>}
        {!loading && !error && (viewMode === 'best' || viewMode === 'both') && (
          <BestProducts
            data={data}
            visibleCreators={visibleCreators}
            minMomentum={minMomentum}
          />
        )}
        {!loading && !error && (viewMode === 'creators' || viewMode === 'both') && visibleCreators.map(creator => (
          <CreatorPanel
            key={creator.username}
            creator={creator}
            products={data[creator.username] || []}
            diagnostics={diagnostics[creator.username]}
            sortBy={sortBy}
            days={days}
          />
        ))}
      </div>
    </>
  );
}

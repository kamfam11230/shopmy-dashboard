import { CREATORS } from '../creators.js';

const TIMELINE_OPTIONS = [
  { label: '24h',  days: 1 },
  { label: '3d',   days: 3 },
  { label: '7d',   days: 7 },
  { label: '14d',  days: 14 },
  { label: '30d',  days: 30 },
];

export default function Controls({ days, setDays, selectedCreators, setSelectedCreators, sortBy, setSortBy }) {
  function toggle(username) {
    setSelectedCreators(prev => {
      const next = new Set(prev);
      next.has(username) ? next.delete(username) : next.add(username);
      return next;
    });
  }

  return (
    <div className="controls">
      <div className="control-group">
        <span className="control-label">Timeline</span>
        <div className="btn-group">
          {TIMELINE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              className={`btn${days === opt.days ? ' active' : ''}`}
              onClick={() => setDays(opt.days)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">Sort within panels</span>
        <div className="btn-group">
          <button className={`btn${sortBy === 'trend_score' ? ' active' : ''}`} onClick={() => setSortBy('trend_score')}>
            Trend Score
          </button>
          <button className={`btn${sortBy === 'posted_at' ? ' active' : ''}`} onClick={() => setSortBy('posted_at')}>
            Post Date
          </button>
        </div>
      </div>

      <div className="control-group" style={{ flexGrow: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span className="control-label" style={{ marginBottom: 0 }}>Creators</span>
          <div className="select-links">
            <button onClick={() => setSelectedCreators(new Set(CREATORS.map(c => c.username)))}>
              All
            </button>
            <button onClick={() => setSelectedCreators(new Set())}>
              None
            </button>
          </div>
        </div>
        <div className="creator-checkboxes">
          {CREATORS.map(c => (
            <label key={c.username} className={`creator-chip${selectedCreators.has(c.username) ? ' checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedCreators.has(c.username)}
                onChange={() => toggle(c.username)}
              />
              <span className="chip-dot" />
              {c.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

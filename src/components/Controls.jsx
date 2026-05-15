import { CREATORS } from '../creators.js';
import { useState } from 'react';

const TIMELINE_OPTIONS = [
  { label: '24 hours', days: 1 },
  { label: '2 days',   days: 2 },
  { label: '4 days',   days: 4 },
  { label: '7 days',   days: 7 },
  { label: '30 days',  days: 30 },
];

const MOMENTUM_OPTIONS = [1, 50, 70, 80, 90];

export default function Controls({
  days,
  setDays,
  selectedCreators,
  setSelectedCreators,
  minMomentum,
  setMinMomentum,
}) {
  const [showCreators, setShowCreators] = useState(false);

  function toggle(username) {
    setSelectedCreators(prev => {
      const next = new Set(prev);
      next.has(username) ? next.delete(username) : next.add(username);
      return next;
    });
  }

  const selectedCount = selectedCreators.size;

  return (
    <div className="controls">
      <div className="controls-row">
        <div className="control-group compact-group">
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

        <div className="control-group compact-group">
          <span className="control-label">Min Momentum</span>
          <div className="btn-group">
            {MOMENTUM_OPTIONS.map(value => (
              <button
                key={value}
                className={`btn${Number(minMomentum) === value ? ' active' : ''}`}
                onClick={() => setMinMomentum(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group creator-toggle-group">
          <span className="control-label">Creators</span>
          <button className="btn creator-toggle" onClick={() => setShowCreators(v => !v)}>
            {selectedCount}/{CREATORS.length} selected {showCreators ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {showCreators && (
        <div className="creator-filter-panel">
          <div className="select-links">
            <button onClick={() => setSelectedCreators(new Set(CREATORS.map(c => c.username)))}>
              All
            </button>
            <button onClick={() => setSelectedCreators(new Set())}>
              None
            </button>
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
      )}
    </div>
  );
}

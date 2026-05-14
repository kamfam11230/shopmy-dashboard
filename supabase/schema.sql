-- Run this in the Supabase SQL editor to set up the database

CREATE TABLE IF NOT EXISTS scans (
  id          BIGSERIAL PRIMARY KEY,
  creator_username  TEXT NOT NULL,
  scan_date   DATE NOT NULL,
  product_url TEXT,
  image_url   TEXT,
  product_name TEXT NOT NULL,
  brand       TEXT,
  category    TEXT,
  price       TEXT,
  posted_at   TIMESTAMPTZ,
  age_days    NUMERIC,
  timeframe_bucket TEXT CHECK (timeframe_bucket IN ('1d', '3d', '7d', '14d', '30d')),
  popular_rank INTEGER,
  matched_in_popular BOOLEAN NOT NULL DEFAULT FALSE,
  momentum_score NUMERIC NOT NULL DEFAULT 0,
  latest_window_incomplete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (creator_username, scan_date, product_url)
);

CREATE INDEX IF NOT EXISTS idx_scans_creator_date ON scans (creator_username, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_scans_posted_at    ON scans (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_timeframe    ON scans (timeframe_bucket);
CREATE INDEX IF NOT EXISTS idx_scans_momentum     ON scans (momentum_score DESC);

-- Allow public read access (anon key used by Netlify functions)
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON scans
  FOR SELECT USING (true);

-- Service role (used by scraper) bypasses RLS automatically

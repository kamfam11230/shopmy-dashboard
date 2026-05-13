-- Run this in the Supabase SQL editor to set up the database

CREATE TABLE IF NOT EXISTS scans (
  id          BIGSERIAL PRIMARY KEY,
  creator_username  TEXT NOT NULL,
  scan_date   DATE NOT NULL,
  product_url TEXT,
  product_name TEXT NOT NULL,
  brand       TEXT,
  category    TEXT,
  price       TEXT,
  posted_at   TIMESTAMPTZ,
  popular_rank INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (creator_username, scan_date, product_name, brand)
);

CREATE INDEX IF NOT EXISTS idx_scans_creator_date ON scans (creator_username, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_scans_posted_at    ON scans (posted_at DESC);

-- Allow public read access (anon key used by Netlify functions)
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON scans
  FOR SELECT USING (true);

-- Service role (used by scraper) bypasses RLS automatically

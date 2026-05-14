-- Migration for the daily fresh product feed.
-- Run this in the Supabase SQL editor before deploying the API-based scraper.

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS age_days NUMERIC,
  ADD COLUMN IF NOT EXISTS timeframe_bucket TEXT,
  ADD COLUMN IF NOT EXISTS matched_in_popular BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS momentum_score NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_window_incomplete BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.scans
  DROP CONSTRAINT IF EXISTS scans_timeframe_bucket_check;

ALTER TABLE public.scans
  ADD CONSTRAINT scans_timeframe_bucket_check
  CHECK (timeframe_bucket IN ('1d', '3d', '7d', '14d', '30d'));

ALTER TABLE public.scans
  DROP CONSTRAINT IF EXISTS scans_creator_username_scan_date_product_name_brand_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_creator_scan_url_unique
  ON public.scans (creator_username, scan_date, product_url);

CREATE INDEX IF NOT EXISTS idx_scans_timeframe
  ON public.scans (timeframe_bucket);

CREATE INDEX IF NOT EXISTS idx_scans_momentum
  ON public.scans (momentum_score DESC);

CREATE INDEX IF NOT EXISTS idx_scans_matched_popular
  ON public.scans (matched_in_popular);

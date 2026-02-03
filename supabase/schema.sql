-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Cursors Table (to track ingestion progress)
create table if not exists cursors (
  key text primary key,
  value text
);

-- Table 1: buys (raw events only)
create table if not exists buys (
  id bigint generated always as identity primary key,
  buyer text not null,
  post_token text not null,
  block_time timestamptz not null,
  tx_hash text not null,
  CONSTRAINT buys_tx_hash_post_token_buyer_key UNIQUE(tx_hash, post_token, buyer)
);

-- Table 2: identities (cached names & social info)
create table if not exists identities (
  address text primary key,
  base_name text,
  ens text,
  farcaster_username text,
  farcaster_fid bigint,
  avatar_url text,
  updated_at timestamptz default now()
);

-- Table 3: holdings (derived balances)
create table if not exists holdings (
  wallet text,
  post_token text,
  balance numeric default 0,
  updated_at timestamptz default now(),
  primary key (wallet, post_token)
);
create index if not exists idx_holdings_wallet on holdings(wallet);


-- Indexes (Important for performance)
create index if not exists idx_buys_time on buys(block_time);
create index if not exists idx_buys_buyer on buys(buyer);
create index if not exists idx_buys_post_token on buys(post_token);

-- FIX FOR UNIQUE CONSTRAINT (Run this if you have existing data)
-- Ensure we don't have the old 2-column unique constraint
ALTER TABLE buys DROP CONSTRAINT IF EXISTS buys_tx_hash_post_token_key;
-- Ensure we don't have the 3-column one under a different name or to allow re-run
ALTER TABLE buys DROP CONSTRAINT IF EXISTS buys_tx_hash_post_token_buyer_key;
-- Add it back cleanly
ALTER TABLE buys ADD CONSTRAINT buys_tx_hash_post_token_buyer_key UNIQUE (tx_hash, post_token, buyer);

-- RPC: Get Leaderboard (Optimized for the new identities table)
DROP FUNCTION IF EXISTS get_leaderboard(int, int);

CREATE OR REPLACE FUNCTION get_leaderboard(period_days int default 7, limit_count int default 20)
RETURNS TABLE (
  buyer_address text,
  total_buys bigint,
  unique_posts bigint,
  last_active timestamptz,
  base_name text,
  farcaster_username text,
  avatar_url text,
  farcaster_fid bigint
)
LANGUAGE sql
AS $$
  SELECT 
    b.buyer as buyer_address,
    COUNT(*) as total_buys,
    COUNT(DISTINCT b.post_token) as unique_posts,
    MAX(b.block_time) as last_active,
    i.base_name,
    i.farcaster_username,
    i.avatar_url,
    i.farcaster_fid
  FROM buys b
  LEFT JOIN identities i ON b.buyer = i.address
  WHERE b.block_time > (now() - (period_days || ' days')::interval)
  GROUP BY b.buyer, i.base_name, i.farcaster_username, i.avatar_url, i.farcaster_fid
  ORDER BY unique_posts DESC, total_buys DESC
  LIMIT limit_count;
$$;

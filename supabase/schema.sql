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
  unique(tx_hash, post_token) -- prevent duplicates
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

-- Indexes (Important for performance)
create index if not exists idx_buys_time on buys(block_time);
create index if not exists idx_buys_buyer on buys(buyer);
create index if not exists idx_buys_post_token on buys(post_token);

-- RPC: Get Leaderboard (Optimized for the new identities table)
create or replace function get_leaderboard(period_days int default 7, limit_count int default 20)
returns table (
  buyer_address text,
  buys_count bigint,
  last_active timestamptz,
  base_name text,
  farcaster_username text,
  avatar_url text,
  farcaster_fid bigint
)
language sql
as $$
  select 
    b.buyer as buyer_address,
    count(*) as buys_count,
    max(b.block_time) as last_active,
    i.base_name,
    i.farcaster_username,
    i.avatar_url,
    i.farcaster_fid
  from buys b
  left join identities i on b.buyer = i.address
  where b.block_time > (now() - (period_days || ' days')::interval)
  group by b.buyer, i.base_name, i.farcaster_username, i.avatar_url, i.farcaster_fid
  order by buys_count desc
  limit limit_count;
$$;

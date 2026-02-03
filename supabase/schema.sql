-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Cursors Table
create table if not exists cursors (
  key text primary key,
  value text
);

-- Buys Table
create table if not exists buys (
  id bigint primary key generated always as identity,
  buyer text not null,
  post_token text not null,
  block_time timestamp with time zone not null,
  tx_hash text not null,
  unique(tx_hash, post_token)
);

-- Names Table
create table if not exists names (
  address text primary key,
  name text,
  source text,
  updated_at timestamp with time zone default now()
);

-- Indexes
create index if not exists buys_buyer_idx on buys(buyer);
create index if not exists buys_block_time_idx on buys(block_time);

-- RPC: Get Leaderboard
create or replace function get_leaderboard(period_days int default 7, limit_count int default 100)
returns table (
  buyer_address text,
  posts_bought bigint,
  total_buy_events bigint,
  last_active timestamp with time zone,
  buyer_basename text,
  buyer_avatar text
)
language sql
as $$
  select 
    b.buyer as buyer_address,
    count(distinct b.post_token) as posts_bought,
    count(*) as total_buy_events,
    max(b.block_time) as last_active,
    n.name as buyer_basename,
    n.name as buyer_avatar
  from buys b
  left join names n on b.buyer = n.address
  where b.block_time > (now() - (period_days || ' days')::interval)
  group by b.buyer
  order by posts_bought desc
  limit limit_count;
$$;

-- RPC: Get Profile Stats
create or replace function get_profile_stats(check_address text)
returns table (
  total_buys bigint,
  unique_creators bigint,
  last_buy_time timestamp with time zone
)
language sql
as $$
  select 
    count(*) as total_buys,
    count(distinct post_token) as unique_creators,
    max(block_time) as last_buy_time
  from buys
  where buyer = check_address;
$$;

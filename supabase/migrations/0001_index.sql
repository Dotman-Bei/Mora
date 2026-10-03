-- Mora index (PRD §10.4, §12). The index lists candidates; the browser reads
-- every amount from the contract before showing it. Run once in the Supabase
-- SQL editor, or with `supabase db push`.

-- Raw Mora events, exactly once each.
create table if not exists mora_events (
  network        text        not null,
  tx_hash        text        not null,
  event_index    int         not null,
  ledger         int         not null,
  closed_at      timestamptz not null,
  type           text        not null check (type in ('delivered','parked','claimed','moved','returned')),
  from_addr      text        not null,
  to_addr        text        not null,
  token          text        not null,
  amount         numeric(39,0) not null,
  reason         int,
  refund_after   int,
  parcel_total   numeric(39,0),
  trustline_created boolean,
  primary key (network, tx_hash, event_index)
);
create index if not exists mora_events_key on mora_events (network, from_addr, to_addr, token, ledger);

-- One row per payment (each delivered or parked event), with its current status.
create table if not exists mora_parcels (
  network        text        not null,
  tx_hash        text        not null,
  event_index    int         not null,
  ledger         int         not null,
  closed_at      timestamptz not null,
  from_addr      text        not null,
  to_addr        text        not null,
  token          text        not null,
  amount         numeric(39,0) not null,
  outcome        text        not null check (outcome in ('delivered','waiting')),
  status         text        not null check (status in ('delivered','waiting','claimed','moved','returned')),
  reason         int,
  refund_after   int,
  resolved_tx    text,
  resolved_ledger int,
  primary key (network, tx_hash, event_index)
);
-- Every list query is paginated and indexed on network plus address (PRD §10.3).
create index if not exists mora_parcels_to   on mora_parcels (network, to_addr, status, ledger desc, tx_hash, event_index);
create index if not exists mora_parcels_from on mora_parcels (network, from_addr, ledger desc, tx_hash, event_index);
create index if not exists mora_parcels_key  on mora_parcels (network, from_addr, to_addr, token);

-- Cursor per network, so a dedicated worker can take over later (PRD §10.3).
create table if not exists mora_sync (
  network     text primary key,
  cursor      text,
  last_ledger int,
  updated_at  timestamptz not null default now()
);

-- Fixed-window rate limits for the public API and faucet.
create table if not exists mora_rate (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null
);

-- Only the server (service role) touches these tables; the public reads
-- through /api/v1 so responses can say they are candidates.
alter table mora_events  enable row level security;
alter table mora_parcels enable row level security;
alter table mora_sync    enable row level security;
alter table mora_rate    enable row level security;

-- Landing numbers in one round trip.
create or replace function mora_stats(p_network text)
returns table (delivered bigint, waited bigint, claimed bigint, returned bigint)
language sql stable as $$
  select
    count(*) filter (where outcome = 'delivered'),
    count(*) filter (where outcome = 'waiting'),
    count(*) filter (where status = 'claimed'),
    count(*) filter (where status = 'returned')
  from mora_parcels where network = p_network;
$$;

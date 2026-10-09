-- Rate-limit counters for the Portaj sponsor service (FR-3.4).
create table if not exists portaj_rate (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);
alter table portaj_rate enable row level security;
-- No policies: only the service role (server) reads and writes.

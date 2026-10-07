-- TRET.AI v0.0.0.4 additive (adapters / cross-source)
-- Applied live 2026-10-07 (owner go).
-- Prior 20261006140000 may already be live; this only ALTERs / inserts settings.

alter table public.import_runs
  add column if not exists source text null;

comment on column public.import_runs.source is
  'Import source adapter id: mcp | csv | api';

alter table public.import_runs
  drop constraint if exists import_runs_source_check;

alter table public.import_runs
  add constraint import_runs_source_check
  check (source is null or source in ('mcp', 'csv', 'api'));

-- Natural key across sources = manifest friendlyId (uniqueness per company OPEN).
create unique index if not exists loads_manifest_friendly_id_uidx
  on public.loads (manifest_friendly_id)
  where manifest_friendly_id is not null;

alter table public.vektor_loads_staging
  add column if not exists manifest_friendly_id text null;

create index if not exists vektor_loads_staging_friendly_id_idx
  on public.vektor_loads_staging (manifest_friendly_id);

insert into public.import_settings (key, value_text, note) values
  (
    'import_source',
    null,
    'Selected adapter: mcp | csv | api. Null = none selected. MCP cannot be default until OAuth spike verifies refresh.'
  ),
  (
    'mcp_verified',
    'false',
    'Set true only after spike proves tools/list + unattended refresh_token.'
  ),
  (
    'csv_column_mapping',
    null,
    'JSON map of our field → CSV column. Null = CSV not configured (OPEN until real export).'
  )
on conflict (key) do nothing;

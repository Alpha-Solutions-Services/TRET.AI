-- TRET.AI v0.0.0.13
-- Additive column on trucks. Not applied until the owner says go.
-- Does not change Row Level Security. trucks_allowed_users_all already covers every column.

alter table public.trucks
  add column if not exists google_sheet_url text null;

comment on column public.trucks.google_sheet_url is
  'Optional https link to this truck''s Google Sheet or portal sheet. Staff paste it on Add truck or Edit.';

alter table public.trucks
  drop constraint if exists trucks_google_sheet_url_https;

alter table public.trucks
  add constraint trucks_google_sheet_url_https
  check (
    google_sheet_url is null
    or (
      char_length(google_sheet_url) between 9 and 2000
      and google_sheet_url ~ '^https://[^[:space:]]+$'
    )
  );

-- TRET.AI v0.0.0.28
-- Backfill loads.source_manifest_ref from the Oct 5 to 7 Vektor orders export
-- (fixtures/vektor/vektor-loads-2026-10-05.csv).
-- Do not apply until the owner says go.
-- Fills a blank manifest only. Does not change a manifest that is already set.
-- Does not insert rows. Does not change load ids, miles, rates, or dates.
-- Match is letters and digits, so TBH1188 and TBH--1188 are the same load.
-- Requires tret_load_match_key from 20261007220000_v26_load_ids_compare_qbo_file.sql.

update public.loads as target
set source_manifest_ref = src.manifest_ref
from (
  values
    ('TBH1197', '1197'),
    ('TBH1196', '1196'),
    ('TBH1195', '1195'),
    ('TBH1193', '1196'),
    ('TBH1192', '1195'),
    ('TBH1191', '1191'),
    ('TBH1190', '1191'),
    ('TBH1189', '1189'),
    ('TBH1188', '1195'),
    ('TBH1187', '1187'),
    ('TBH1186', '1186'),
    ('TBH1185', '1185'),
    ('TBH1184', '1184'),
    ('TBH1183', '1191'),
    ('TBH1181', '1191')
) as src(match_key, manifest_ref)
where public.tret_load_match_key(target.load_id) = src.match_key
  and nullif(btrim(coalesce(target.source_manifest_ref, '')), '') is null;

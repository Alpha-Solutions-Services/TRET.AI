# Data model

Plain description of the database tables used by TRET.AI. Money work in the app uses integer cents and basis points; these tables store the fee rules those numbers come from.

## allowed_users (from v0.0.0.1)

Who may sign in. Each row is an email address and a role (for example `owner`). Row Level Security lets a signed-in user read only their own row. The app still checks this list after login.

## trucks

One row per truck. There is no fixed truck count anywhere in the code or schema — add a row when a truck is added. Trucks are never deleted; set `active` to false instead.

| Column | Meaning |
|--------|---------|
| id | Internal id |
| unit_number | Unique unit label (for example the number on the truck) |
| name | Display name |
| truck_class | `legacy_owned` or `third_party` |
| owner_name | Owner name when useful; may be empty |
| active | Whether the truck is in use |
| created_at | When the row was created |

## fee_contracts

A dated fee agreement for one truck (a “rate version”). Start and end dates are inclusive. End may be empty (still open). The database rejects two contracts for the same truck whose date ranges overlap. Creating a new version closes the previous open version the day before the new start date (one database transaction).

| Column | Meaning |
|--------|---------|
| id | Internal id |
| truck_id | Which truck |
| effective_from | First day this contract applies (inclusive) |
| effective_to | Last day (inclusive); empty means open-ended |
| note | Optional note |

## fee_rules

One fee line on a contract. Each fee kind appears at most once per contract. There is no default for the base — every rule must state what share of gross it applies to.

| Column | Meaning |
|--------|---------|
| id | Internal id |
| contract_id | Which contract |
| kind | `DRIVER_PAY`, `MANAGEMENT_FEE`, `DISPATCH_FEE`, `FACTORING_FEE`, `TOLSON_PAYABLE`, or `LEGACY_RETAINED` |
| rate_bp | Rate in basis points (550 = 5.5%) |
| base_pct_bp | Share of gross in basis points (10000 = 100% of gross; 9500 = 95% of gross) |

## change_log (from v0.0.0.3)

Audit trail. Truck create / activate / deactivate, rate-version create / delete, fixed-expense version and override changes, and operating-expense create / delete each write a row: who, when, action, and optional before/after JSON.

| Column | Meaning |
|--------|---------|
| id | Internal id |
| entity_type | `truck`, `fee_contract`, `truck_fixed_expense`, `truck_fixed_expense_override`, or `mgmt_operating_expense` |
| entity_id | Id of the truck or contract |
| action | What happened (for example `create_truck`, `create_rate_version`) |
| actor_email | Signed-in user who made the change |
| before_data | Previous values (JSON), if any |
| after_data | New values (JSON), if any |
| created_at | When it was logged |

## Database functions (v0.0.0.3)

- `create_fee_rate_version` — closes the open version, inserts the new version and rules, writes `change_log`, in one transaction. Requires the signed-in user to be in `allowed_users`.
- `delete_latest_fee_rate_version` — removes the newest version (and reopens the previous one if it was closed for that version). Refuses if weekly statements exist for the truck (none yet).
- `truck_has_weekly_statements` — returns false until a `weekly_statements` table exists.

## import_settings / import_runs / vektor_loads_staging / loads / issues (v0.0.0.4)

- **import_settings** — thresholds (for example row-count drop %) so rules are not hardcoded.
- **import_runs** — each manual Import now: time, status, fetched/promoted/rejected/updated counts, plain-language errors.
- **vektor_loads_staging** — raw manifests, unique on `manifest_id` (idempotency). Unmatched trucks stay here.
- **loads** — promoted delivered loads. Money in integer cents. `load_id` = order friendlyId; `manifest_friendly_id` separate. Deadhead = `emptyDistance`. Trip Group / Primary Load columns exist but stay empty (OPEN). Lineage fields stored raw.
- **issues** — Block / Warn / Info with rule, message, ref, status.
- **import_runs.kind** (v0.0.0.7) — `loads` (default), `fuel`, or `tolls`. Row-count drop compares the same kind only.
- **vektor_mcp_connection** — one row of encrypted Vektor OAuth client data and tokens. Not readable by the browser.
- **vektor_oauth_pending** — one-time encrypted PKCE verifier while Connect Vektor is in progress.

## vektor_fuel_staging / vektor_toll_staging / fuel_transactions / toll_transactions (v0.0.0.7)

Staging is unique on `vektor_transaction_id`. A second import of the same id updates that row. Unmatched trucks stay in staging.

Promoted fuel stores gallons as milli-gallons and money as integer cents. `amount_cents` is the discounted amount that is booked. `retail_amount_cents` is kept so the Truck 3 $1 gap can be checked. Promoted tolls store the Vektor truck id and the resolved `unit_number`.

Validation thresholds are rows in `import_settings` (price per gallon, tank size, MPG band, row-count drop). They are not hardcoded in the validators.

## truck_fixed_expenses (v0.0.0.6)

One weekly amount for one truck and one expense kind. Start and end dates are inclusive. End may be empty (still open). The database rejects two rows for the same truck and kind whose date ranges overlap. `effective_from` must be a Monday. Creating a new version closes the previous open version of that kind the day before the new Monday.

| Column | Meaning |
|--------|---------|
| id | Internal id |
| truck_id | Which truck |
| kind | One of the ten fixed expense kinds |
| weekly_amount_cents | Weekly amount in integer cents |
| charged_to | `owner` (default) or `management` |
| effective_from | First day (a Monday, inclusive) |
| effective_to | Last day (inclusive); empty means open-ended |
| note | Optional note |

Kinds: Maintenance Escrow Weekly, ELD Fee, Yard Fee, GPS Tracker, Insurance, Truck Payments, Trailer Payments, Toll Pass, Permits, Misc.

## truck_fixed_expense_overrides (v0.0.0.6)

Replaces the version for one truck, one kind, and one week. `week_start` is the Monday. At most one override per truck, kind, and week.

| Column | Meaning |
|--------|---------|
| week_start | Monday the week starts |
| amount_cents | Amount for that week, in integer cents |
| charged_to | `owner` or `management` |

## mgmt_operating_expenses (v0.0.0.6)

Manual management-company costs. Not a profit and loss statement.

| Column | Meaning |
|--------|---------|
| expense_date | Calendar date |
| category | Short label, up to 80 characters |
| amount_cents | Amount in integer cents |
| note | Optional note |

## Database functions (v0.0.0.6)

- `assert_effective_monday` — rejects a date that is not a Monday.
- `create_fee_rate_version` — same as v0.0.0.3, and now calls `assert_effective_monday`. Existing fee rows are not rechecked.
- `create_fixed_expense_version` / `delete_latest_fixed_expense_version` — same close-and-replace pattern as rate versions, per kind. Delete is refused once weekly statements exist for the truck.
- `upsert_fixed_expense_override` / `delete_fixed_expense_override` — one week.
- `create_mgmt_operating_expense` / `delete_mgmt_operating_expense` — manual operating costs.

Each write function checks `allowed_users` and writes `change_log`. `change_log.entity_type` may now also be `truck_fixed_expense`, `truck_fixed_expense_override`, or `mgmt_operating_expense`.

## Access (RLS)

`trucks`, `fee_contracts`, `fee_rules`, `change_log`, `import_settings`, `import_runs`, `vektor_loads_staging`, `loads`, `issues`, `truck_fixed_expenses`, `truck_fixed_expense_overrides`, `mgmt_operating_expenses`, `vektor_fuel_staging`, `vektor_toll_staging`, `fuel_transactions`, and `toll_transactions` have Row Level Security on. Only a signed-in user whose email is in `allowed_users` can read. Fixed-expense and operating-expense writes go through the functions above, which still check `allowed_users`. Rate-version RPCs are security definer and still check `allowed_users`.

`vektor_mcp_connection` and `vektor_oauth_pending` have Row Level Security on and no policies. `anon` and `authenticated` have no table grants. Allowed users touch ciphertext only through security-definer functions. The encryption key stays in server env.

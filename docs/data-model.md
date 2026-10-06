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

Audit trail. Every truck create / activate / deactivate and every rate-version create / delete writes a row: who, when, action, and optional before/after JSON.

| Column | Meaning |
|--------|---------|
| id | Internal id |
| entity_type | `truck` or `fee_contract` |
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

## Access (RLS)

`trucks`, `fee_contracts`, `fee_rules`, and `change_log` have Row Level Security on. Only a signed-in user whose email is in `allowed_users` can read (and write where policies allow). Rate-version RPCs are security definer and still check `allowed_users`.

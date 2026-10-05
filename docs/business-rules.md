# Business rules

## DECIDED

- Reporting week runs Monday to Sunday (taken from the sample report).
- Loads, fuel and tolls come from Vektor.
- Fee rules are per truck, stored in the database with effective dates, never hardcoded. The number of trucks is not fixed; adding a truck must be easy.
- Legacy-owned trucks (currently 2): 10% of each load goes to TOLSON BLACKHAWK LLC (MC authority). Their report goes to Legacy and shows the Tolson payable. Everything else belongs to Legacy. Legacy pays the expenses.
- Third-party trucks: owner is charged a 15% management fee. The report shows only "Management Fee 15%" and never names Tolson. Internally the split is 10% Tolson payable and 5% Legacy income and is recorded in the database.
- Dispatch fee is a per-truck rate (currently 5.5% or 5%) and can change per truck.
- If the database and a Google Sheet disagree on the same data, the database wins and an issue is flagged; nothing is overwritten silently.
- An approved week is locked; later fixes are adjustment entries.

## OPEN

- What amount the dispatch fee is calculated on (full gross or a reduced base).
- What amount the 15% management fee is calculated on (gross or after factoring).
- What an unlabeled $228 line in the sample report represents.
- Quicken version (Windows confirmed; QIF export planned).
- Vektor long-lived access for scheduled server jobs.
- Bestpass API keys (tolls may stay via Vektor).

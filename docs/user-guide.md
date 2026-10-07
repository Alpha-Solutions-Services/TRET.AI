# User guide

Short click-by-click steps for staff. You must be signed in.

## Add a truck

1. Open **Trucks** in the left navigation.
2. Click **Add truck** (or the same button in the empty state if there are no trucks yet).
3. In the side panel, enter:
   - **Unit number** (must be unique)
   - **Name**
   - **Class**: Legacy-owned or Third-party
   - **Owner name** (optional)
4. Click **Save truck**.
5. You should see a success message and the new row in the table.

Trucks are never deleted. Use **Deactivate** / **Activate** on the list or truck page.

## New rate version

1. Open **Trucks**, then click the unit number to open that truck.
2. Click **New rate version**.
3. Choose **Effective from**. It must be a Monday.
4. For each fee row that applies:
   - Required rows for Third-party: Management fee, Tolson payable, Legacy retained (Tolson + Legacy must equal Management, same “calculated on” base).
   - Optional rows can be left off with the checkbox.
   - Enter **Rate %** (0 to 100, up to 2 decimals). Example: `5.5` means 5.5%.
   - Enter **Calculated on % of gross** yourself — there is no default. Helper: `100` = full gross, `95` = 95% of gross.
5. Click **Save rate version**.
6. The previous open version is closed the day before your new from-date. If anything fails, nothing changes.

Old versions are not edited. To undo a mistake on the newest version (only while no weekly statements exist), use **Delete latest version** and confirm.

## Fixed expenses

1. Open **Trucks**, then click the unit number.
2. Open the **Fixed expenses** tab.
3. Click **New expense version**.
4. Choose the kind, a Monday **Effective from**, the weekly amount in dollars, and **Charged to** (Owner is the default).
5. Click **Save expense version**. The previous open version of that kind closes the day before.
6. To change one week only, click **Add week override**, choose the kind and the Monday the week starts, and save.
7. **Week lookup** shows the amount for a Monday. It does not save.
8. **Delete latest version** removes only the newest row for that kind, and only while no weekly statements exist.

Amounts are stored as cents. `20.00` is 2000 cents.

## Operating expenses

1. Open **Operating expenses** in the left navigation.
2. Click **Add expense**.
3. Enter a date, a category, an amount in dollars, and an optional note.
4. Click **Save expense**.
5. Delete asks you to confirm.

These rows are the management company’s own costs. They are not the truck’s weekly fixed expenses. The week’s profit and loss is on Overview.

## Test calculator

On the truck page, enter a gross amount in dollars and a date. The table shows fee lines from the same engine the rest of the app uses. For Third-party trucks, Management fee is shown as the owner-facing line; Tolson payable and Legacy retained are marked as the internal split.

## Connect Vektor

1. Open **Settings**.
2. Click **Connect Vektor**.
3. Sign in on the Vektor page and approve read access. You return to Settings.
4. Status should say **Connected**. Click **Test connection**.
5. When the test passes, choose **Vektor MCP** under Import source and click **Save**.
6. MCP stays unavailable until that test passes. **Disconnect** removes the saved sign-in. Loads already imported stay.

If Connect Vektor reports that the database migration or `VEKTOR_TOKEN_ENCRYPTION_KEY` is missing, finish those steps in the setup guide first, then click Connect Vektor again.

## Import loads from Vektor

1. Make sure trucks exist with unit numbers that match Vektor exactly (for example `02`, not `2`).
2. Connect Vektor and pass Test connection (above).
3. Open **Imports**.
4. Set the date range (defaults to the last 14 days) and click **Import loads**.
5. Wait for the success or error toast. The table shows fetched / promoted / updated / rejected counts and any plain-language error. A zero-row result is stated in that message; a sign-in failure is a Failed run, not a silent zero.
6. Open **Loads** to review promoted rows. Filter by week (Monday–Sunday) and truck. Totals are at the bottom.

## Import fuel and tolls

1. Trucks must use the same unit numbers as Vektor (`02`, not `2`). Import loads for the same week first so a fuel day can be checked against a load.
2. Open **Imports**. Set From and To. For 21–27 Sep 2026 use `2026-09-21` and `2026-09-27`.
3. Click **Import fuel and tolls**. MCP is used when Vektor MCP is the selected source and Test connection has passed.
4. CSV is the fallback. It runs only when Settings has selected CSV and the fuel and toll column mappings are saved. Choose both CSV files, then click **Import fuel and tolls**.
5. Open **Fuel** and **Tolls**. Pick the week starting `2026-09-21`. The summary is per unit. Fuel shows discounted and retail. Tolls show the transaction count and the amount.

Importing the same Vektor transaction again updates that row. It does not add a second one. A truck that does not match stays in staging and opens a Warn issue.

## Weekly statements

1. Open **Statements**.
2. Pick the week. The date snaps to the Monday. For 21–27 Sep 2026 choose `2026-09-21`.
3. The fleet table lists each unit. Click a unit number to see its lines.
4. Legacy-owned units show Tolson payable. Managed units show one management fee. Lines marked internal are the Tolson and Legacy split and are not subtracted again.
5. If Close is blocked, the reasons are listed above the button. Fix those, then come back.
6. **Close week** asks you to confirm. After that the week is locked. The numbers on the page are the snapshot. There is no reopen on this screen.
7. **Download PDF** saves one file for that week. Each unit has its own pages, then a fleet page. Amounts on the PDF are dollars.
8. The button stays off while this week has blockers. Fix the listed reasons first.
9. If the download is refused, the message names what did not match (net, loads, discounted fuel, or tolls). A locked week uses the snapshot. The loads, fuel, and tolls in the file are the current rows, and they must still add up to that snapshot.

A fixed-expense override cannot be saved for a unit and week that is already locked.

## Overview

1. Open **Overview**.
2. Pick the week. The date snaps to the Monday.
3. The table shows each unit and a fleet row: gross, fees, fuel, tolls, fixed expenses charged to the owner, and net.
4. Close status says Open or Locked.
5. **Open issues** shows the count and opens Issues for that week.
6. Management P&L is under the snapshot. Income is Legacy retained on managed trucks and the dispatch fee. Expenses are fixed costs charged to management and operating expenses dated in that week. Tolson payable is listed and is not in the net.

## Issues

1. Open **Issues**.
2. Pick the week, severity, and status. The default is open Warn and Block issues.
3. Import rows come from loads, fuel, and tolls imports whose dates overlap the week.
4. Close checks are listed for that week. They are not stored. They disappear when the check passes. They have no **Mark resolved** button.
5. **Mark resolved** asks you to confirm. It changes only that issue’s status. Imported rows stay, and a locked week stays locked.

Notes:

- Only delivered loads are imported. Deleted or merged-into duplicates are skipped.
- If a truck unit does not match, the row stays in staging and a Warn issue is recorded.
- This version has no automatic schedule and does not write to Google Sheets.

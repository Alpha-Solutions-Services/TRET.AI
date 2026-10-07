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
   - **Google Sheet** (optional). Paste the https link for this truck’s Google Sheet or portal sheet.
4. Click **Save truck**.
5. You should see a success message and the new row in the table.

## Edit a truck

1. Open **Trucks**.
2. On the row, click **Edit**. You can also open the truck and click **Edit** there.
3. Change unit number, name, class, owner name, or the Google Sheet link.
4. Click **Save changes**.
5. The list and the truck page show the Google Sheet as a link. Click it to open the sheet.

Leave **Google Sheet** blank if this truck has no sheet yet. The link must start with `https://`.

Trucks are never deleted. Use **Deactivate** / **Activate** on the list or truck page. Editing a truck does not change its rate versions or fixed expenses.

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

## Legacy expenses

1. Open **Legacy expenses** in the left navigation.
2. Pick the month. The list and the total are that month only.
3. Click **Add expense**.
4. Enter a date, choose a category, enter an amount in dollars, and an optional note. Categories are Vektor Fee, Sintra AI, Quickbooks, Job Post, Accountant Salary, MVR, Drug Test, and Spare Expense 1 through 5.
5. Click **Save expense**. **Edit** changes a saved row. Delete asks you to confirm.

These rows are Legacy Inc Global’s monthly costs. They are not truck sheet outs and they are not the management fee on a load. The week’s profit and loss on Overview still includes operating expenses whose date falls in the selected week.

## Management fee

1. Open **Settings**.
2. Under **Management fee**, enter the default percent. 10 is 10 percent.
3. Click **Save management fee**.
4. Open **Ins and Outs** for a week. **Legacy earnings** lists each load. Save a percent or a dollar amount on one load, or a percent for one truck for that week. **Save these default fees** stores the current default on loads that do not already have a saved fee.

A saved dollar amount does not move when the sheet rate changes. A saved percent is applied to the current sheet rate.

## Test calculator

On the truck page, enter a gross amount in dollars and a date. The table shows fee lines from the same engine the rest of the app uses. For Third-party trucks, Management fee is shown as the owner-facing line; Tolson payable and Legacy retained are marked as the internal split.

## Connect Vektor

1. Open **Settings**.
2. Click **Connect Vektor**.
3. Sign in on the Vektor page and approve read access. You return to Settings.
4. Status should say **Connected**. Click **Test connection**.
5. When the test passes, Vektor MCP can be selected. It is labeled available, currently broken on filters proto. Prefer CSV or Google Sheet Load Ledger until Vektor documents filters.
6. **Disconnect** removes the saved sign-in. Loads already imported stay.

If Connect Vektor reports that the database migration or `VEKTOR_TOKEN_ENCRYPTION_KEY` is missing, finish those steps in the setup guide first, then click Connect Vektor again.

## Choose an import source

Open **Settings** and pick one source, then **Save**.

- **CSV upload.** Working now. On Imports, choose a file. Columns: Delivery Date, Load ID, Rate, and Unit or Truck #. Optional: Pick Up Date, Loaded Miles, Deadhead Miles, Origin, Destination, Driver, Broker/Customer, Manifest ID, Status. A Truck # cell above the header is used when Unit is absent.
- **Google Sheet Load Ledger.** Optional. Promotes each active truck Load Ledger into loads for the dates you choose. Ins and Outs still read the sheet directly and do not require this step.
- **Vektor REST API.** Selectable when `VEKTOR_API_BASE_URL` and `VEKTOR_API_TOKEN` are set. The list path is still open. Set `VEKTOR_API_MANIFESTS_PATH` when Vektor confirms it. This path never calls MCP. It does not import fuel or tolls.
- **Vektor MCP.** Kept for later. Available, currently broken on filters proto. Selectable after Test connection. Prefer CSV or the sheet until Vektor documents filters.

Switching sources does not delete loads.

## Import loads

1. Make sure trucks exist with unit numbers that match the file or Vektor exactly (for example `02`, not `2`). A sheet import uses the unit number stored on the truck.
2. Open **Imports**.
3. Set the date range (defaults to the last 14 days). For CSV, choose the loads file.
4. Click **Import loads**.
5. Wait for the success or error toast. The table shows fetched / promoted / updated / rejected counts. A zero-row result is written in Notes. A sign-in or REST failure is a Failed run, not a silent zero. Delivered loads from a successful list are the ones that land on **Loads**.
6. Open **Loads** to review promoted rows. Filter by week (Monday to Sunday) and truck. Totals are at the bottom.

## Import fuel and tolls

1. Trucks must use the same unit numbers as Vektor (`02`, not `2`). Import loads for the same week first so a fuel day can be checked against a load.
2. Open **Imports**. Set From and To. For 21–27 Sep 2026 use `2026-09-21` and `2026-09-27`.
3. Click **Import fuel and tolls**. Vektor MCP is used when that source is selected and Test connection has passed. REST and Google Sheet Load Ledger do not import fuel or tolls.
4. CSV runs when Settings has selected CSV and the fuel and toll column mappings are saved. Choose both CSV files, then click **Import fuel and tolls**.
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
7. **Ins and Outs** is one row per active truck. Ins are load earnings from that truck’s Google Sheet load ledger (the Rate column, loads whose delivery date is in the week). Outs add the sheet Mgmt Expenses rows dated in the week. Portal monthly Legacy expenses are not added into those outs.
8. If a truck cannot be read, the Loads cell shows a short reason (missing link, missing service account, a bad private key, share, or a missing header). Ins, Outs, and Net stay blank for that row. Click the reason, or **Copy**, to copy the real cause. A blank expense amount is not counted. The dashboard read does not write these sheets.
9. **Open the Ins and Outs page** for the same week with one column per expense. **Sheet mismatches** links to Issues when a sheet Load ID is missing from loads or the rate differs.
10. The footer is one short line under the page: whether the Google service account is set, and the app version. It does not show secrets and it does not cover the page.

## Ins and Outs

1. Open **Ins and Outs** in the left navigation.
2. Pick the week. The date snaps to the Monday.
3. Each active truck is one row. **Ins** are the Google Sheet load ledger Rate for deliveries in that week. **Outs** add the sheet Mgmt Expenses rows dated in that week.
4. The expense columns are Vektor Fee, Sintra AI, Quickbooks, Job Post, Accountant Salary, MVR, Drug Test, and Spare Expense 1 through 5. Portal monthly Legacy expenses are a separate list and are not added into Outs.
5. The **Fleet** row adds the readable sheets. A truck that was not read is left out of that total. The note on the row says why. Click it, or **Copy**, to copy the real cause.
6. **Legacy earnings** is the management fee on each load for that week, per truck and for the fleet.
7. **Download report** saves a Weekly Asset Management Report PDF for that truck and week. It uses the Load Ledger, Weekly Expenses, Fuel Log, and Fleet Directory on the sheet, plus fuel and toll rows in the database when the sheet fuel or toll cells are blank.
8. This page does not change statements or the sheet. Promoting loads is a separate Import step.

## Issues

1. Open **Issues**.
2. Pick the week, severity, and status. The default is open Warn and Block issues.
3. Import rows come from loads, fuel, and tolls imports whose dates overlap the week. Sheet mismatch rows are only the week named in the issue.
4. Close checks are listed for that week. They are not stored. They disappear when the check passes. They have no **Mark resolved** button.
5. **Mark resolved** asks you to confirm. It changes only that issue’s status. Imported rows stay, and a locked week stays locked.
6. The Issue column is a short sentence. Click it, or **Copy**, to copy the full cause. A long Vektor error is not printed in the cell.

## Week of 21–27 Sep 2026

The click path, the fixture files, and the automated smoke are in [WEEK-CLOSE-RUNBOOK.md](WEEK-CLOSE-RUNBOOK.md).

Notes:

- Only delivered loads are imported. Deleted or merged-into duplicates are skipped.
- If a truck unit does not match, the row stays in staging and a Warn issue is recorded.
- This version has no automatic schedule and does not write to Google Sheets.

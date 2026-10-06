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
3. Choose **Effective from** (the first day the new rates apply).
4. For each fee row that applies:
   - Required rows for Third-party: Management fee, Tolson payable, Legacy retained (Tolson + Legacy must equal Management, same “calculated on” base).
   - Optional rows can be left off with the checkbox.
   - Enter **Rate %** (0 to 100, up to 2 decimals). Example: `5.5` means 5.5%.
   - Enter **Calculated on % of gross** yourself — there is no default. Helper: `100` = full gross, `95` = 95% of gross.
5. Click **Save rate version**.
6. The previous open version is closed the day before your new from-date. If anything fails, nothing changes.

Old versions are not edited. To undo a mistake on the newest version (only while no weekly statements exist), use **Delete latest version** and confirm.

## Test calculator

On the truck page, enter a gross amount in dollars and a date. The table shows fee lines from the same engine the rest of the app uses. For Third-party trucks, Management fee is shown as the owner-facing line; Tolson payable and Legacy retained are marked as the internal split.

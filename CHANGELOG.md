# Changelog

## v0.0.0.42 — 2026-10-13

- The week snapshot, Ins and Outs, and Management use one week at a time. `weekReportApplies` runs once per truck. A Week Report is used only when it is labeled for that week, or when its revenue matches that week's ledger. Miles per gallon and report gallons use that same result. The sheet cache key is the spreadsheet plus the week. Week membership is the delivery date.
- Previous week, Next week, and the Ins and Outs week date open `?week=` for that Monday. Management uses the same week links.
- The Load Ledger Tarps column is read only when that header says Tarps: column BC on trucks 2 and 4 to 8, and column BG on truck 3. Confirmed by Legacy Accounting from the 10/28 sheet exports. A blank cell or any other header is not tarped. Tarps are part of driver pay and are never a separate owner deduction. Sheet driver pay already includes them. Driver pay that TRET computes from the rate includes the tarp in that line, labeled with that rate plus tarps when the rate is known, and "Driver pay (incl. tarps)" on a sheet driver line. The percent-fee path has no driver pay line and charges no tarp. A saved tarp rate of 0 is $0. Gross minus expenses stays equal to net.
- Weekly Expenses column H, Total Fees (Legacy+Tolson), is both fees. Column AN is the Legacy share and column AO is the Tolson share when those two add up to H. When both are present and they do not add up, the calculated split is used and the week says so. The lines stay visible. Statements, Ins and Outs, and the asset report use that sheet total. The asset report copies each owner-week category, including a Week Report figure. Week Report factoring is read only from a Factoring Fee label. A missing label leaves the Weekly Expenses factoring in place. A sheet amount with three or more decimal places rounds half up to cents, the same as the sheet ROUND, and stays within MAX_CENTS. A filled cell is never skipped or treated as zero. Truck 8 week 42 factoring is 188.125, shown as $188.13. Tolls follow the load's own week. TBH--1195's $12.00 is week 41. TBH--1201's $50.00 toll is week 42 only. Week 41 truck 8 tolls are $48.61.
- Escrow Balance is the running balance on the card. It is not a weekly expense and it is not in the net. A filled Weekly Expenses cell that cannot be read, or that is over the cap, is not counted as $0. The week shows that warning. A driver-pay line with no rate skips the tarp and the statement page shows that warning.
- TBH--1221 (truck 6) and TBH--1201 (truck 8) can be confirmed at $250.00 from `supabase/data/v42-confirmed-tonus.sql`. That file is not a migration. TBH--1217 stays unconfirmed. Gross is unchanged. Confirmed TONU revenue stays out of gross.
- Migration `supabase/migrations/20261029120000_v42_load_tarps.sql` adds `loads.tarped`, `loads.tarp_cents`, and the `tarp_cents_per_load` setting. It does not update load rows. It is not applied from this branch.
- Connection cards and the dashboard Hub pulse a status dot only while that check is connected or busy. A missing check stays still. Cards and the New, Duplicate, and Flagged counters take one accent border on hover and scale slightly on press.
- The import diagram draws Vektor, Fuel, and Tolls into TRET and on to Google Sheets. One accent mark travels those lines. The import steps move that mark only while a job is running. The counters show the current number at once and move only after the number changes.
- Checking AI status, loading imports, and a running import or AI check use a skeleton shaped like that content. The bar-wave loader is gone.
- No migration. MPG and the report rules are unchanged.

## v0.0.0.41 — 2026-10-13

- The asset report fuel economy uses that same `weekMpg`. Miles are the truck miles already counted once. Gallons are the fuel-log gallons, or the import diesel gallons when the sheet fuel cell is blank. An open trip shows the sheet MPG, or n/a when that cell is blank. The asset-report fixtures that used fuel-log odometer miles now show 15.00, 28.17, and 11.09.
- Statement fees are computed once. A stored contract is that source, and an active fixed weekly amount replaces the Tolson or Legacy line on that contract. With no stored contract, the truck's two basis-point lines, or the seeded pair, are the source. The owner week reads those fee lines. It does not split the gross a second time. Owner net is checked by adding the owner-charged lines. MPG is `weekMpg` only: an open trip is a boolean, and miles are counted once per trip. RPM and MPG labels use the shared formatters. The week of 2026-09-21 and week 41 fixtures keep the same net, fee, and MPG.
- One MPG function for the dashboard, the owner PDF, and the statement. It uses diesel gallons only. DEF stays in the fuel cost and on the fuel summary, and it is not in the MPG denominator. A shared trip counts once, and only after every load on it has a delivery date on or before that week's Sunday. Today's date is not used. An open trip shows Week Report C31, or stays blank. Week 41: Truck 3 is 7.35, Truck 4 is 8.44, Truck 5 is 10.90, Truck 6 is blank, Truck 7 is 7.42, Truck 8 is 9.82, and the fleet is 8.81.
- A held TONU can take a rate confirmation upload. The file is read, with a photo sent through the Gemini gateway. A written TONU fee replaces the "TONU rate unconfirmed" flag and the placeholder amount. The week's gross is unchanged.
- A fuel receipt photo can be attached on a load, and an expense receipt photo on an operating expense. The photo is shown on that row. A photo is read through the same Gemini gateway.
- Trucks 1, 2, 9, and 10 with no sheet URL show Needs sheet link on the truck list and the truck page. The Google Sheet field is the place to paste the link.
- Migration `supabase/migrations/20261013180000_v41_truck_documents.sql` adds `truck_documents` with row level security. It is not applied from this branch.

## v0.0.0.40 — 2026-10-12

- Owner PDF and statement MPG follow the trip. While the trip is open, Week Report C31 is shown, and a blank cell stays blank. Truck 6 week 41 is blank. Truck 7 is 7.42. A delivered trip is truck miles divided by diesel gallons. Truck 8 is 9.39, from 2,650 miles and 282.21 gallons. Fleet MPG is every truck's miles divided by every truck's diesel gallons, 7.08 from 11,596.95 miles and 1,637.86 gallons, including Truck 6.
- The shared-trip footnote shows only when that truck's table has a shared trip. Truck 3 and Truck 4 do not get it. Truck 7 still does.
- No migration. TONU rate-con reading and receipt photo reading are still not wired. Trucks 1, 2, 9, and 10 still need sheet links.

## v0.0.0.39 — 2026-10-12

- Superseded 10/29. A held or pending TONU keeps its deadhead miles and toll for the week it is counted, the week after delivery. TBH--1201 stays out of week 41. Truck 8 week 41 matches the v0.0.0.38 PDF: tolls $36.61, deadhead 241, truck miles 2,650, expenses $6,298.84, net $1,601.16. The fleet follows: tolls $715.21, deadhead 888.60, truck miles 11,596.95, expenses $33,916.14, net -$1,066.14. The 10 deadhead miles and $12.00 toll count in week 42. The TONU rate stays out of gross. The dashboard, Ins and Outs, statements, and PDFs use the same figures.
- Owner PDF MPG uses the same function as the dashboard. Truck 7 is 7.42, Truck 8 is 7.04, and Truck 6 stays blank because its trip is open. Fleet MPG is truck miles divided by diesel gallons from trucks whose trip has delivered.
- A per-truck report titles the last page "Truck N totals" and says "Truck N earned". "Fleet totals" and "the fleet earned" stay on the fleet statement.
- The shared-trip footnote shows whenever any load row is on a shared trip, including Truck 7.
- The owner PDF embeds one smaller truck photo, so a Monday file is no longer about 20 MB.
- No migration. TONU rate-con reading and receipt photo reading are still not wired. Trucks 1, 2, 9, and 10 still need sheet links.

## v0.0.0.38 — 2026-10-12

- Owner PDFs use Week Report C31 for MPG, the same figure as the dashboard. Truck 6 stays blank because that cell is empty and the trip is open. Diesel gallons come from Week Report C28 when that cell is a gallon figure, otherwise from the Fuel Log. DEF gallons are listed when the sheet or the log splits them.
- Owner keeps shows the net, including a negative net such as -$2,649.09.
- The mile rates are labeled Rate per truck mile and Fuel cost per truck mile. The amounts were already per total truck mile.
- A shared trip lists each load's Ledger column M miles. The loaded miles total still counts the trip once. The table notes that.
- Prepare Monday reports downloads one owner report per truck, combined in one PDF. Download PDF stays the fleet statement.
- A fuel or toll row-count warning is skipped when the later run's date range is narrower than the previous run. A drop across the same full week still warns and still does not block Close week or the PDF.
- No migration. TONU rate-con reading and receipt photo reading are still not wired. Trucks 1, 2, 9, and 10 still need sheet links.

## v0.0.0.37 — 2026-10-12

- Download PDF, Prepare report, and Prepare Monday reports use the statement already on the page. A mismatch with imported loads, fuel, tolls, or fixed lines is logged and the PDF is still returned. A blocker, a missing truck, or a failed read still returns an error, and that error shows in a toast.
- Misc stays its own line on the statement and on the PDF. Fixed is the sheet fixed amount. Unit 3 week 41 fixed is $670.41 and misc is $974.88. Truck 4 fixed is $677.26 and misc is $2,275.02. Net still deducts both.
- The Loads card on the Dashboard no longer prints the app version. The version stays in the footer.
- TONU TBH--1201 on Loads shows the sheet placeholder, $2000.00, marked unconfirmed. A smaller rate cell does not replace it. The amount stays out of this week's gross and the delivered total.
- Statements and Management show a loading skeleton in the main area as soon as the page opens.
- No migration. TONU rate-con reading and receipt photo reading are still not wired. Trucks 1, 2, 9, and 10 still need sheet links.

## v0.0.0.36 — 2026-10-12

- Download PDF, Prepare report, and Prepare Monday reports return the file when the week only has warnings. A real blocker still refuses the file. The PDF uses the sheet week loads, and fuel and toll lines that add up to the statement, so an import that does not match the sheet does not return HTTP 409.
- TONU TBH--1201 is read from the Load Ledger even when that row sits above the header or the TONU word is not in the Status column. It stays Pending as "TONU rate unconfirmed" and is not in this week's gross.
- The Loads page renders that same sheet week list. Pending and TONU keep their own status. A database delivery date does not replace the sheet row.
- MPG uses Week Report C31 whenever that cell has a value. It is blank only when the sheet shows 0 or is empty. A trip that continues next week does not clear a filled cell. Truck 7 week 41 stays 7.42.
- Management and Statements show a loading state, retry a failed read, and show an error with Try again. A failed render does not leave the main area empty.
- The page content has bottom padding equal to the footer height, so the footer does not cover the Dashboard tiles.
- No migration. TONU rate-con reading and receipt photo reading are still not wired. Trucks 1, 2, 9, and 10 still need sheet links.

## v0.0.0.35 — 2026-10-12

- Fee lines are the truck's basis points times weekly gross. Truck 4 is Legacy $250 and Tolson $200, total $450. Truck 5 is $720 and $576. Truck 6 is $200 and $160. Truck 7 is $470 and $376. Truck 8, after the TONU hold-out, is Legacy 10 percent and Tolson 8 percent of $7,900. Truck 3 stays Legacy $855 and Tolson $0. Trucks 1 and 2 stay Tolson 10 percent and Legacy $0. Expenses and net use that total. When the sheet Management Fee cell is different, the page shows "sheet fee differs". Management income is the sum of Legacy fees. Tolson payable is the sum of Tolson fees.
- TONU TBH--1201 is held to the next week and listed as Pending, "TONU rate unconfirmed", on the Dashboard, Ins and Outs, and Statements. It is not in this week's loads or gross.
- The Loads page uses that same week list and adds a Status column: Delivered, Pending, or TONU.
- Deadhead is allocated deadhead from Ledger AV, or Week Report C18. Truck 6 is 29.87, Truck 7 is 27.34, Truck 5 is 288.39, and the fleet is 898.60.
- MPG stays blank when a counted load shares a trip that delivers next week. Fleet MPG uses trucks with a delivered trip only. Fleet RPM is total gross divided by total truck miles.
- A row-count drop is a warning. It is compared only to a full Monday–Sunday import of the same kind. A short daily file does not block Close week or Download PDF.
- Statements add the class Tolson owned. Unit 3 shows that class. Units sort 1, 2, …, 10. Misc is its own owner line. Fixed is the fixed amount.
- Ins and Outs money uses thousands separators. The fee columns are Legacy fee, Tolson lease fee, and Management fee total. The extra Management fee column is gone.
- The signed-in header is no longer sticky, so it does not sit mid-page, and the footer stays below the page content. A rate limit on the Gemini status ping shows OK on the Hub. Open issues from an older import run, and older copies of the same rule, are marked resolved.
- Migrations `supabase/migrations/20261012000000_v35_tolson_owned_enum.sql` and `supabase/migrations/20261012000100_v35_tolson_owned_unit.sql` are included and not applied from this branch. TONU rate-con reading and receipt photo reading are still not wired. Trucks 1, 2, 9, and 10 still need sheet links.

## v0.0.0.34 — 2026-10-11

- Every truck has two fee lines, both a percent of that truck's weekly gross: Legacy fee and Tolson lease fee. The management fee total is those two lines. Trucks 1 and 2 are Legacy 0 percent and Tolson lease 10 percent. Truck 3 is Legacy 10 percent and Tolson lease 0 percent. Trucks 4 to 8, and a new truck, are Legacy 10 percent and Tolson lease 8 percent (18 percent total).
- The dollar amount is the sheet Management Fee cell (Load Ledger W, Weekly Expenses H, Week Report C25). The two lines split that cell and add up to it. Dispatch, factoring, and driver pay are the matching sheet cells (C22, C23, C24). They are not a second fee calculated beside the sheet.
- Truck Edit, Fee settings, and the CSV template use `legacy_fee_pct`, `tolson_lease_fee_pct`, and `effective_from`. Statements, the Dashboard snapshot, and Ins and Outs show both lines and the total. Management income is the sum of Legacy fees. Tolson payable is the sum of Tolson lease fees and is not subtracted from that income. The owner PDF shows the management fee total, with the two lines under it.
- Week 41 fixture matches the operator checklist. Truck 3 misc is $974.88 (tarp $309.94 restored, 7-Eleven $15.02 removed), expenses $7,036.60, net $1,513.40. Truck 6 revenue is $2,000 and miles are 698.80. Truck 8 revenue is $9,900, including the $2,000 TONU placeholder. The week has 20 loads. A TONU in the delivery week is counted and flagged TONU amount unconfirmed. Week 42 loads stay out. Trucks 4 to 8 use the 18 percent management total.
- Migration `supabase/migrations/20261011230000_v34_fee_lines.sql` adds the three columns and seeds units 1 to 10 effective 2026-10-05. It is not applied from this branch. TONU rate-con reading and receipt photo reading are still not wired. The unconfirmed Truck 4 misc of $290.46 is not included.

## v0.0.0.33 — 2026-10-11

- Dashboard, Ins and Outs, Statements, and the owner PDF use one calculation from the truck sheet: Load Ledger, Weekly Expenses, and Week Report. Import totals do not replace a sheet fuel, toll, or mile cell that already has a value.
- Misc is the sum of Load Ledger columns AM through AQ. Truck miles are column P (loaded plus deadhead), counted once per trip. RPM is revenue divided by those miles. MPG is the Week Report C31 cell.
- A load that delivers next week is listed as Pending. A TONU in that set is flagged TONU rate unconfirmed and is not counted in this week. The Loads page uses the same delivery-week sheet count.
- Trucks 1 through 10 stay on the week report. Trucks 1, 2, 9, and 10 show zeros until a Google Sheet link is saved. Migration `supabase/migrations/20261011210000_v33_fleet_trucks.sql` inserts those four trucks when they are missing. It is not applied from this branch.
- A row-count drop can be acknowledged with a reason. The comparison is the same import type only. Statements Close and the PDF stay blocked until that acknowledgement, or until the drop is gone.
- Sheet reads are cached for about 8 minutes, one batch per spreadsheet, trucks one after another. A Google 429 shows the last good read instead of an empty page.
- Fuel Log headers are found by name in the first rows. A toll row whose Toll Expense cell already has a value is a duplicate, not a flag. Hub Fuel and Tolls say Last file after a successful file import. A busy model waits longer, then the rules decide, without marking every row AI busy.
- Daily check compares each truck's sheet loads, fuel, and tolls to the imported rows.
- TONU rate-con reading and receipt photo reading are still not wired.

## v0.0.0.32 — 2026-10-11

- A load counts only in the week it is delivered. TBH--1170 delivered 10/04 is week 40. A delivery on 10/12 is week 42. In-transit loads stay Pending and are not counted. A pickup from the prior week is included when delivery is in the week. Sharing a trip no longer pulls another load in.
- Owner RPM is rate divided by loaded plus deadhead, with shared trip miles counted once. Per-load RPM shares add up to the trip RPM. MPG uses main trip miles and stays blank until the trip delivers. Fleet RPM and MPG are built from those per-truck figures.
- Dashboard, Ins and Outs, and Statements use the delivery week. Misc receipts (tarp, Ford, Uber, repairs) are in outs and in the statement as a Misc line. Statements also pick up sheet loads that are missing from the database, including Truck 4 when that sheet has the loads.
- A chosen fuel or toll file is read by the same planner as the preview. 7-Eleven FUEL is diesel. Card fees are left out. ULSD and DEF stay separate rows. Loads row-count checks compare the last loads run only.
- Truck setup is one table of fuel cards, plates, and Bestpass tags. Card 00011 is Truck 2. Tags UD12588 and YHM2482 match Truck 3 and Truck 7.
- A fuel fill on a handoff day goes to the new load. An unclear pair stays unlinked. A toll on empty miles goes to the next load, on the primary row when the trip is shared. Credits are allowed. An existing sheet toll is not overwritten unless the owner confirms. A busy model retries, then the rules decide. Rows are not all flagged.
- TONU rate-con reading is a tested helper: a written TONU amount sets loaded miles to 0, and a full freight rate only is flagged TONU rate unconfirmed and held to the next Monday. It is not applied during import yet, because the rate con is not fetched from Vektor documents.
- Receipt text can suggest a misc entry and skip a BOL that was labeled Receipt. Photo reading through Gemini is not wired yet. Daily check lists stored loads, fuel, tolls, open unlinked fills, and truck mismatches for the week, with one Approve. Changed loads and duplicate skips are not a file-to-file diff yet. Reread sheets, Google 429 retry, a Vektor and Bestpass warning, and Close week sit apart from the other buttons with a confirm step.
- An active truck with no loads, fuel, tolls, or fixed expenses still appears on the statement at zero, so Truck 4 is not dropped. Toll credits (negative amounts) stay on the statement.
- The Hub and the Integrations connection list no longer clip labels or scroll inside the card. The waveform has a visible label and plays only while work is running. Looping glow and rainbow motion are removed from the dashboard cards and the import diagrams.
- Migration `supabase/migrations/20261011190000_v32_toll_tags.sql` is included and not applied from this branch. It adds Bestpass tags UD12588 and YHM2482, inserts card 00011 when Truck 2 exists, and drops the toll amount checks that rejected credits.

## v0.0.0.31 — 2026-10-09

- The Dashboard is rebuilt with React Vibe pieces (MIT, framer-motion). KPI cards count up and use a glow border: Ins, Outs, Net, Loads, Loaded miles, Deadhead, RPM, MPG, and Open issues. The Ins and Outs bars are full width. The eight week trend draws on. The expense donut keeps the category colors, percents, and thousands separators. Each truck is a card with unit, loads, miles, RPM, MPG, net, and a status dot. Hub flow shows Vektor, Sheets, Fuel, Tolls, and Gemini into TRET.
- Lease trucks (Legacy owned) default to a 10 percent lease fee to Tolson when no contract is stored. Owner trucks default to a 10 percent management fee. The Legacy and Tolson split stays Not set until both percents are entered and they add up to the fee. The old 10 percent Tolson plus 15 percent management fallback is gone. Fee settings lists every truck, and the CSV template is `public/templates/fee-settings-template.csv`.
- Each truck page edits fixed weekly expenses inline from the report Monday. Save stores the amount in TRET and queues the Weekly Expenses cell. Approve writes the previewed cells. Legacy expenses can record payments to Tolson Black Hawk and show owed, paid, and balance for the week.
- Week pickers open on the last finished Monday to Sunday. The label reads Report for week N, deliver Monday and the date. Prepare report downloads one truck. Prepare Monday reports downloads every truck for that week.
- The weekly statement PDF adds a landscape cover with the truck photo, a plain sentence for the truck and the fleet, and charts for where the money went, money in versus money out versus what the owner keeps, revenue per load, loaded miles versus deadhead, miles per gallon, and rate per mile. The chart dollars are the statement dollars.
- Migration `supabase/migrations/20261009180000_v31_fee_sheets_tolson.sql` is included and not applied from this branch. It adds fee columns, `sheet_write_queue`, and `tolson_payments`, each new table with Row Level Security.
- Week buttons use bright blue and purple fills. Red, yellow, and green stay on status dots. Loaded miles on the Dashboard are whole miles (4,877). The stored hundredths and the Ins and Outs rules are unchanged. Fleet MPG uses the same diesel function on the summed miles and the summed gallons. Fuel and Tolls say In TRET only when those tables have rows.
- Motion waits until after the first paint, and it stops when the browser asks for less motion. The hub and the charts load as their own chunks. Every theme stays, and Vibe Black stays the default.

## v0.0.0.30 — 2026-10-09

- A chosen loads CSV is the only source for that import. The Vektor list filter is JSON-encoded twice so a gateway that unwraps strings still sends a string, and a failed list says to choose a loads CSV. A chosen fuel or toll file is used on its own. A missing Vektor fuel or toll tool is a note, and the import continues.
- The default range is the Monday to Sunday week. Delivered, in transit, dispatched, and en route loads import. Booked and deleted stay out. A load picked up before the week stays in when it delivers in the week or shares a trip with a load that is in the week. Loads uses that same week rule.
- Fuel Total Cost is found by the header name. A known unit is enough when a tag or card is new. A toll stays on the load whose pickup through delivery contains the exit time. Overlapping loads on one trip use the primary load. Gemini reviews a file in one call. A busy model leaves the rule result and shows AI busy, try again on the queue.
- Dashboard outs include the Misc column and extra receipt rows in the week, such as a tarp, 7-Eleven, or Love's receipt. Each truck row shows loaded miles, deadhead, rate per mile, and diesel MPG.
- Statements use the truck's Tolson percent, or a 10 percent Tolson and 15 percent management default, when no fee contract covers the week. A truck that still has no fee setup links to that truck. Close week and Download PDF stay bright. Dashboard cards and the expense mix use a categorical palette, with the legend sorted by amount and money shown with thousands separators. Red, yellow, and green stay for status.
- Sheet vs Vektor matches TBH--1192 to TBH1192 and shows Status differs when the sheet and Vektor disagree. It says Not in Vektor only when the load is actually missing. Dates on Imports and truck Edit use a fixed UTC stamp. The site icon is the green T mark.

## v0.0.0.29 — 2026-10-08

- Fuel and Tolls can upload a fuel card CSV or an E-ZPass XLSX. The file type comes from the headers. The preview shows truck, week, linked load or trip, target sheet and cells, and New, Duplicate, or Flagged. Approve and write to sheets sends only the input cells through the Google service account, in one batch. Flagged rows wait in a review queue. The owner can pick a truck or load there and approve.
- Fuel writes Date, Location, Load ID or Trip Group ID, Gallons, and Total Cost on `Truck #0N Fuel Log`. Formula columns are not written. ULSD and ULSR are fuel. DEFD is its own row. Fees are not added to Total Cost. A fill with no covering load is written with those ids blank and stays in the queue. Tolls add Amount to Load Ledger Toll Expense for the load that was active at the exit time. Post Date is not used. A Toll Expense cell that TRET did not write is left unchanged until the owner approves it.
- Card, plate, and tag maps are editable on the truck Edit page. The built-in list is Truck 3 card 00003 and plate UD12588 VA, Truck 8 card 00060 and plate 5OSB8626 TX, and the other Legacy plates and cards. An unknown unit, a card for another truck, a negative amount, or a tag that is not on file is flagged and not entered.
- Optional `GEMINI_API_KEY` calls `gemini-flash-latest` through `llm-gateway` only to map an unknown header row or to suggest a truck or load for a flagged row. `GEMINI_MODEL` can override the model. The key is sent as `X-goog-api-key` and is never put in the URL. A missing or rejected key stays on the rules, with no error. A 503 is retried twice. If the model is still busy, the review queue says AI busy, try again, and the rules still decide the rows. Suggestions are never written on their own.
- Vektor loads (CSV and API), fuel card files, and toll files share one pipeline: parse, match by rules, then Gemini for an unknown layout or an unmatched row. Suggestions stay in the review queue. TRET then totals fuel gallons and cost, DEF, tolls per load, loaded miles, dispatch miles, and MPG for each truck, load or trip, and week. Fuel Log rows, Load Ledger Toll Expense, and the existing Vektor sheet fields are written only after approval. The dashboard fuel and toll lines, the weekly report fuel and toll lines, and those sheet cells use that same total. Integrations shows a read-only AI status of OK, Busy, or Not set. The key is not shown.
- Migration `supabase/migrations/20261008180000_v29_fuel_toll_file.sql` is not applied. It adds the mapping tables, the fuel and toll import log, and the review queue, all with Row Level Security.
- Imports shows a Data Flow of Vektor, Fuel, and Tolls into TRET and then Google Sheets, with New, Duplicate, and Flagged from the current preview, and a Pipeline of Parse, Match, Review, and Sheets. Fuel and Tolls use the same flow for a file preview. Integrations shows Origin with TRET in the center and Vektor, Google Sheets, QuickBooks files, and Gemini AI around it. A connection glows only when that check is connected. Gemini shows OK, Busy, or Not set. Waveform plays while an import or the AI check is working. The dashboard header shows how many truck sheets were readable. It shows 0 when none were. These pieces are copied from React Vibe (MIT) and run on `framer-motion`. `react-icons` is not installed.
- Vibe is the new default theme: dark slate, soft off-white text, muted cards, one calm accent. Vibe Light is the light companion. The other ten themes stay in the list.
- Vibe Black is the default. The page is black, cards are near black, text is white, and borders are thin. Green, yellow, and red dots and buttons follow real status. Vibe, Vibe Light, and the earlier ten themes stay in the list. Imports no longer says that nothing is written to Google Sheets. Fuel and toll files write after approval. A Vektor sheet cell writes only after that cell is approved.

## v0.0.0.28 — 2026-10-07

- The weekly report joins a sheet load to its Vektor manifest on letters and digits. A blank delivery date still matches. The Oct 5 export marks TBH--1188 and TBH--1195 In Transit with no delivery date, so a week filter left them off the manifest and the report counted every mile. Truck #08 Load Ledger marks trip M-1195 with Primary Yes on TBH--1188 only. TBH--1192 and TBH--1195 are partial. Loaded miles are 2,075.00 and dispatch miles are 2,316.00. The sheet Primary flag and trip group win. The Vektor manifest is the fallback. Revenue still sums every load.
- Migration `supabase/migrations/20261007230000_v28_backfill_manifest_refs.sql` is not applied. It fills a blank `source_manifest_ref` from that export. It does not change a manifest that is already set, and it does not insert rows.
- Page 2 table fills stop on the template borders. The light blue no longer hangs left of the Weekly Totals block or below either table. The template notes bar that stuck into the gap under Weekly Totals is covered.
- The weekly expense line is Maintenance Escrow Weekly on the report and on Ins and Outs. The escrow card stays Escrow Balance, or Escrow Balance (this week) when the sheet has no running balance.

## v0.0.0.27 — 2026-10-07

- The Weekly Asset Management Report uses the Legacy template's landscape pages (960 by 540). Page 1 is the executive cover, with the navy header, the reporting-period box, and the truck artwork. The load ledger, owner earnings, and executive summary follow on the next pages in the template's order. MC Lease stays off. The PDF does not print "Not stored". A missing dispatcher still prints Legacy Dispatch Team. The operations note prints only when there is a note.
- Weekly Escrow is now Escrow Balance. TRET does not store a running escrow balance, so the report card and the Ins and Outs column say Escrow Balance (this week) and show this week's escrow. A sheet column named Escrow Balance, when present, fills the card with that running balance.
- Loads that share a Vektor manifest are grouped on the weekly report, on Loads, and on Sheet vs Vektor. Loaded miles count once, from the load with the most loaded miles. The other loads show as partial and do not add to loaded miles or to rate per mile. Revenue still adds every load. When the sheet has no manifest column, the Vektor manifest is used.
- The report header box shows only this week's dates. The load table prints TOTALS under the last load, with no blank row. Owner expenses and the executive expense list leave out the empty MC Lease row.

## v0.0.0.26 — 2026-10-07

- Vektor orders CSV import accepts Order ID, Gross, Truck Reference ID, Drivers, Loaded Miles, Empty Miles, Origin Datetime, Order Date Delivered (or Destination Datetime), and Broker Name. Truck `03` matches truck `3`. City and state come from a full street address. `N/A` and a lone hyphen are empty. Only Delivered rows import. Booked, En Route, and In Transit stay in the preview with a reason. Manifest ID is not the load key. Settings can save that column mapping once.
- A CSV import records an import run with source `csv`. That run does not set the row drop baseline for the next Vektor connection import.
- Re-importing a load that was typed in by hand updates that row. It does not insert a second one. Load ids are stored and shown as `TBH--1192`. A sheet id `TBH1192` is converted for storage and display and still matches on letters and digits. Google Sheets cells are not rewritten to that form.
- Sheet vs Vektor treats a short driver name and the full legal name as the same person, and blank deadhead as zero. A shared manifest date is labeled and is not a hard mismatch. An admin can Use sheet, Use Vektor, or Write to sheet for one cell when the Google account can edit. Each choice needs a short note and is kept on the row. Use sheet and Write to sheet close the matching issue.
- Five more themes: Mono Minimal, Mint Breeze, Rose Quartz, Aurora Night, and Carbon Electric. Each option shows a swatch.
- QuickBooks API screens stay in the code and stay hidden unless `QUICKBOOKS_API_ENABLED` is exactly `true`. Integrations uses a CSV export of the weekly fee income and Tolson payable, and a CSV import of a QuickBooks Transaction List or Expenses report. Account names and vendor maps are saved once. Rows save only after confirm, and a repeated row hash is skipped.
- Migration `20261007220000_v26_load_ids_compare_qbo_file.sql` is not applied until the owner says go. It renames load ids only when that would not collide with a row that already uses the same match key.
- Sheet vs Vektor keeps load ids and dates on one line. The Check column is a short label. The note and the resolve buttons sit on a full width row under the mismatch, and the table scrolls sideways instead of squeezing columns.
- The footer names a missing Google sheet account in plain words. When that account is set, the footer shows only the version.

## v0.0.0.25 — 2026-10-07

- QuickBooks Online for the Legacy Inc books only. Admins (role owner or admin) connect one company from Integrations. Env names: `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET`, `INTUIT_REDIRECT_URI`, `INTUIT_ENVIRONMENT` (`sandbox` or `production`), and `QUICKBOOKS_TOKEN_ENCRYPTION_KEY`. Tokens are encrypted with the same AES helper as Vektor, using the QuickBooks key. Access tokens refresh on their own. If those env names are missing, Integrations says QuickBooks not set up yet.
- Import pulls Purchase and Bill rows for a date range, maps a vendor or an account to a portal expense category, shows a preview, and writes portal expenses only after confirm. The QuickBooks id blocks a second import of the same line. Credits are shown and not saved.
- Post previews one week, then sends one journal entry for management fee income and Tolson payable, using four accounts an admin saves. Nothing posts on its own. Each post is logged with the QuickBooks id.
- Migration `20261007210000_quickbooks.sql` is not applied until the owner says go.
- Glass Light is softer and calmer: lower saturation, more space, lighter glass, spring motion that turns off when the system asks for less motion, and tabular figures. The other four themes keep their own colors and use the same radius, shadow, type, and motion.

## v0.0.0.24 — 2026-10-07

- Weekly Asset Management Report stays two Letter pages. Navy and gold header, footer, and KPI cards follow the Legacy template. Page 1 is the identity block, KPI strip, executive summary, load activity, weekly totals, and daily performance. Page 2 is owner earnings, the gross and net cards, asset status, fuel, and compliance. Notes print only when the week has a note. Section headings have space above the cards and tables before them.
- MC Lease is removed from that PDF. Truck Pymts and Trailer Pymts are not owner-expense lines and are not folded into another line. Total truck expenses and net owner earnings are recalculated without them. The MC Lease note is gone. Dashboard Outs still include those payment lines.
- Trailer, VIN, and dispatcher are read from Fleet Directory, Weekly Expenses, and the Load Ledger when those columns or label pairs exist. `trucks` has no trailer or VIN column. A missing dispatcher prints Legacy Dispatch Team and does not add a note.
- The Driver line uses the truck name or owner name when that name continues the first name on the sheet. Truck 8 prints Brison Hunter.
- On-time, loads accepted, loads delivered, claims, cargo damage, service failures, and cancellation use sheet columns when they exist. Otherwise a completed week uses the load count, 100% on time when no late flag is stored, and zero for claims, damage, failures, and cancellation. An Active truck with no status columns prints Ready, Good, Positive, Good, and Current. The PDF does not print "Not stored".
- Management fee, driver compensation, and factoring labels stay on the program rates (10%, 20%, and 1.75%) unless the sheet has a percent column. The blank template's 15% and 2.65% are not used.
- Tolson payable is set per truck on Edit truck: percent of gross, or a fixed weekly amount. Both stay empty until someone sets them. An empty truck counts as $0. Management sums those amounts for the week and lists Tolson payable as its own expense. Net is income minus portal expenses minus Tolson payable. Legacy kept is income minus Tolson payable. Saving the setting needs migration `20261007200000_truck_tolson_payable.sql`. Until it is applied, other truck fields still save.
- The Dashboard week snapshot uses the same sheet Ins and Outs as the cards. Gross is Ins. Fees, fuel, tolls, and fixed split the Outs. Net is Ins minus Outs. The fleet row is no longer $0.00 when the sheet has money and the statement is empty.

## v0.0.0.23 — 2026-10-07

- Management cards and the Dashboard management P&L were reading the statement. Week 2026-10-05 has sheet loads and portal fees, and the statement for that week is empty, so Income, Expenses, Net, and Tolson payable stayed at $0.00 while the fee chart showed the loads. Income is now the summed management fee on this week's sheet loads. An own truck sends that whole fee to Tolson Blackhawk LLC. A third-party truck splits the fee ten fifteenths to Tolson and five fifteenths to Legacy. Net is income minus portal expenses. Tolson payable sits beside net.
- Expenses on those cards are the portal costs dated in the expense month of the week's Monday. The whole month is shown, because those costs are entered by month. The same words are on the card and under the P&L table.
- Portal expenses can be added, edited, and deleted on Management for that month. Every category saves, including Spare Expense 1 through 5. The month total and the charts use those rows.
- Dashboard Outs and the expense donut read the Weekly Expenses row for the week, the same columns the asset report sums (driver compensation, management fee, dispatch, factoring, fuel, insurance, escrow, ELD, yard, GPS, tolls, and the other weekly lines). Moved to Management is left out. If that tab has no header, Outs fall back to the Mgmt Expenses rows.
- Sheet vs Vektor is a new page. Sheet load records are on top and Vektor load records are below, lined up by load number for the chosen week and truck. A highlight means missing on one side, or the rate, delivery date, or miles differ. Rate and missing-from-Vektor checks reuse the existing mismatch rules.
- Five themes: Glass Light, Midnight Navy and Gold, Graphite Dark, Ocean Blue, and Warm Sand. The choice is stored in this browser. Charts, cards, tables, and the footer use the theme colors.
- No new migration.

## v0.0.0.21 — 2026-10-07

- Dashboard (home) shows fleet sheet Ins and Outs, a load count, open issues, the sheet account check, and the version. Charts: bars by truck, an eight week area from the sheets already read, and a donut of this week's sheet expense categories.
- Management is a second page. It shows Legacy earnings by truck (editable per load), monthly portal expenses as an area and a donut, and the management profit and loss. Truck sheet outs stay on the Dashboard.
- Chart colors and card surfaces use the same accent tokens. Press and reduced-motion behavior is unchanged.

## v0.0.0.20 — 2026-10-07

- Legacy earnings are a management fee on each truck load. The org default is 10 percent (1000 basis points), editable in Settings. A truck can use a different percent for one Monday week. A load can save a percent or a dollar amount. A saved amount stays put when the sheet rate changes. A saved percent is applied to the current sheet rate. Legacy earnings are the sum of those fees, per truck and for the fleet. Saving needs migration `20261007180000_legacy_management_fees.sql`. Until it is applied, the page still shows the 10 percent default and does not store edits.
- Legacy expenses (the operating expenses page) lists one month at a time, with a total. Categories are the sheet list: Vektor Fee, Sintra AI, Quickbooks, Job Post, Accountant Salary, MVR, Drug Test, and Spare Expense 1 through 5. Staff can add, edit, and delete. The date's month is the month the row belongs to. These portal rows are not added into truck sheet outs.
- The signed-in footer is one short line in normal page flow: a sheet account check and `TRET.AI v0.0.0.20`. It is not fixed to the screen.
- Issues show a short plain headline. A Vektor proto or JSON dump stays on Copy. An empty close week says "This week has nothing to close yet."

## v0.0.0.19 — 2026-10-07

- The production build failed because the footer is a client component and it imported `src/lib/version.ts`. That module reads the VERSION file with `node:fs` and `node:path`. Webpack does not bundle those in the browser.
- The footer now imports `APP_VERSION` and `formatFooterLabel` from `src/lib/app-version.ts`. That file has no Node imports. The label is still `TRET.AI v0.0.0.19`.
- `package.json` stays `0.0.0`. npm cannot store a 4-part version. The VERSION file remains the source of truth. Server pages still read it through `readAppVersion`.

## v0.0.0.18 — 2026-10-07

- Google Sheets sign-in normalizes the service account private key before OpenSSL reads it. A one-line PEM with literal `\n`, a quoted PEM, PKCS#8 (`BEGIN PRIVATE KEY`), and PKCS#1 (`BEGIN RSA PRIVATE KEY`) all work. When `GOOGLE_SERVICE_ACCOUNT_JSON` is set, that full JSON is used for the email and private key. The email and private key pair still works when JSON is unset.
- A key OpenSSL cannot read shows "Google private key on the server is the wrong format". The real cause stays available. Click the error, or Copy, to put that cause on the clipboard.
- The signed-in footer is a tray: short instructions for the current page, a non-secret sheet account check (JSON, email, and private key set or not, and whether the key format is ok), and `TRET.AI v…`. Overview and Ins and Outs put the latest sheet note in that tray.
- Load ledger tabs match unit 3 to `Truck #03` and to `unit 3`. Shell, tables, and buttons use a light material surface, a small press, and tighter titles. Motion is reduced when the system asks for that.
- No new migration.

## v0.0.0.17 — 2026-10-07

- Google Sheets stay the source for Overview and Ins and Outs. A sheet that cannot be read shows the real note (missing link, missing service account variables, share, HTTP error, or a missing header) in the Loads cell. Ins, Outs, and Net stay blank for that truck. The word Unread is no longer used. A banner names `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` when either is unset.
- Sheet dates accept `2026-09-01 0:00:00`, `M/D/YYYY`, and a Google serial number. Values reads use `dateTimeRenderOption=FORMATTED_STRING` and a quoted range `A1:AZ`.
- Import sources in Settings, all documented there: CSV upload (working now), Google Sheet Load Ledger (optional promote into `loads`), Vektor REST API (selectable when `VEKTOR_API_BASE_URL` and `VEKTOR_API_TOKEN` are set), and Vektor MCP (kept, labeled available but currently broken on filters proto). MCP code is unchanged. The REST list path is OPEN and is probed with GET only. Set `VEKTOR_API_MANIFESTS_PATH` to skip probing. The REST path never calls MCP.
- Sheet Load IDs and rates are compared with `loads` for that truck and week. A missing load or a different rate opens a Warn issue. Overview and Ins and Outs show the open count. Resolved issues are not reopened.
- Weekly Asset Management Report PDF from Ins and Outs: header, KPI strip, executive summary, load activity, weekly totals, owner earnings from the Weekly Expenses tab, asset status, and fuel and compliance. Dispatcher, on-time, and compliance print Not stored. MC Lease is Truck Pymts plus Trailer Pymts (OPEN if those should stay split). No new migration.

## v0.0.0.16 — 2026-10-07

- Import loads failed proto decode on every manifest filter, including an empty object. Compact arguments `{"filters":{...}}` put `{` at column 12. Vektor reports `proto: syntax error (line 1:12): unexpected token {`. That token is what a string field rejects. `filters` is now a JSON string. A raw array is still not sent, because the server expands it to unknown arguments `filters[0].field`.
- Probes that remain, each JSON-encoded once: `first_stop_appointment_start_date` `{from, to}`, the schema date field, a schema array `{field, from, to}` when the schema describes an array, `firstStopAppointmentStartDate` `{from, to}`, `firstStopAppointmentStartDate` `{gte, lte}`, `deliveryDate` `{from, to}`, that same camelCase field as an array, `{}`, then an empty string. Fuel and toll list calls use the same string envelope.
- A tool error still fails the run. Notes name the filter and the error. If a call returns rows, delivered manifests still promote into `loads`. An empty success records the filters tried and the payload shape.
- Ins and Outs page at `/ins-outs`. Per active truck, for the selected week: sheet load earnings (Ins) and Mgmt Expenses (Outs) with fleet totals. Categories: Vektor Fee, Sintra AI, Quickbooks, Job Post, Accountant Salary, MVR, Drug Test, and Spare Expense 1 through 5. Overview still shows the shorter table and links here. No new migration.

## v0.0.0.15 — 2026-10-07

- Import loads failed with MCP error -32602. An empty-list fallback sent `filters` as an array of `{field, from, to}`. Vektor reports that as unknown arguments `filters[0].field`, `filters[0].from`, and `filters[0].to`.
- Manifest list filters are always an object map under `filters`. The tool schema is still read to choose the date field name. A schema that describes an array is not sent as an array. Probes that remain: `first_stop_appointment_start_date` `{from, to}`, the schema date field as an object map, `firstStopAppointmentStartDate` `{from, to}`, `firstStopAppointmentStartDate` `{gte, lte}`, `deliveryDate` `{from, to}`, and an empty filter. `gte/lte` is also used when the schema date field names those keys and does not name `from`/`to`.
- A tool error still fails the run and the error text is stored. If every accepted call returns no rows, Notes still record the filters tried and the payload shape. Delivered manifests still promote into `loads`.

## v0.0.0.14 — 2026-10-07

- Import loads: a successful Vektor call with zero rows was the unconfirmed date filter `filters.first_stop_appointment_start_date`. The list now reads the `core_Manifests_Get` input schema when that page is empty, tries the schema date field and camelCase delivery filters, and if only an unfiltered list has rows, keeps manifests by delivery date. An empty result stores payload keys and counts on the run and in Notes. Tool errors are no longer counted as an empty list. An empty `structuredContent` no longer hides rows that arrived in the text body.
- Promoted manifests still land in `loads` on `manifest_id`. The import does not write Google Sheets.
- Overview Ins and Outs, per active truck, for the selected Monday–Sunday week. Ins are the sheet load ledger Rate (integer cents) for deliveries in the week. Outs are Mgmt Expenses dated in the week: Vektor Fee, Sintra AI, Quickbooks, Job Post, Accountant Salary, MVR, Drug Test, and Spare Expense 1 through 5. Blank amounts are skipped.
- Sheet reads use a public CSV export, or `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` when the sheet is private. `GOOGLE_SHEETS_API_KEY` is optional for sheets that are already public. No new migration.

## v0.0.0.13 — 2026-10-07

- Trucks list and truck page: **Edit** opens the same side panel as Add truck and saves unit number, name, class, and owner. Trucks are still never deleted.
- Optional **Google Sheet** link on the truck. Shown on the list and the truck page, and opened as a link. Paste it on Add truck or Edit.
- Migration `20261007170000_truck_google_sheet_url.sql` adds `trucks.google_sheet_url`. It is not applied until the owner says go. Until then, the other truck fields still save.

## v0.0.0.12 — 2026-10-07

- Live Test connection failed because `core_Manifests_Get` sent `first_stop_appointment_start_date`, `page_size`, and `page_token`. Vektor accepts `filters`, `page`, `perPage`, `sortDirection`, `sortKey`, and `aggregationKeys`.
- Manifest list calls now send the first-stop date range inside `filters`, with 1-based `page` and `perPage` 100. Fuel and toll list calls use that same envelope. Truck and order-detail arguments are unchanged.
- `mcp_verified` can become true only after the owner clicks Test connection again.

## v0.0.0.11 — 2026-10-07

- Fixture smoke for Monday 2026-09-21 through Sunday 2026-09-27. Vitest imports Sample A/B/C, the fuel stand-in, and the toll fixture, resolves fixed expenses, computes the reference statement, locks it, reads the PDF, then checks Overview, the management P&L, and Issues.
- Sample A is the same cents and miles as statement load 1152. The fuel stand-in and the 66 tolls are not the statement ledger. Booking that fuel file blocks Close for units 04–08 and refuses the PDF.
- Runbook: `docs/WEEK-CLOSE-RUNBOOK.md`. No live Vektor call. No migration applied.

## v0.0.0.10 — 2026-10-07

- Overview for the selected Monday–Sunday week: fleet and unit snapshot from the statement (gross, fees, discounted fuel, tolls, owner fixed, net), open issues, and close status. A locked week uses the snapshot.
- Management P&L in integer cents. Income is Legacy retained on managed trucks plus the dispatch fee Legacy keeps. Expenses are fixed costs charged to management and operating expenses dated in the week. Tolson payable is shown and is not in the net.
- Issues inbox: Warn and Block import issues for the week, plus live close checks. Filter by week, severity, and status. Mark resolved updates a stored open issue only. Close checks are not stored and cannot be resolved.
- Migration `20261007160000_resolve_issue.sql` is not applied until the owner says go. No new table.

## v0.0.0.9 — 2026-10-07

- Weekly PDF for a selected week: one file, a section per unit, then fleet totals. Dollars are formatted from integer cents.
- Figures are recomputed from the locked snapshot, or from the computed statement when that week has no blockers. If net, lines, loads, discounted fuel, or tolls do not match, the PDF is refused.
- Statements page: **Download PDF**.
- Layout covers the header, load table, performance, owner earnings, discounted fuel, and fixed expenses that the statement already stores. Trailer, VIN, dispatcher, compliance, operations note, and a logo file are not stored.
- No new migration and no new environment variables.

## v0.0.0.8 — 2026-10-07

- Weekly statements for a Monday–Sunday week, using each load’s delivery date. Per-unit and fleet totals from loads, fee contracts, discounted fuel, tolls, and fixed weekly expenses.
- Money stays integer cents. Rates stay basis points. One half-up rounding per fee line on the week’s gross.
- Legacy-owned trucks deduct Tolson payable. Managed trucks deduct one management fee. The 10% Tolson and 5% Legacy split is stored and is not deducted again. Fixed expenses charged to management are stored and are not in owner net.
- Close week checks unlinked fuel, a row-count drop on an import that overlaps the week, missing or mid-week contracts, and that net reconciles. A clean week locks a snapshot. There is no reopen.
- Statements page: week selector, fleet and unit tables, Close with the blocker list.
- Migration `20261007150000_weekly_statements.sql` is not applied until the owner says go.

## v0.0.0.7 — 2026-10-07

- Fuel and tolls import: MCP first, CSV when column mapping is set. Staging, then `fuel_transactions` and `toll_transactions`. Idempotent on the Vektor transaction id.
- Fuel matches `unit_number` exactly. Tolls resolve the Vektor truck id to that unit. Unmatched rows stay in staging with a Warn issue.
- Validation uses `import_settings`: duplicate card/time/amount, price per gallon, tank size, no load that day, impossible MPG (Warn), row-count drop (Block), unlinked fuel at week close (Block check only).
- Fuel and Tolls pages show per-unit week totals. Discounted fuel is booked. Unit 03 retail minus discounted is $1.00 in the reference fixture.
- Read MCP allowlist adds the fuel list/aggregate and tolls list/stats tools. Any other tool name throws. Migration `20261007140000_fuel_tolls_import.sql` is not applied until the owner says go.

## v0.0.0.6 — 2026-10-07

- Fixed weekly expenses per truck: one effective-dated row per kind, weekly amount in integer cents, `charged_to` owner (default) or management.
- Kinds: Maintenance Escrow Weekly, ELD Fee, Yard Fee, GPS Tracker, Insurance, Truck Payments, Trailer Payments, Toll Pass, Permits, Misc.
- Per-week override table. Overlap protection and `change_log` on create, delete latest, and override changes.
- Fee rate versions and fixed-expense versions must start on a Monday (form, server action, and database function).
- Trucks page: Fixed expenses tab (new version, delete latest, week override, week lookup).
- Management-company operating expenses: manual date, category, amount in cents, note. Not a P&L.
- Migration `20261007130000_fixed_expenses_monday_rule.sql` is not applied until the owner says go.

## v0.0.0.5 — 2026-10-07

- Settings: Connect Vektor, status Connected / Needs sign-in, Test connection, Disconnect.
- App OAuth (PKCE + dynamic client registration) at `/api/vektor/oauth/start` and `/api/vektor/oauth/callback`. Tokens encrypted with `VEKTOR_TOKEN_ENCRYPTION_KEY`. Tables are RLS deny-all; ciphertext only via security-definer RPCs.
- Refresh before expiry under a database lock; rotated refresh token saved in one update. Failure sets Needs sign-in, marks the import run Failed, and opens Block issue "Vektor connection needs sign-in".
- MCP read allowlist: `core_Manifests_Get`, `core_Manifests_OrderDetailsGet`, `fleet_Trucks_GetByIDs`. Any other tool name throws.
- Live load fetch uses the first-stop window (from − 14 days, to + 7 days), then keeps rows whose delivery date is in range. `mcp_verified` becomes true only after Test connection passes; only then can Import source be MCP.
- Migration `20261007120000_vektor_mcp_oauth.sql` is not applied until the owner says go.
- Assumption Log defaults recorded in `docs/decisions.md`.

## v0.0.0.4 — 2026-10-06

- Vektor loads import (manual only): staging → validate → `loads`; idempotent on `manifestId`.
- Tables (migration not applied until go): `import_settings`, `import_runs`, `vektor_loads_staging`, `loads`, `issues` with RLS.
- Mapping per owner decisions: order friendlyId as Load ID, manifest grossAmount → cents, delivery-date fallback chain, deadhead = emptyDistance, lineage stored, Trip Group not built.
- Truck match: `truckId` → trucks lookup `referenceId` → exact `trucks.unit_number`.
- Import adapters: interface + Settings “Import source”; `McpAdapter` (unverified until spike), `CsvExportAdapter` (not configured), `ApiAdapter` stub; cross-source natural key = manifest `friendlyId`.
- Additive migration (unapplied until go): `import_runs.source`, staging `manifest_friendly_id`, unique loads friendlyId index, adapter settings keys.
- Sample A real values (1152) + Samples B/C + Vitest.
- Spike v2 script: `scripts/spike-vektor-mcp-oauth.mjs` (OAuth PKCE + refresh proof; tokens gitignored).
- Imports page (Import now, default last 14 days) and read-only Loads page (week + truck filters, totals).
- No Google Sheets. No scheduler.

## v0.0.0.3 — 2026-10-06

- Left nav: Overview and Trucks (button-style, current page highlighted).
- Trucks list: search, activate/deactivate (never delete), empty state, current fee summary, Add truck side panel.
- Truck detail: rate version history, New rate version form (rate % and calculated-on % of gross, no base default), test calculator using the pure fee engine, last-changed from `change_log`.
- Migration (not applied until go): `change_log` + `create_fee_rate_version` / `delete_latest_fee_rate_version` (single transaction, `allowed_users` check).
- Vitest: percent ↔ basis points (5.5 → 550, 2.65 → 265) and form data through the fee engine.
- Docs: data model, user guide, Module 2b marked done.

## v0.0.0.2 — 2026-10-06

- Database migration (not applied until go): `trucks`, `fee_contracts`, `fee_rules` with RLS for `allowed_users`; exclusion constraint blocks overlapping contracts for the same truck.
- Pure TypeScript fee engine: integer cents, basis points, half-up rounding in one function; contract date lookup; Monday–Sunday week helper.
- Vitest coverage for sample weeks, dispatch bases, rounding, date lookup, invalid inputs, and week bounds.
- Guard test: files outside `scripts/` must not reference privileged local script env names (docs and `.env.example` exempt).
- Docs: `data-model.md`, fee model and OPEN items in business rules, Module 2 marked done.

## v0.0.0.1 — 2026-10-05

- Project skeleton: Next.js App Router, TypeScript strict, Tailwind, lint, typecheck, Vitest, GitHub Actions CI.
- Supabase Auth with email + password sign-in; access limited to `allowed_users` (seed: `alphaassistant.alpha@gmail.com`, role `owner`). Google sign-in removed.
- Local `npm run create-owner` script to create or reset the owner Auth user (service role key stays local; never on Vercel).
- Pages: `/login`, Overview `/`, `/health`, and Access denied. Signed-in shell includes Sign out.
- UI foundation: Inter, navy accent, light theme, button actions, skeleton, toast, signed-in footer with version.
- Database migration: `allowed_users` with Row Level Security.
- Automated test that fails if `SECRETS/` or non-example `.env*` files are tracked by git.
- Documentation for overview, business rules, decisions, architecture, data sources, setup, modules, and versioning.
- Fix: refresh `package-lock.json` so GitHub Actions `npm ci` succeeds; document Vercel Framework Preset = Next.js (not static/`public` output).
- Fix: missing required env vars show a plain **Setup incomplete** page instead of a 500; missing names are logged server-side only.
- Production app domain set to `tret.ai.alphasolutions.software` (`tretai.alphasolutions.software` reserved for Resend).
- Fix: read Supabase public env via shared helper (avoids empty build-time inlining) and set cookieEncoding base64url.
- Fix: bake `VERSION` into `TRET_AI_VERSION` at build so Vercel serverless does not 500 on missing VERSION file; soft-fail middleware and show Setup incomplete on unexpected errors.

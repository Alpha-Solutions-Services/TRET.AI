# Changelog

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

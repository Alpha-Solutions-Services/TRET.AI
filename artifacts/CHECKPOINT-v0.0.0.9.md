# Checkpoint v0.0.0.9

1. Test table

| Check | How | Expected | Result |
| --- | --- | --- | --- |
| Fixture dollars | Vitest on `fixtures/statements/week-2026-09-21.json` | Unit 02 net $1,346.86. Unit 03 net $3,056.30. Fleet net $4,403.16. Discounted fuel $500.00 and $250.00 | PASS |
| Integer path | Same test | Rate per loaded mile for unit 02 is 741 cents ($7.41). Diesel MPG for 432.00 miles and 100.000 gallons is 4.32 | PASS |
| Managed unit | Same test | Unit 03 earnings include Management fee and omit Tolson and Legacy retained. Fleet page still shows those internal totals | PASS |
| PDF text | Vitest renders the file and reads the page text | Legacy Inc Global, load 1152, Dallas TX, Atlanta GA, the three nets, discounted fuel, Maintenance Escrow Weekly, Yard Fee, Not stored, version 0.0.0.9. No $228.00 line | PASS |
| Reconcile block | Vitest | A net off by one cent, a load gross off by one cent, or discounted fuel off by one dollar refuses the PDF | PASS |
| Full suite | `npm test` | Earlier tests stay green | PASS (104 tests) |
| Live migration | Not run | No new migration in this version | None |
| Signed-in screens | Browser | Statements Download PDF | Not clicked. This run has no app env, so the site cannot sign in |

2. What was built

- One weekly PDF from the locked snapshot, or from the computed statement when the week has no blockers. Per-unit pages and a fleet page. Dollars are formatted from integer cents.
- Download on the Statements page for the selected week. The file is refused when net, lines, loads, discounted fuel, or tolls do not match.
- Header, load table, performance, owner earnings, discounted fuel, and fixed expenses use the fields already stored. Trailer, VIN, dispatcher, compliance, and the operations note print “Not stored”.
- No new table and no new environment variables.

3. Click-by-click owner test

1. Sign in to https://tret.ai.alphasolutions.software. The v0.0.0.8 statements migration must already be applied if you want a locked week. This version adds no SQL.
2. Open **Statements**. Set the week to `2026-09-21`.
3. If the week has blockers, **Download PDF** stays off. Fix the reasons, then come back.
4. Click **Download PDF**. The file is `tret-statement-2026-09-21.pdf`.
5. Unit 02 and unit 03 each start on their own page. The last page is fleet totals. Amounts are dollars. Fuel is the discounted amount.
6. On a managed unit, the earnings list shows one management fee. Tolson payable and Legacy retained are on the fleet page.
7. Trailer, VIN, dispatcher, compliance, and the operations note say Not stored.
8. Close the week, then download again. The banner says Locked. If loads or fuel no longer add up to the snapshot, the download is refused and the message says which total failed.

4. Manual owner steps

- No new migration.
- No new environment variables.

5. Not done / OPEN

- Signed-in screens were not clicked in this run (no app env). The PDF was rendered from the statement fixture and checked as text.
- The uploaded handoff has no owner PDF dollar table for 21–27 Sep 2026. The fixture statement is still the reference. Live per-unit fuel dollars stay OPEN.
- No logo file was in the handoff or the repo. The PDF prints the name Legacy Inc Global.
- Trailer, VIN, dispatcher, compliance, and an operations note are not stored.
- One file per truck is not built. This version is one week file.
- Load rows are not copied into the snapshot. A later edit that breaks the totals refuses the PDF.
- Blocks 6–7 (Issues inbox, AI, management-company P&L, Quicken) were not started.
- Quicken format stays OPEN.

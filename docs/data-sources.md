# Data sources

| Source | Use | Notes |
|--------|-----|--------|
| **Vektor MCP** | Loads, fuel, and tolls | Kept in Settings. Available, currently broken on filters proto. Selectable after Test connection. Prefer another source until Vektor documents filters. |
| **Vektor REST API** | Loads | Selectable when `VEKTOR_API_BASE_URL` and `VEKTOR_API_TOKEN` are set. List path is OPEN. Optional `VEKTOR_API_MANIFESTS_PATH`. Never calls MCP. Does not import fuel or tolls. |
| **CSV upload** | Loads, and fuel and tolls when mappings are saved | Working now. Load columns match the Load Ledger: Delivery Date, Load ID, Rate, and Unit or Truck #. |
| **Google Sheet Load Ledger** | Optional promote into `loads` | Same ledger the dashboard reads. Does not replace the Ins and Outs page. Does not import fuel or tolls. |
| **Fuel** | Expense lines on weekly reports | Read from Vektor or CSV. The asset report uses the sheet fuel cells first. |
| **Tolls** | Expense lines on weekly reports | Read from Vektor or CSV. Bestpass API is OPEN. The asset report uses the sheet toll cell first. |
| **Google Sheets** | Overview, Ins and Outs, and the Weekly Asset Management Report | Primary for those screens. Tabs: Load Ledger, Mgmt Expenses, Weekly Expenses, Fuel Log, Fleet Directory. |
| **Quicken (Windows)** | Export (QIF planned) | Exact Quicken version is OPEN |

Overview and **Ins and Outs** read each truck’s Google Sheet. Loads can also be promoted from CSV, the sheet Load Ledger, REST, or MCP. When a sheet Load ID is missing from `loads`, or the rate differs, a Warn issue is opened. Quicken is a later module.

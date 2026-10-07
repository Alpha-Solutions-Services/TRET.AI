# Data sources

| Source | Use | Notes |
|--------|-----|--------|
| **Vektor** (MCP / API) | Loads, fuel, and tolls | Loads: Connect Vektor in Settings (v0.0.0.5). Fuel and tolls: Import fuel and tolls (v0.0.0.7). CSV is the fallback when column mapping is set. |
| **Fuel** | Expense lines on weekly reports | Read from Vektor first |
| **Tolls** | Expense lines on weekly reports | Read from Vektor first; Bestpass API is OPEN |
| **Google Sheets** | Overview Ins and Outs per truck | Read only. Ins are load ledger earnings. Outs are Mgmt Expenses. Not the loads ledger. |
| **Quicken (Windows)** | Export (QIF planned) | Exact Quicken version is OPEN |

Loads, fuel, and tolls are read from Vektor and promoted into the database. Overview also reads each truck’s Google Sheet for Ins and Outs. Quicken is a later module.

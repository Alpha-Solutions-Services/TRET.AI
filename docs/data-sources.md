# Data sources

| Source | Use | Notes |
|--------|-----|--------|
| **Vektor** (MCP / API) | Loads, and (first choice) fuel and tolls | Main operations system for Legacy Inc Global |
| **Fuel** | Expense lines on weekly reports | Read from Vektor first |
| **Tolls** | Expense lines on weekly reports | Read from Vektor first; Bestpass API is OPEN |
| **Google Sheets** | Mirror / compare selected data | Database wins on conflict; flag an issue |
| **Quicken (Windows)** | Export (QIF planned) | Exact Quicken version is OPEN |

v0.0.0.1 does not connect to Vektor, Sheets, or Quicken yet. Those belong to later modules.

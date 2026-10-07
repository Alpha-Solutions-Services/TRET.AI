# Data sources

| Source | Use | Notes |
|--------|-----|--------|
| **Vektor** (MCP / API) | Loads, fuel, and tolls | Loads: Connect Vektor in Settings (v0.0.0.5). Fuel and tolls: Import fuel and tolls (v0.0.0.7). CSV is the fallback when column mapping is set. |
| **Fuel** | Expense lines on weekly reports | Read from Vektor first |
| **Tolls** | Expense lines on weekly reports | Read from Vektor first; Bestpass API is OPEN |
| **Google Sheets** | Mirror / compare selected data | Database wins on conflict; flag an issue |
| **Quicken (Windows)** | Export (QIF planned) | Exact Quicken version is OPEN |

Loads, fuel, and tolls are read from Vektor. Google Sheets and Quicken are later modules.

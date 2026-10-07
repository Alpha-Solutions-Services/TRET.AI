# Architecture

TRET.AI is planned as a clear pipeline. **v0.0.0.1** only has login, Overview, and Health. Later modules fill these layers.

## Layers

```
Ingest → Staging → Validate → Ledger → Reports → Sync
```

| Layer | Role (plain English) |
|-------|----------------------|
| **Ingest** | Pull loads, fuel, and tolls from Vektor (and other sources when approved) |
| **Staging** | Hold raw imported rows before they are trusted |
| **Validate** | Check rules, flag issues, block bad data from becoming final |
| **Ledger** | Store fee results, weekly statement snapshots, payables, income, expenses, and adjustments |
| **Reports** | Weekly owner PDFs and management views |
| **Sync** | Push or compare with Google Sheets; Quicken export |

## Source of truth

The **Postgres database (Supabase)** wins over sheets and files. Disagreements create issues; nothing is overwritten silently.

## Money

Money must never be stored or calculated as a floating-point number. Weekly statement totals are integer cents.

## LLM

When AI is added later, every LLM call goes through one module named `llm-gateway`. That module does not exist yet.

# Versioning

## Source of truth

The plain text file **`VERSION`** at the repo root is the **only** source of truth for the app version.

Example contents:

```text
0.0.0.1
```

## package.json

The `"version"` field in `package.json` stays **`0.0.0`**.

Reason: **npm cannot hold 4-part versions** (like `0.0.0.1`). Do not put `0.0.0.1` in `package.json`.

The UI footer and `/health` page read from `VERSION`, not from `package.json`.

## Tags and bumps

- Bump `VERSION` only when the owner says to.
- Create git tag `v0.0.0.1` only after the owner confirms tests pass.
- Commit messages for this line of work use: `v0.0.0.1: <what changed>`.

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

The `/health` page and other server code read `VERSION` through `readAppVersion` in `src/lib/version.ts`. That module uses Node `fs` and must not be imported by a client component.

The signed-in footer is a client component. It imports `APP_VERSION` and `formatFooterLabel` from `src/lib/app-version.ts`. That file has no `node:fs` or `node:path`. `APP_VERSION` is the same text as the VERSION file (`0.0.0.26`). The footer label is `TRET.AI v…`. The footer sits in normal page flow. It is not fixed to the bottom of the screen.

## Tags and bumps

- Bump `VERSION` only when the owner says to.
- Create git tag `v0.0.0.1` only after the owner confirms tests pass.
- Commit messages for this line of work use: `v0.0.0.1: <what changed>`.

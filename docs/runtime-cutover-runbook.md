# Runtime cutover runbook

Phase 1 cutover should avoid manual full-file edits to `index.html`.
Use the checked-in codemod and validation scripts instead.

## Preconditions

- `main.js` runs the runtime loader before analytics scheduling.
- Analytics stays owned by its existing module and bootstrap call.
- The dry-run command succeeds before any HTML change.

## Steps

```bash
npm run cutover:runtime-sdk:dry-run
npm run cutover:runtime-sdk
node scripts/check-no-static-runtime-script.mjs
npm run check
```

## Rollback

Revert only the commit that changed `index.html`.
Do not revert the runtime loader or analytics guard unless those checks fail independently.

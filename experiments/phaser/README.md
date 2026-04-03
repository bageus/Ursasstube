# Phaser experiment (curated import)

This directory contains a **curated Phaser integration layer** imported from the local archive `tmp/Phaser-main.zip`.

## Why curated

The original archive is a full app snapshot and duplicates most of the root repository code.
For maintainability, this subtree keeps only Phaser-specific renderer/integration modules and supporting docs/scripts.

## Included

- `js/phaser/` runtime bridge, scene, tunnel, and entity renderer modules.
- `js/render-snapshot.js` and `js/render-snapshot-contract.js`.
- `js/config.js` and `js/state.js` (minimal shared dependencies required by the imported Phaser layer).
- `js/renderers/` renderer adapter and contract definitions.
- `docs/render-snapshot-contract.md`.
- `scripts/generate-tunnel-textures.mjs`.

## Not included

- Duplicate app shell files (`index.html`, `css/`, duplicate root-level `js/*.js`, duplicate lockfiles/tooling).

## Source provenance

- Archive source: `tmp/Phaser-main.zip`
- Archive root folder: `Phaser-main/`
- Import mode: snapshot (no commit history)

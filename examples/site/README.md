# Sheetwrite examples site

One Astro site hosting every runnable demo: vanilla, theming, and the
React/Vue/Svelte islands. Run from the repo root:

```sh
bun run examples
```

## API coverage assignment

Every adapter capability is exercised by exactly ONE demo (keep the site
lean); future APIs get an owner here at design time.

| Contract | Demo that owns it |
| --- | --- |
| `datasource` (paged) | Vue |
| worker renderer + `rendererKind` readout | React |
| custom `renderers` (progress-bar cell) | Svelte |
| `overscan` live control | React |
| `onScroll` / `onEditBegin` / `onEditCommit` | Vue |
| `onSearch` (search box driving `grid.search`) | Vue |
| `active-sheet` event | Vue |
| `onChange` log incl. `commitReason` | Svelte |
| eager `data`, `theme`, `readOnly`, `config`, `onReady` | all three |

`minColumns` and `renderer`/`workerUrl` are documented reset boundaries (see
docs/framework-integration.md "Which prop changes reset the grid"); the React
worker toggle deliberately demonstrates the recreate.

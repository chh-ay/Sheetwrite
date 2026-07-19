# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): one
Markdown file per pending change that records which `@sheetwrite/*` packages
changed and at what semver bump.

## Adding a changeset

After making a change that should ship in a release, run:

```sh
bunx changeset
```

Pick the affected packages, choose `major` / `minor` / `patch`, and write a
short summary. This creates a Markdown file under `.changeset/` — commit it
alongside your change.

Private workspaces are excluded by Changesets policy, so you only select the
published packages: `@sheetwrite/core`, `@sheetwrite/wasm`, `@sheetwrite/xlsx`,
`@sheetwrite/react`, `@sheetwrite/vue`, `@sheetwrite/svelte`.

## How releases consume them

The base branch is `develop`. The versioning workflow accumulates pending
changesets into one pull request, applying only the requested package bumps and
updating their changelogs. After that pull request merges and passes CI, release
automation publishes only exact package versions that are not already present
on npm.

For a local preview of the version changes:

```sh
bunx changeset version
```

Configuration lives in `.changeset/config.json`.

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

The example apps (`@sheetwrite/example-*`) are ignored and never released, so
you only select the published packages: `@sheetwrite/core`, `@sheetwrite/wasm`,
`@sheetwrite/react`, `@sheetwrite/vue`, `@sheetwrite/svelte`.

## How releases consume them

CI/release tooling reads the accumulated changesets to bump versions and
assemble changelogs:

```sh
bunx changeset version   # apply bumps + update CHANGELOG files
bunx changeset publish   # publish the bumped packages
```

The base branch is `develop`. Config lives in `.changeset/config.json`.

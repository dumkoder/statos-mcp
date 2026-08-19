# Releasing `@statospro/mcp`

Not shipped to npm (`package.json#files` is an allowlist: `dist`, `README.md`,
`LICENSE`, `CHANGELOG.md`). This file is for us.

## Where the code lives

Two copies exist and that is deliberate:

| | role |
|---|---|
| `statos/mcp` (this directory, private monorepo) | **source of truth.** All edits land here, in a PR, alongside the backend changes they depend on — the tool surface tracks API-key scopes and endpoint shapes, so a change here is usually half of a change there. |
| [`dumkoder/statos-mcp`](https://github.com/dumkoder/statos-mcp) (public) | **published mirror.** Holds its own commit history and its own CI run; this is the repo `package.json`'s `repository`/`bugs` fields point at, and the repo npm users read. |

## Syncing to the mirror — copy files, do NOT subtree split

The mirror was originally created with `git subtree split -P mcp`, and it is
tempting to keep refreshing it that way. **Don't.** Verified 2026-08-19:

- A fresh split reproduces only this directory's history, so its tip descends
  from the last split point and **not** from the mirror's current tip. The
  mirror has since gained commits of its own (the standalone-packaging commit
  and a CI fix). Pushing the split is therefore a non-fast-forward that needs
  `--force` and **rewrites public history**.
- The split contains **no `.github/` files**, because a subtree split of `mcp`
  can only carry paths under `mcp/`. Force-pushing it **deletes the mirror's
  `.github/workflows/ci.yml`** — the CI that makes the public repo worth
  showing.

So sync file contents instead and commit in the mirror normally, which
fast-forwards and leaves history and CI alone:

```bash
# from statos/ — copy tracked content into the mirror checkout
rsync -a --delete \
  --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' \
  --exclude '.github/' \
  mcp/ ../statos-mcp/

# the CI workflow is tracked here at mcp/.github/workflows/ (inert in this
# repo — GitHub only reads workflows from the repository root) so the two
# copies cannot drift; place it where the mirror will actually run it
cp mcp/.github/workflows/ci.yml ../statos-mcp/.github/workflows/ci.yml

cd ../statos-mcp && git add -A && git commit && git push   # plain fast-forward
```

Edit the mirror directly only for something that genuinely cannot exist here.
Anything else edited only there is silently reverted by the next `rsync
--delete`; copy it back into `mcp/` first.

## Publishing

Publish from the **mirror** checkout, after syncing. Two reasons: the tarball
then provably matches the public repo a user can read, and `package.json`
already advertises that repo as the package's home — publishing from a private
monorepo path would make those URLs a fiction.

```bash
cd ../statos-mcp
git pull
pnpm install && pnpm run typecheck && pnpm test
npm publish            # NOT `pnpm publish` — see below
```

**Use `npm publish`.** `pnpm publish` does not populate the registry's `readme`
metadata field, which is why the npm page rendered blank for 0.2.0 and 0.2.1
even though `README.md` was inside the tarball. `prepublishOnly` runs
`pnpm run build`, so pnpm still needs to be on PATH either way.

`npm publish` needs an interactive `npm login` (browser flow); a stored
credential expires silently and surfaces as `E401` on `npm whoami`. Check that
first if a publish fails.

After publishing, open <https://www.npmjs.com/package/@statospro/mcp> and
confirm the README actually renders before calling it done.

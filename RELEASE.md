# Mars Desktop — Release & Installers

This repository is a working copy of the OpenCode monorepo on the **`mars-desktop`** branch,
rebranded to **Mars Desktop** (`click.marsai.desktop.*`, scheme `marsai://`, author MarsAI).
The desktop app lives in `packages/desktop` and bundles the published `opencode` CLI.

## Build locally

```bash
bun install
cd packages/desktop
bun ./scripts/prepare.ts      # icons + metainfo + downloads the opencode CLI for your target
bun run build                 # electron-vite build -> out/
bun run package:win           # or :mac / :linux -> dist/
```

The packaged installer lands in `packages/desktop/dist/`.

Channel selection is via `OPENCODE_CHANNEL` (`dev` | `beta` | `prod`, default `dev`); it picks
the app id, product name, and bundled-CLI dist-tag. `prepare.ts`/`prebuild.ts` downloads the
matching `@opencode/cli-*` npm binary for the current `OPENCODE_CLI_TARGET`; set
`OPENCODE_CLI_DIST` to a locally-built CLI dir to bundle that instead (full monorepo release path).

## Publish a release (CI)

`.github/workflows/release.yml` builds installers on every OS and publishes them to
**GitHub Releases on this repo** (`localhost8083/marsDesktop`), including the `latest*.yml`
files `electron-updater` reads for auto-update.

- **Manual:** Actions → *release* → choose `channel` (`prod`/`beta`/`dev`), optionally `version`
  (defaults to `packages/desktop/package.json` version), and `publish`.
- **Tag:** pushing a `v*` tag builds and publishes with `channel=prod`.

The `publish` provider is in `packages/desktop/electron-builder.config.ts` and points at this
repo — so `electron-builder --publish always` uploads the NSIS/dmg/zip/AppImage/deb/rpm plus
`latest*.yml` straight to a `v{version}` release. The app's built-in `electron-updater` then
auto-updates from that feed.

### Optional code signing

Signing is gated on secrets; without them installers ship **unsigned** (a warning is logged) and
the pipeline still succeeds. Add these secrets to enable it:

| Platform | Secrets |
|----------|---------|
| Windows (Azure Trusted Signing) | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE` |
| macOS (codesign + notarize) | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_PATH`, `APPLE_API_KEY`, `APPLE_API_ISSUER` |

`SKIP_NOTARIZE=1` (set automatically when Apple creds are absent) lets unsigned mac builds
package without notarization.

> Note: upstream publishes installers to the `opencode.ai` update service via Cloudflare R2 +
> OIDC (`script/update-artifact.ts`). That backend is hard-coded to infra we don't own, so this
> repo uses GitHub Releases instead — same `latest*.yml` mechanism `electron-updater` expects.

## Syncing with `opencode`

`marsDesktop` shares git history with the `opencode` checkout (it's the `mars-desktop` branch
pushed to the `marsDesktop` remote). To pull upstream/rebrand changes:

```bash
cd ../opencode
git fetch marsDesktop mars-desktop
git merge marsDesktop/mars-desktop     # or rebase
git push marsDesktop mars-desktop
cd ../marsDesktop && git pull --ff-only origin mars-desktop
```

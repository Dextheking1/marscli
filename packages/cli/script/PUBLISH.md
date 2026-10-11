# Publishing @mars_ai/marscli

Normal path:

```
MARSAI_VERSION=2.0.x bun ./script/publish.ts   # repo root — publishes client, then CLI + natives
```

Requires a full build first (all 12 natives):

```
MARSAI_VERSION=2.0.x bun run --cwd packages/cli build
```

## Friction notes

- **`MARSAI_VERSION` must be set for the build too** — the build stamps the artifact version
  (`dist/**/package.json`). Without it you get `0.0.0-dev-<date>` and the CLI publish step rejects
  the mismatch (`Artifact version ... does not match release version`).
- **Reruns stall after everything is published.** `packages/client/script/publish.ts` calls
  `process.exit(0)` when all `@opencode/*` packages are already published, which kills the root
  chain before the CLI step runs. Resume by running the CLI publish script directly:

  ```
  MARSAI_VERSION=2.0.x MARSAI_PUBLISH_ONLY=<pkg> bun ./packages/cli/script/publish.ts
  ```

  `<pkg>` is `@mars_ai/marscli` or one of the 12 native package names.
- **90MB+ tarballs can show "failed" while actually staged.** `npm publish` returns, the script
  throws, but the registry is still processing (~2 min lag) — `npm view <pkg>@<version>` 404s, a
  retry hits `E409 Cannot publish over previously staged version`. Poll until visible before
  retrying; don't republish a staged tarball.
- Kill any running `mars.exe` under `packages/cli/dist` before a full build — the build wipes
  `dist/` and Windows refuses to delete a running image (EPERM).

# Mars CLI

<p align="center">
  <strong>MarsAI command line agent</strong> — a MarsAI-branded distribution of the OpenCode v2 agent, wired to the MarsAI provider and free subagent model pool.
</p>

Mars CLI is a fork of [OpenCode](https://github.com/anomalyco/opencode) (v2 line). It is **not built by, affiliated with, or endorsed by** the OpenCode team. All development happens on this fork; the rebranding and MarsAI integrations only exist here.

## Install

```bash
npm install -g @mars_ai/marscli
```

This installs the `mars` command. The launcher resolves and installs the matching native binary for your OS and CPU architecture (Linux, macOS, and Windows; x64/arm64, glibc/musl, baseline builds included).

## Quick start

```bash
mars                 # interactive TUI in the current directory
mars auth login      # sign in with MarsAI (device flow)
mars models          # list available MarsAI models
mars run "fix the failing test in src/auth.ts"
mars serve           # headless server
mars --help
```

## What's different from upstream

- **MarsAI provider only** — signs in via MarsAI device OAuth; models come live from the MarsAI catalog (`marsai/*`).
- **Free subagent pool** — spawned subagents round-robin across MarsAI free models (ids matching `subagent` or `free`). Subagents can never edit files.
- **Fail-fast escalation** — a dead free model never blocks a session; the runner rotates to the next pool model, then to a paid MarsAI model.
- **Local titles** — sessions are titled from the first prompt instead of a second LLM call.
- **Encrypted credentials at rest** — stored credentials are AES-256-GCM encrypted in the local database; legacy v1 `auth.json` is imported and migrated automatically.
- **npm launcher distribution** — ships as `@mars_ai/marscli` with per-platform native packages; updates via npm (`MARSAI_UPDATE_URL` can override the update API base).

## Configuration

Environment variables:

| Variable | Purpose |
| --- | --- |
| `MARSAI_URL` | MarsAI API base (default `https://marsai.click`) |
| `MARSAI_API_KEY` | API key instead of device login |
| `MARSAI_UPDATE_URL` | Override the update check API base |

Data lives under your XDG data/state/config dirs in `marsai` subdirectories (`~/.local/share/marsai`, etc.).

## Development

Requires [Bun](https://bun.sh) (see `packageManager` in `package.json`).

```bash
bun install
bun dev                      # run the TUI from source
bun run typecheck            # workspace typecheck
bun --cwd packages/core test # core tests (run per package; never from root)
bun --cwd packages/cli run build   # build all 12 platform binaries into packages/cli/dist
```

Layout: `packages/cli` (CLI, server, TUI entry), `packages/core` (session engine, plugins, DB), `packages/tui` (terminal UI), `packages/app` (web UI), `packages/sdk-next` (embedded host).

Releases: `MARSAI_VERSION=x.y.z bun --cwd packages/cli run publish:release` (set `MARSAI_PUBLISH_DRY_RUN=1` first; use `MARSAI_PUBLISH_ONLY=<pkg>` to resume interrupted publishes).

## License

See [packages/cli/LICENSE](packages/cli/LICENSE).

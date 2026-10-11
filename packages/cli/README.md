# Mars CLI

Mars CLI is the command-line client for the MarsAI coding agent.

## Install

```bash
npm install --global @mars_ai/marscli
```

This installs the `mars` command. The package selects the matching native binary for the host operating system and CPU architecture.

## Start

```bash
mars
mars --help
mars serve
```

Sign in to MarsAI with the CLI's account flow, or configure the server URL with `MARSAI_URL` when using a compatible self-hosted gateway.

## Supported targets

The release pipeline publishes native optional packages for:

- Linux: x64 and arm64, glibc and musl variants where supported
- macOS: x64 and arm64
- Windows: x64 and arm64

The launcher falls back to a baseline x64 binary when AVX2 is unavailable.

## Configuration

Useful environment variables include:

- `MARSAI_URL` — MarsAI account/API base URL
- `MARSAI_BIN_PATH` — explicit path to a native binary, useful for local testing

## Troubleshooting

If npm reports that the platform package is missing, reinstall `@mars_ai/marscli` and verify that optional dependencies are enabled. For an offline or restricted installation, set `MARSAI_BIN_PATH` to a compatible native binary.

## License

MIT

#!/usr/bin/env bun
import { $ } from "bun"

import { copyBuiltCliToResources, downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()

await $`bun ./scripts/copy-icons.ts ${channel}`

await $`bun ./scripts/copy-metainfo.ts ${channel}`

// When a locally built CLI dist is provided (full monorepo release pipeline), bundle it.
// Otherwise fall back to downloading the published @opencode/cli-* binary for this target —
// this is how standalone desktop builds (the marsDesktop repo) ship a CLI without building it.
if (Bun.env.OPENCODE_CLI_DIST) {
  await copyBuiltCliToResources(Bun.env.OPENCODE_CLI_DIST)
} else {
  const tag = channel === "prod" ? "latest" : channel
  await downloadCliToResources(tag)
}

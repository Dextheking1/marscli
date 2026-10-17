import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "Mars Desktop Dev",
  beta: "Mars Desktop Beta",
  prod: "Mars Desktop",
}

const appIDs: Record<string, string> = {
  dev: "click.marsai.desktop.dev",
  beta: "click.marsai.desktop.beta",
  prod: "click.marsai.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "Mars Desktop Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "click.marsai.desktop.dev"

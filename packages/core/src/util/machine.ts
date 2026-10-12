import { execFile } from "child_process"
import { Hash } from "@opencode/util/hash"

// Stable per-machine identifier sent with MarsAI auth calls so the server can bind one
// account to one machine and detect multi-account abuse. Never sent anywhere else.

let cached: string | undefined

function raw(): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile(
        "reg",
        ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
        { timeout: 5_000 },
        (error, stdout) => {
          if (error) return resolve("")
          resolve(stdout.split("REG_SZ")[1]?.trim() ?? "")
        },
      )
      return
    }
    const { readFile } = require("fs") as typeof import("fs")
    const paths =
      process.platform === "darwin"
        ? ["/Library/Preferences/SystemConfiguration/com.apple.platform.uuid"]
        : ["/etc/machine-id", "/var/lib/dbus/machine-id"]
    const next = (index: number): void => {
      if (index >= paths.length) return resolve("")
      readFile(paths[index], "utf8", (error, data) => {
        if (error) return next(index + 1)
        resolve(data.trim())
      })
    }
    next(0)
  })
}

/** Anonymous, stable machine fingerprint. Falls back to hostname+user when no platform ID exists. */
export async function machineID(): Promise<string> {
  if (cached) return cached
  let id = await raw()
  if (!id) {
    const os = await import("os")
    id = `${os.hostname()}:${os.userInfo().username}`
  }
  cached = `m1_${Hash.sha256(id).slice(0, 32)}`
  return cached
}

export * as Machine from "./machine.js"

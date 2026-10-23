export * as Secret from "./secret.js"

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs"
import path from "path"
import { Global } from "@opencode/util/global"

const PREFIX = "enc:v1:"

function readKey(keyFile: string) {
  const raw = readFileSync(keyFile, "utf8").trim()
  // Fail closed on a damaged key file. Hashing empty or partial content would derive a
  // key from a publicly known string (sha256 of "" is a constant), so a truncated write
  // must never be accepted as key material.
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error(`Invalid credential key file: ${keyFile}`)
  return createHash("sha256").update(raw).digest()
}

function key() {
  const keyFile = path.join(Global.Path.data, "secret.key")
  if (!existsSync(keyFile)) {
    mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 })
    try {
      // "wx" fails instead of overwriting when a concurrent first run won the race.
      // The loser has to encrypt with the winner's key; replacing it would strand
      // every credential the winner already stored.
      writeFileSync(keyFile, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    if (process.platform !== "win32") chmodSync(keyFile, 0o600)
  }
  return readKey(keyFile)
}

export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
}

export function decrypt(input: string) {
  if (!input.startsWith(PREFIX)) return input
  const buf = Buffer.from(input.slice(PREFIX.length), "base64")
  if (buf.length < 29) throw new Error("Invalid encrypted secret")
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")
}

export const encrypted = (input: string) => input.startsWith(PREFIX)

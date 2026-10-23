export * as Secret from "./secret.js"

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"
import { chmodSync, closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
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

function createKey(keyFile: string) {
  // Write the finished key to a temp file in the same directory, fsync it, then publish
  // it with link(). link() is atomic and fails with EEXIST instead of replacing an
  // existing key, so a file visible at the real path is always complete, and the loser
  // of a first-run race reads the winner's key instead of stranding the credentials
  // it already stored under its own.
  const tmpFile = `${keyFile}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`
  const fd = openSync(tmpFile, "wx", 0o600)
  try {
    writeFileSync(fd, randomBytes(32).toString("hex"))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    linkSync(tmpFile, keyFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  } finally {
    unlinkSync(tmpFile)
  }
}

function key() {
  const keyFile = path.join(Global.Path.data, "secret.key")
  try {
    return readKey(keyFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 })
  createKey(keyFile)
  if (process.platform !== "win32") chmodSync(keyFile, 0o600)
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

import { expect, test } from "bun:test"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "path"
import { Secret } from "@opencode/core/util/secret"
import { tmpdir } from "../fixture/tmpdir"

test("encrypts and decrypts credential data", () => {
  const plain = JSON.stringify({ access: "mars_at_test", refresh: "mars_rt_test" })
  const encrypted = Secret.encrypt(plain)
  expect(encrypted).not.toContain("mars_at_test")
  expect(Secret.encrypted(encrypted)).toBe(true)
  expect(Secret.decrypt(encrypted)).toBe(plain)
})

// First-run key creation happens inside Global.Path.data, which is fixed for
// this process, so the cases below run in child processes with their own data
// home. The child imports secret.ts by path, so what it loads is the module
// under test with its real imports.
const secretFile = path.join(import.meta.dir, "..", "..", "src", "util", "secret.ts")

const childSource = `
const secret = await import(process.env.SECRET_MODULE)
const mode = process.env.MODE
if (mode === "encrypt") console.log(secret.encrypt(process.env.PLAIN))
if (mode === "verify") {
  for (const item of JSON.parse(process.env.CASES)) {
    if (secret.decrypt(item.cipher) !== item.plain) throw new Error("decrypt mismatch")
  }
  console.log("ok")
}
if (mode === "watch") {
  const fs = await import("node:fs")
  const deadline = Date.now() + Number(process.env.WATCH_MS)
  while (Date.now() < deadline) {
    if (fs.existsSync(process.env.KEY_PATH)) {
      const raw = fs.readFileSync(process.env.KEY_PATH, "utf8").trim()
      if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error("partial key visible at real path")
    }
    await Bun.sleep(1)
  }
  console.log("clean")
}
`

function childEnv(home: string) {
  return {
    ...process.env,
    HOME: home,
    OPENCODE_TEST_HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    SECRET_MODULE: secretFile,
  }
}

async function runChild(home: string, env: Record<string, string>) {
  const proc = Bun.spawn({
    cmd: [process.execPath, path.join(home, "child.ts")],
    env: { ...childEnv(home), ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, out: out.trim(), err: err.trim() }
}

async function setup(home: string) {
  const data = path.join(home, ".local", "share", "marsai")
  mkdirSync(data, { recursive: true })
  writeFileSync(path.join(home, "child.ts"), childSource)
  return { data, keyFile: path.join(data, "secret.key") }
}

test(
  "concurrent first runs agree on one key",
  async () => {
    await using home = await tmpdir()
    const { data, keyFile } = await setup(home.path)
    const runs = await Promise.all(
      Array.from({ length: 6 }, (_, i) => runChild(home.path, { MODE: "encrypt", PLAIN: `child-${i}` })),
    )
    expect(runs.map((run) => run.code)).toEqual([0, 0, 0, 0, 0, 0])
    const cases = runs.map((run, i) => ({ cipher: run.out, plain: `child-${i}` }))
    const verify = await runChild(home.path, { MODE: "verify", CASES: JSON.stringify(cases) })
    expect(verify.code).toBe(0)
    expect(verify.out).toBe("ok")
    expect(readFileSync(keyFile, "utf8").trim()).toMatch(/^[0-9a-f]{64}$/)
    expect(readdirSync(data)).toEqual(["secret.key"])
  },
  30_000,
)

test(
  "a key file at the real path is always complete",
  async () => {
    await using home = await tmpdir()
    const { keyFile } = await setup(home.path)
    const watcher = Bun.spawn({
      cmd: [process.execPath, path.join(home.path, "child.ts")],
      env: { ...childEnv(home.path), MODE: "watch", KEY_PATH: keyFile, WATCH_MS: "10000" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const runs = await Promise.all(
      Array.from({ length: 6 }, (_, i) => runChild(home.path, { MODE: "encrypt", PLAIN: `watch-${i}` })),
    )
    expect(runs.map((run) => run.code)).toEqual([0, 0, 0, 0, 0, 0])
    const [out, code] = await Promise.all([new Response(watcher.stdout).text(), watcher.exited])
    expect(code).toBe(0)
    expect(out.trim()).toBe("clean")
  },
  30_000,
)

test("rejects a damaged key file instead of hashing it", async () => {
  await using home = await tmpdir()
  const { keyFile } = await setup(home.path)
  writeFileSync(keyFile, "abcd1234")
  const run = await runChild(home.path, { MODE: "encrypt", PLAIN: "x" })
  expect(run.code).not.toBe(0)
  expect(run.err).toContain("Invalid credential key file")
})

test("ignores a leftover temp key file", async () => {
  await using home = await tmpdir()
  const { keyFile } = await setup(home.path)
  writeFileSync(`${keyFile}.tmp-9999-deadbeefcafe`, "abcd")
  const run = await runChild(home.path, { MODE: "encrypt", PLAIN: "x" })
  expect(run.code).toBe(0)
  expect(readFileSync(keyFile, "utf8").trim()).toMatch(/^[0-9a-f]{64}$/)
})

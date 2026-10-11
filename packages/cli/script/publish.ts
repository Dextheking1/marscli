#!/usr/bin/env bun
import { $ } from "bun"
import { rm } from "fs/promises"
import { join } from "path"
import pkg from "../package.json"
import { Script } from "@opencode/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)
const dryRun = process.env.MARSAI_PUBLISH_DRY_RUN === "1" || process.argv.includes("--dry-run")
const only = process.env.MARSAI_PUBLISH_ONLY
const root = process.env.OPENCODE_CLI_DIST ?? "./dist"
const launcherDir = join(root, "marscli")

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version --silent`.quiet().nothrow()).exitCode === 0
}

async function publish(dir: string, name: string, version: string) {
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  for (const archive of new Bun.Glob("*.tgz").scanSync({ cwd: dir })) {
    await rm(join(dir, archive), { force: true })
  }
  await $`bun pm pack`.cwd(dir)
  const archives = [...new Bun.Glob("*.tgz").scanSync({ cwd: dir })]
  if (archives.length !== 1) throw new Error(`Expected one tarball for ${name}, found ${archives.length}`)
  if (dryRun) return console.log(`packed ${name}@${version}`)
  if (await published(name, version)) return console.log(`already published ${name}@${version}`)
  const result = await $`npm publish ${archives[0]} --access public --tag ${Script.channel}`.cwd(dir).nothrow()
  if (result.exitCode === 0) return
  const output = `${result.stdout.toString()}\n${result.stderr.toString()}`
  if (output.includes("EOTP") || output.includes("E_STAGE_REQUIRED")) {
    throw new Error(`npm authorization cannot publish ${name}; use a direct-capable token or publish-time OTP`)
  }
  if (output.includes("E429") || output.includes("Too Many Requests") || output.includes("rate limited")) {
    throw new Error(
      `npm rate limited publication of ${name}; wait for the registry limit to clear and retry this package with MARSAI_PUBLISH_ONLY=${name}`,
    )
  }
  throw new Error(`Failed to publish ${name}@${version}`)
}

const expectedBinaries = [
  "linux-arm64",
  "linux-x64",
  "linux-x64-baseline",
  "linux-arm64-musl",
  "linux-x64-musl",
  "linux-x64-baseline-musl",
  "darwin-arm64",
  "darwin-x64",
  "darwin-x64-baseline",
  "windows-arm64",
  "windows-x64",
  "windows-x64-baseline",
].map((target) => `${pkg.name}-${target}`)
const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("**/package.json").scanSync({ cwd: root })) {
  if (filepath.startsWith("marscli/")) continue
  const item = await Bun.file(`${root}/${filepath}`).json()
  if (item.name === pkg.name) continue
  if (expectedBinaries.includes(item.name)) {
    const target = item.name.slice(pkg.name.length + 1)
    const command = `marscli-native-${target}`
    const executable = target.startsWith("windows-") ? "./bin/mars.exe" : "./bin/mars"
    if (Object.keys(item.bin ?? {}).length !== 1 || item.bin?.[command] !== executable) {
      throw new Error(`Invalid native bin metadata for ${item.name}; only the launcher may declare the mars command`)
    }
    const binaryName = target.startsWith("windows-") ? "mars.exe" : "mars"
    if (!(await Bun.file(`${root}/${item.name}/bin/${binaryName}`).exists())) {
      throw new Error(`Missing native binary for ${item.name}`)
    }
  }
  binaries[item.name] = item.version
}
console.log("binaries", binaries)
const missingBinaries = expectedBinaries.filter((name) => binaries[name] === undefined)
const unexpectedBinaries = Object.keys(binaries).filter((name) => !expectedBinaries.includes(name))
if (missingBinaries.length > 0) throw new Error(`Missing native packages: ${missingBinaries.join(", ")}`)
if (unexpectedBinaries.length > 0) throw new Error(`Unexpected native packages: ${unexpectedBinaries.join(", ")}`)
const versions = [...new Set(Object.values(binaries))]
if (versions.length !== 1 || !versions[0]) throw new Error("Native package versions are missing or inconsistent")
const version = versions[0]
if (version !== Script.version)
  throw new Error(`Artifact version ${version} does not match release version ${Script.version}`)
if (pkg.name !== "@mars_ai/marscli") throw new Error(`Unexpected launcher package name: ${pkg.name}`)
if (pkg.bin?.mars !== "./bin/mars.cjs") throw new Error("Launcher package must expose bin/mars.cjs as the mars command")
if (only && only !== pkg.name && !expectedBinaries.includes(only)) {
  throw new Error(`Unknown MARSAI_PUBLISH_ONLY package: ${only}`)
}

await rm(launcherDir, { recursive: true, force: true })
await $`mkdir -p ${launcherDir}/bin`
await $`cp ./bin/mars.cjs ${launcherDir}/bin/mars.cjs`
await $`cp ./LICENSE ${launcherDir}/LICENSE`
await $`cp ./README.md ${launcherDir}/README.md`
for (const name of Object.keys(binaries)) {
  await $`cp ./LICENSE ${root}/${name}/LICENSE`
}
await Bun.file(`${launcherDir}/package.json`).write(
  JSON.stringify(
    {
      name: pkg.name,
      bin: pkg.bin,
      files: ["bin", "README.md", "LICENSE"],
      version,
      description: pkg.description,
      license: pkg.license,
      homepage: pkg.homepage,
      ...(process.env.MARSAI_REPOSITORY_URL
        ? { repository: { type: "git", url: process.env.MARSAI_REPOSITORY_URL } }
        : {}),
      os: ["darwin", "linux", "win32"],
      cpu: ["arm64", "x64"],
      optionalDependencies: binaries,
      publishConfig: { access: "public" },
    },
    null,
    2,
  ),
)

const publishEntries = Object.entries(binaries)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, binaryVersion]) => [`${root}/${name}`, name, binaryVersion] as const)
if (!only || only !== pkg.name) {
  for (const [packageDir, name, binaryVersion] of publishEntries) {
    if (!only || only === name) await publish(packageDir, name, binaryVersion)
  }
}
if (!only || only === pkg.name) {
  if (!dryRun) {
    // npm can accept an upload before registry processing makes it retrievable.
    // Retry only metadata reads here, never an accepted native upload.
    const deadline = Date.now() + 10 * 60_000
    for (;;) {
      const checks = await Promise.all(
        Object.keys(binaries).map(async (name) => [name, await published(name, version)] as const),
      )
      const missing = checks.filter(([, isPublished]) => !isPublished).map(([name]) => name)
      if (missing.length === 0) break
      if (Date.now() >= deadline) {
        throw new Error(
          `Cannot publish ${pkg.name}; native dependencies are not yet available: ${missing.join(", ")}. Resume with MARSAI_PUBLISH_ONLY=${pkg.name} after registry processing finishes`,
        )
      }
      console.log(
        `Waiting for npm processing: ${checks.length - missing.length}/${checks.length} native packages available`,
      )
      await Bun.sleep(30_000)
    }
  }
  await publish(launcherDir, pkg.name, version)
}

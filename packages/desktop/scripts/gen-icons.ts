#!/usr/bin/env bun
//
// Generate the Mars Desktop desktop icon set from a single MarsAI 1024x1024 PNG.
//
// Replaces the inherited OpenCode logo in packages/desktop/icons/<channel>/ with the
// Mars mark. Produces every PNG size electron-builder + the OS launchers need, plus the
// multi-size Windows .ico and the macOS .icns container (both are PNG-in-container).
//
// Usage: bun ./scripts/gen-icons.ts <source.png> [channel]
//   <source.png>  absolute path to a 1024x1024 Mars logo (defaults to IICONS iOS AppIcon-1024)
//   [channel]     prod | beta | dev | all  (default: all)

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const packageDir = path.resolve(import.meta.dir, "..")

const source =
  process.argv[2] ??
  "C:/xampp/htdocs/router/APPS/IICONS/iOS/AppIcon.appiconset/AppIcon-1024.png"

const channelArg = process.argv[3] ?? "all"
const channels = channelArg === "all" ? ["prod", "beta", "dev"] : [channelArg]

// Desktop PNG sizes electron-builder + Windows store tiles + Linux hicolor need.
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
// Windows Store tile assets (names match the inherited set).
const STORE_TILES = [30, 44, 71, 89, 107, 142, 150, 284, 310]
// ICO embeds these sizes (PNG-compressed, Vista+).
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

async function pngBuf(size: number) {
  return sharp(source).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
}

// Build a multi-image .ico. Each image is a PNG; the ICO header points at each blob.
function buildIco(images: { size: number; data: Buffer }[]) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(count, 4)

  const dirSize = 16 * count
  let offset = 6 + dirSize
  const dirs: Buffer[] = []
  const blobs: Buffer[] = []
  for (const img of images) {
    const dir = Buffer.alloc(16)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, 0) // width (0 = 256)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, 1) // height
    dir.writeUInt8(0, 2) // palette
    dir.writeUInt8(0, 3) // reserved
    dir.writeUInt16LE(1, 4) // color planes
    dir.writeUInt16LE(32, 6) // bpp
    dir.writeUInt32LE(img.data.length, 8) // bytes
    dir.writeUInt32LE(offset, 12) // offset
    dirs.push(dir)
    blobs.push(img.data)
    offset += img.data.length
  }
  return Buffer.concat([header, ...dirs, ...blobs])
}

// Build an .icns. Modern entries store PNG data under typed chunks.
async function buildIcns() {
  // icns chunk type -> source png size it should contain
  const chunks: Array<[string, number]> = [
    ["icp4", 16], // 16x16
    ["icp5", 32], // 32x32
    ["icp6", 64], // 64x64 (nonstandard but accepted)
    ["ic07", 128], // 128x128
    ["ic08", 256], // 256x256
    ["ic09", 512], // 512x512
    ["ic10", 1024], // 512x512@2x / 1024
    ["ic11", 32], // 16x16@2x
    ["ic12", 64], // 32x32@2x
    ["ic13", 256], // 128x128@2x
    ["ic14", 512], // 256x256@2x
  ]
  const parts: Buffer[] = []
  for (const [type, size] of chunks) {
    const data = await pngBuf(size)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length + 8, 0)
    parts.push(Buffer.from(type, "ascii"), len, data)
  }
  const body = Buffer.concat(parts)
  const total = Buffer.alloc(4)
  total.writeUInt32BE(body.length + 8, 0)
  return Buffer.concat([Buffer.from("icns", "ascii"), total, body])
}

async function generate(channel: string) {
  const outDir = path.join(packageDir, "icons", channel)
  await mkdir(outDir, { recursive: true })

  // Canonical PNGs
  for (const size of PNG_SIZES) {
    await writeFile(path.join(outDir, `${size}x${size}.png`), await pngBuf(size))
  }
  await writeFile(path.join(outDir, "128x128@2x.png"), await pngBuf(256))
  await writeFile(path.join(outDir, "icon.png"), await pngBuf(1024))
  await writeFile(path.join(outDir, "dock.png"), await pngBuf(512))

  // Windows Store tiles
  for (const size of STORE_TILES) {
    await writeFile(path.join(outDir, `Square${size}x${size}Logo.png`), await pngBuf(size))
  }
  await writeFile(path.join(outDir, "StoreLogo.png"), await pngBuf(50))

  // icon.ico
  const icoImages = await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await pngBuf(size) })))
  await writeFile(path.join(outDir, "icon.ico"), buildIco(icoImages))

  // icon.icns
  await writeFile(path.join(outDir, "icon.icns"), await buildIcns())

  console.log(`generated ${channel} icons -> ${outDir}`)
}

for (const channel of channels) {
  await generate(channel)
}

/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { Logo } from "../src/component/logo"
import { logo } from "../src/logo"
import { ConfigProvider } from "../src/config"
import { ThemeProvider } from "../src/context/theme"
import { emptyThemeSource, tmpdir } from "./fixture/fixture"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

const marsRows = [
  "███╗   ███╗ █████╗ ██████╗ ███████╗",
  "████╗ ████║██╔══██╗██╔══██╗██╔════╝",
  "██╔████╔██║███████║██████╔╝███████╗",
  "██║╚██╔╝██║██╔══██║██╔══██╗╚════██║",
  "██║ ╚═╝ ██║██║  ██║██║  ██║███████║",
]

test("defines a wordmark and badge", () => {
  expect(logo.mars).toEqual(marsRows)
  expect(logo.cli).toEqual(["CLI", "●", "V2"])
  expect(logo.mars.every((row) => row.length === logo.mars[0].length)).toBe(true)
})

test("renders the wordmark with rule + badge on wide terminals", async () => {
  await using temporary = await tmpdir()
  const app = await testRender(
    () => (
      <TestTuiContexts directory={temporary.path} paths={{ state: temporary.path }}>
        <ConfigProvider config={createTuiResolvedConfig()}>
          <ThemeProvider mode="dark" source={emptyThemeSource}>
            <box width="100%" height={7} alignItems="center">
              <Logo />
            </box>
          </ThemeProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: 80, height: 10 },
  )

  try {
    await app.waitForFrame((frame) => frame.includes("V2"))
    const frame = app.captureCharFrame()
    for (const row of marsRows) expect(frame).toContain(row)
    expect(frame).toContain("CLI")
    expect(frame).toContain("V2")
  } finally {
    app.renderer.destroy()
  }
})

test("renders the compact letter block on narrow terminals", async () => {
  await using temporary = await tmpdir()
  const app = await testRender(
    () => (
      <TestTuiContexts directory={temporary.path} paths={{ state: temporary.path }}>
        <ConfigProvider config={createTuiResolvedConfig()}>
          <ThemeProvider mode="dark" source={emptyThemeSource}>
            <box width="100%" height={7} alignItems="center">
              <Logo />
            </box>
          </ThemeProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: 40, height: 10 },
  )

  try {
    await app.waitForFrame((frame) => frame.includes(marsRows[0]))
    const frame = app.captureCharFrame()
    for (const row of marsRows) expect(frame).toContain(row)
    expect(frame).not.toContain("V2")
  } finally {
    app.renderer.destroy()
  }
})

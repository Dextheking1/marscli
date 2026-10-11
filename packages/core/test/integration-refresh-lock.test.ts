import { describe, expect, test } from "bun:test"
import { Integration } from "@opencode/core/integration"

describe("refreshSingleFlight", () => {
  test("serializes concurrent sections and runs each", async () => {
    let running = 0
    let maxConcurrent = 0
    const run = (value: number) =>
      Integration.refreshSingleFlight("cred-1", async () => {
        running++
        maxConcurrent = Math.max(maxConcurrent, running)
        await Bun.sleep(5)
        running--
        return value
      })
    const results = await Promise.all([run(1), run(2), run(3)])
    expect(results).toEqual([1, 2, 3])
    expect(maxConcurrent).toBe(1)
  })

  test("a failing section does not poison the chain", async () => {
    await Promise.allSettled([
      Integration.refreshSingleFlight("cred-2", async () => {
        throw new Error("boom")
      }),
    ])
    const value = await Integration.refreshSingleFlight("cred-2", async () => "recovered")
    expect(value).toBe("recovered")
  })

  test("independent credentials do not block each other", async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    let maxConcurrent = 0
    let running = 0
    const run = (id: string) =>
      Integration.refreshSingleFlight(id, async () => {
        running++
        maxConcurrent = Math.max(maxConcurrent, running)
        if (id === "a") await gate
        running--
        return id
      })
    const first = run("a")
    const second = await run("b")
    release?.()
    expect(await first).toBe("a")
    expect(second).toBe("b")
    expect(maxConcurrent).toBe(2)
  })
})

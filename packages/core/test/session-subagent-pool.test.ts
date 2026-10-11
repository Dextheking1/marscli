import { expect, test } from "bun:test"
import { SubagentPool } from "@opencode/core/session/subagent-pool"

const mars = (id: string) => ({ providerID: "marsai", id })
const other = (providerID: string, id: string) => ({ providerID, id })

test("pool matcher keeps only free/subagent marsai models", () => {
  const models = [mars("MarsAI-subagent-free"), other("anthropic", "claude"), mars("mars-auto1-free"), mars("mars-pro")]
  expect(SubagentPool.from(models).map((model) => model.id)).toEqual(["MarsAI-subagent-free", "mars-auto1-free"])
  expect(SubagentPool.isPoolModel(other("marsai-clone", "x-free"))).toBe(false)
})

test("next round-robins per call", () => {
  const pool = [mars("a-free"), mars("b-free"), mars("c-free")]
  expect([SubagentPool.next(pool)?.id, SubagentPool.next(pool)?.id, SubagentPool.next(pool)?.id]).toEqual([
    "a-free",
    "b-free",
    "c-free",
  ])
  expect(SubagentPool.next(pool)?.id).toBe("a-free")
  expect(SubagentPool.next([])).toBeUndefined()
})

test("escalate prefers remaining pool models before paid marsai", () => {
  const available = [mars("a-free"), mars("b-free"), mars("mars-pro"), other("openai", "gpt")]
  const first = SubagentPool.escalate(mars("a-free"), available)
  expect(first?.id).not.toBe("a-free")
  expect(first && SubagentPool.isPoolModel(first)).toBe(true)
  // Removing every other pool model falls through to the paid marsai model.
  const paid = SubagentPool.escalate(mars("a-free"), [mars("a-free"), mars("mars-pro"), other("openai", "gpt")])
  expect(paid?.id).toBe("mars-pro")
  // No marsai fallback at all.
  expect(SubagentPool.escalate(mars("a-free"), [other("openai", "gpt")])).toBeUndefined()
})

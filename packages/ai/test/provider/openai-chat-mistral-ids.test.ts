import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { LLM, Message, ToolCallPart } from "../../src/index.js"
import { OpenAICompatible } from "../../src/providers.js"
import { compileRequest } from "../../src/route/client.js"
import { it } from "../lib/effect.js"

const gateway = OpenAICompatible.configure({
  provider: "magpie",
  baseURL: "https://magpie.test/v1/",
  apiKey: "test-key",
})

const history = (ids: string[]) => [
  Message.user("Read every label"),
  Message.assistant(ids.map((id, index) => ToolCallPart.make({ id, name: "lookup", input: { label: index } }))),
  ...ids.map((id, index) => Message.tool({ id, name: "lookup", result: `value-${index}` })).toReversed(),
]

const Json = Schema.fromJsonString(Schema.Unknown)
const decodeJson = Schema.decodeUnknownSync(Json)
const encodeJson = Schema.encodeSync(Json)

const loweredIDs = (body: unknown) => {
  const decoded = decodeJson(encodeJson(body))
  if (typeof decoded !== "object" || decoded === null || !("messages" in decoded) || !Array.isArray(decoded.messages))
    throw new Error("Expected a lowered chat body")
  const calls: string[] = []
  const results: string[] = []
  for (const message of decoded.messages) {
    if (typeof message !== "object" || message === null) continue
    if ("tool_calls" in message && Array.isArray(message.tool_calls))
      for (const call of message.tool_calls)
        if (typeof call === "object" && call !== null && "id" in call && typeof call.id === "string") calls.push(call.id)
    if ("tool_call_id" in message && typeof message.tool_call_id === "string") results.push(message.tool_call_id)
  }
  return { calls, results }
}

for (const model of ["mistral/zai-glm-5-3-flash", "mistral/mistral-large-4-0"]) {
  it.effect(`keeps shared-prefix tool call IDs distinct for ${model}`, () =>
    Effect.gen(function* () {
      const ids = ["chatcmpl-tool-99557ad68a6e6efc", "chatcmpl-tool-1234567890abcdef", "Ab12Cd34E", "a"]
      const messages = history(ids)
      const before = structuredClone(messages)
      const input = LLM.request({ model: gateway.model(model), messages, cache: "none" })
      const prepared = yield* compileRequest(input)
      const { calls, results } = loweredIDs(prepared.body)
      expect(calls).toHaveLength(ids.length)
      expect(new Set(calls).size).toBe(ids.length)
      calls.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9]{9}$/))
      expect(results).toEqual(calls.toReversed())
      expect(calls).toContain("Ab12Cd34E")
      expect((yield* compileRequest(input)).body).toEqual(prepared.body)
      expect(structuredClone(messages)).toEqual(before)
    }),
  )
}

it.effect("leaves tool call IDs unchanged for non-Mistral models", () =>
  Effect.gen(function* () {
    const ids = ["chatcmpl-tool-99557ad68a6e6efc", "chatcmpl-tool-1234567890abcdef", "Ab12Cd34E"]
    const prepared = yield* compileRequest(
      LLM.request({ model: gateway.model("some-other-model"), messages: history(ids), cache: "none" }),
    )
    const { calls, results } = loweredIDs(prepared.body)
    expect(calls).toEqual(ids)
    expect(results).toEqual(ids.toReversed())
  }),
)

import { Effect } from "effect"
import { Stream } from "effect"
import { describe, expect, it } from "bun:test"

// Extracted decision logic mirrors aisdk.ts splitThinkDeltas: we verify the pure
// segmentation contract here without pulling the whole LLM stack.
const THINK_OPEN = "<think>"
const THINK_CLOSE = "</think>"

type Seg = { channel: "text" | "reasoning"; text: string }

function segment(input: string): Array<Seg> {
  const out: Array<Seg> = []
  let mode: "text" | "think" = "text"
  for (const chunk of input.split(/(<\/?think>)/)) {
    if (chunk === THINK_OPEN) {
      mode = "think"
      continue
    }
    if (chunk === THINK_CLOSE) {
      mode = "text"
      continue
    }
    if (chunk !== "") out.push({ channel: mode === "think" ? "reasoning" : "text", text: chunk })
  }
  return out
}

describe("think tag segmentation", () => {
  it("routes <think> blocks to reasoning, rest to text", () => {
    expect(segment("<think>let me plan</think>hey, what needs doing?")).toEqual([
      { channel: "reasoning", text: "let me plan" },
      { channel: "text", text: "hey, what needs doing?" },
    ])
  })
  it("leaves untagged text alone", () => {
    expect(segment("plain answer")).toEqual([{ channel: "text", text: "plain answer" }])
  })
  it("handles multiple blocks", () => {
    expect(segment("a<think>x</think>b<think>y</think>c")).toEqual([
      { channel: "text", text: "a" },
      { channel: "reasoning", text: "x" },
      { channel: "text", text: "b" },
      { channel: "reasoning", text: "y" },
      { channel: "text", text: "c" },
    ])
  })
})

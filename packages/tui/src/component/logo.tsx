import { RGBA, TextAttributes } from "@opentui/core"
import { For, Show, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { logo } from "../logo"

// Vertical gradient over the wordmark rows: light orange → deep red.
const gradient = ["#fdba74", "#fb923c", "#f97316", "#ea580c", "#dc2626"]

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const renderLine = (line: string, fg: RGBA, bold = true): JSX.Element[] => {
    const attrs = bold ? TextAttributes.BOLD : undefined
    return Array.from(line).map((char) => (
      <text fg={fg} attributes={attrs} selectable={false}>
        {char}
      </text>
    ))
  }

  // Wordmark + rule + badge is ~44 columns; below that fall back to plain rows.
  const compact = () => dimensions().width < 46

  return (
    <Show
      when={!compact()}
      fallback={
        <box flexDirection="column" alignItems="center">
          <For each={logo.mars}>{(line) => <box flexDirection="row">{renderLine(line, RGBA.fromHex(gradient[2]))}</box>}</For>
        </box>
      }
    >
      <box flexDirection="row" gap={2} alignItems="center">
        <box flexDirection="column">
          <For each={logo.mars}>
            {(line, index) => (
              <box flexDirection="row">{renderLine(line, RGBA.fromHex(gradient[index()] ?? gradient[2]))}</box>
            )}
          </For>
        </box>
        <box flexDirection="column" alignSelf="stretch">
          <For each={logo.mars}>{() => <text fg={theme.border.base}>│</text>}</For>
        </box>
        <box flexDirection="column" justifyContent="center">
          <text fg={theme.text.muted} attributes={TextAttributes.BOLD} selectable={false}>
            {logo.cli[0]}
          </text>
          <text fg={RGBA.fromHex("#ef4444")} selectable={false}>
            {logo.cli[1]}
          </text>
          <text fg={RGBA.fromHex(gradient[2])} attributes={TextAttributes.BOLD} selectable={false}>
            {logo.cli[2]}
          </text>
        </box>
      </box>
    </Show>
  )
}

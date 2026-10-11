import { Plugin } from "@opencode/plugin/tui"
import { createMemo, For, onMount, Show } from "solid-js"
import { errorMessage } from "../../util/error"

// Per-model latency measured by the service through the resolved credential. Persisted so
// the picker can rank fastest-first and the ranking survives restarts.
type SpeedStore = { ms: Record<string, number>; probedAt?: number }

function useSpeed(context: Plugin.Context) {
  const [store, update] = context.storage.store<SpeedStore>("mars.model-speed", { initial: { ms: {} } })
  const key = (providerID: string, modelID: string) => `${providerID}/${modelID}`
  return { store, update, key }
}

function AccountInfo(props: { context: Plugin.Context }) {
  const integrations = createMemo(() => props.context.data.location.integration.list(props.context.location) ?? [])
  const mars = createMemo(() => integrations().find((item) => item.id === "marsai"))
  const connection = createMemo(() => mars()?.connections?.[0])
  const label = createMemo(() => {
    const value = connection()
    return (value?.type === "credential" && value.label) || "MarsAI account"
  })
  return (
    <Show when={connection()}>
      <box paddingBottom={1}>
        <text fg={props.context.theme.text.base}>
          <b>Account</b>
        </text>
        <text fg={props.context.theme.text.muted}>{label()}</text>
      </box>
    </Show>
  )
}

function AgentActivity(props: { context: Plugin.Context; sessionID: string }) {
  const status = createMemo(() => props.context.data.session.status(props.sessionID))
  return (
    <Show when={status() === "running"}>
      <box paddingBottom={1}>
        <text fg={props.context.theme.text.base}>
          <b>Agent</b>
        </text>
        <text fg={props.context.theme.text.feedback.success.base}>running</text>
      </box>
    </Show>
  )
}

function Tokens(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  // Root-session assistant messages only: subagent tokens live in child sessions, never here.
  const burn = (tokens: { input: number; output: number; reasoning: number; cache?: { read?: number; write?: number } } | undefined) =>
    tokens ? tokens.input + tokens.output + tokens.reasoning + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0) : 0
  const messages = createMemo(() =>
    props.context.data.session.message.list(props.sessionID).filter((message) => message.type === "assistant"),
  )
  const format = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`)
  const total = createMemo(() => messages().reduce((sum, message) => sum + burn(message.tokens), 0))
  const last = createMemo(() => burn(messages().at(-1)?.tokens))
  return (
    <Show when={total() > 0}>
      <box paddingBottom={1}>
        <text fg={theme.text.base}>
          <b>Tokens</b>
        </text>
        <text fg={theme.text.muted} wrapMode="none">
          session <span style={{ fg: theme.text.base }}>{format(total())}</span>
        </text>
        <text fg={theme.text.muted} wrapMode="none">
          last <span style={{ fg: theme.text.base }}>{format(last())}</span>
        </text>
      </box>
    </Show>
  )
}

function Subagents(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  // Live events teach the store about child sessions, but only until restart: reload the
  // family so finished subagents from earlier turns still show up.
  onMount(() => {
    props.context.data.session.sync(props.sessionID, { children: true }).catch(() => {})
  })
  const models = createMemo(() => {
    const grouped = new Map<string, { model: string; running: number; title: string }>()
    for (const session of props.context.data.session.list()) {
      if (session.parentID !== props.sessionID) continue
      const model = session.model?.id.replace(/^subagent\//, "") ?? session.agent ?? "subagent"
      const entry = grouped.get(model) ?? { model, running: 0, title: "" }
      if (props.context.data.session.status(session.id) === "running") {
        entry.running++
        const title = (session.title ?? "").slice(0, 24)
        if (title && !entry.title) entry.title = title
      }
      grouped.set(model, entry)
    }
    return [...grouped.values()].toSorted((a, b) => b.running - a.running).slice(0, 5)
  })
  return (
    <Show when={models().length > 0}>
      <box paddingBottom={1}>
        <text fg={theme.text.base}>
          <b>Subagents</b>
        </text>
        <For each={models()}>
          {(entry) => (
            <box flexDirection="row" gap={1}>
              <text fg={entry.running > 0 ? theme.text.feedback.success.base : theme.text.muted}>
                {entry.running > 0 ? "✓" : "○"}
              </text>
              <text fg={entry.running > 0 ? theme.text.base : theme.text.muted} wrapMode="none">
                {entry.title || entry.model}
              </text>
              <Show when={entry.title}>
                <text fg={entry.running > 0 ? theme.text.feedback.success.base : theme.text.muted} wrapMode="none">
                  {entry.model}
                  {entry.running > 1 ? ` ×${entry.running}` : ""}
                </text>
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

function Fastest(props: { context: Plugin.Context; models: () => ReadonlyArray<{ providerID: string; id: string; name: string }> }) {
  const speed = useSpeed(props.context)
  const theme = props.context.theme
  const ranked = createMemo(() =>
    props
      .models()
      .map((m) => ({ ...m, ms: speed.store.ms[speed.key(m.providerID, m.id)] }))
      .filter((m) => m.ms !== undefined)
      .sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0)),
  )
  return (
    <Show when={ranked().length > 0}>
      <box paddingBottom={1}>
        <text fg={theme.text.base}>
          <b>Fastest</b>
        </text>
        <For each={ranked().slice(0, 3)}>
          {(model, i) => (
            <box flexDirection="row" gap={1}>
              <text fg={theme.text.muted}>{i() + 1}.</text>
              <text fg={theme.text.base}>{model.name}</text>
              <text fg={theme.text.muted}>{model.ms}ms</text>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "marsai.sidebar",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (slot) => {
        const models = createMemo(
          () => context.data.location.model.list(context.data.session.get(slot.sessionID)?.location ?? context.location) ?? [],
        )
        return (
          <>
            <AccountInfo context={context} />
            <Tokens context={context} sessionID={slot.sessionID} />
            <AgentActivity context={context} sessionID={slot.sessionID} />
            <Subagents context={context} sessionID={slot.sessionID} />
            <Fastest context={context} models={models} />
          </>
        )
      },
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "mars.healthcheck",
          title: "Health check models",
          group: "Mars",
          slash: { name: "healthcheck" },
          palette: true,
          async run() {
            const speed = useSpeed(context)
            context.ui.toast.show({ variant: "info", message: "Checking model speed…" })
            try {
              const result = await context.client.model.probe({ location: context.location })
              const rows = result.data ?? []
              await speed.update((draft) => {
                for (const row of rows) {
                  if (row.ok) draft.ms[speed.key(row.providerID, row.modelID)] = row.ms
                }
                draft.probedAt = Date.now()
              })
              context.ui.toast.show({ variant: "success", message: "Model speed updated" })
            } catch (error) {
              context.ui.toast.show({ variant: "error", message: errorMessage(error) })
            }
          },
        },
      ],
    }))
  },
})

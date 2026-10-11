export * as SubagentPool from "./subagent-pool.js"

// MarsCLI free-model rotation: MarsAI models whose id contains "subagent" or "free" form the
// subagent pool. Spawned subagents round-robin across it and fail fast so the runner can
// escalate to the next candidate instead of waiting out retries on a dead free model.

export const isPoolModel = (model: { readonly providerID: string; readonly id: string }) =>
  model.providerID === "marsai" && /subagent|free/i.test(model.id)

export function from<T extends { readonly providerID: string; readonly id: string; readonly status?: string }>(
  models: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return models.filter((model) => isPoolModel(model) && model.status !== "deprecated")
}

let index = 0

/** Round-robin pick over an already-filtered pool. */
export function next<T>(pool: ReadonlyArray<T>): T | undefined {
  if (pool.length === 0) return undefined
  const item = pool[index % pool.length]
  index = Number.isSafeInteger(index + 1) ? index + 1 : 0
  return item
}

/**
 * Fail-fast escalation order for an exhausted pool model: remaining pool models first
 * (round-robin), then paid MarsAI models. `undefined` means no MarsAI fallback exists.
 */
export function escalate<T extends { readonly providerID: string; readonly id: string }>(
  current: { readonly providerID: string; readonly id: string },
  available: ReadonlyArray<T>,
): T | undefined {
  const mars = available.filter((model) => model.providerID === current.providerID)
  const pool = mars.filter((model) => isPoolModel(model) && model.id !== current.id)
  if (pool.length > 0) return next(pool)
  return mars.find((model) => !isPoolModel(model))
}

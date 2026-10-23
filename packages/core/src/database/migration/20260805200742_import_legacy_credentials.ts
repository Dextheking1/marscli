import { readFile, rename } from "node:fs/promises"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Credential } from "@opencode/schema/credential"
import { Integration } from "@opencode/schema/integration"
import { NonNegativeInt } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Secret } from "../../util/secret.js"
import type { DatabaseMigration } from "../migration.js"

const LegacyOAuth = Schema.Struct({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String),
})
const LegacyKey = Schema.Struct({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
const LegacyWellKnown = Schema.Struct({
  type: Schema.Literal("wellknown"),
  key: Schema.String,
  token: Schema.String,
})
const LegacyValue = Schema.Union([LegacyOAuth, LegacyKey, LegacyWellKnown])
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const decodeValue = Schema.decodeUnknownOption(LegacyValue)
const wellKnownSourcesKey = "wellknown:sources"

const migration: DatabaseMigration.Migration = {
  id: "20260805200742_import_legacy_credentials",
  up(tx) {
    return Effect.gen(function* () {
      const global = yield* Global.Service
      // Best-effort import: any unexpected failure must not abort the migration and brick startup.
      return yield* importLegacyCredentials(tx, path.join(global.data, "auth.json")).pipe(
        Effect.catchCause((cause) => Effect.logWarning("legacy credential import failed; continuing", { cause })),
      )
    })
  },
}

export default migration

export function importLegacyCredentials(tx: Parameters<DatabaseMigration.Migration["up"]>[0], filepath: string) {
  return Effect.gen(function* () {
    const content = yield* Effect.promise(() => readFile(filepath, "utf8").catch(() => undefined))
    if (content === undefined) return
    // A broken legacy credential file must never brick startup: park it aside and skip the import.
    const park = Effect.gen(function* () {
      yield* Effect.logWarning("legacy credential file is invalid; skipping import", { filepath })
      yield* Effect.promise(() => rename(filepath, `${filepath}.import-failed`).catch(() => {}))
    })
    // MarsCLI v1 encrypted the whole auth.json (enc:v1: prefix) instead of individual values.
    const plain =
      content.trimStart().startsWith("enc:v1:")
        ? yield* Effect.try(() => Secret.decrypt(content.trim())).pipe(Effect.catchCause(() => park.pipe(Effect.as(undefined))))
        : content
    if (plain === undefined) return
    const input = Option.getOrUndefined(decodeJson(plain))
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return yield* park
    }

    const origins: string[] = []
    for (const [id, raw] of Object.entries(input)) {
      const value = Option.getOrUndefined(decodeValue(raw))
      if (!value) continue
      // MarsCLI v1 stored the MarsAI grant under "opencode" (or legacy "marsai"); both map to the MarsAI integration.
      const legacy = id.replace(/\/+$/, "")
      const integrationID = legacy === "opencode" || legacy === "marsai" ? "marsai" : legacy
      if (!integrationID) continue
      if (value.type === "wellknown") origins.push(integrationID)
      if (yield* tx.get(sql`SELECT id FROM credential WHERE integration_id = ${integrationID}`)) continue

      const credential =
        value.type === "api"
          ? Credential.Key.make({
              type: "key",
              key: value.key,
              // A legacy `server` value is file-controlled text and no first-party
              // writer sets one on a key credential. Carrying it through would let
              // an imported file point the stored key at an arbitrary host, so drop
              // it here: imported keys use the configured default server.
              metadata: value.metadata
                ? Object.fromEntries(Object.entries(value.metadata).filter(([name]) => name !== "server"))
                : undefined,
            })
          : value.type === "wellknown"
            ? Credential.Key.make({ type: "key", key: value.token })
            : Credential.OAuth.make({
                type: "oauth",
                methodID: Integration.MethodID.make(methodID(integrationID)),
                refresh: value.refresh,
                access: value.access,
                expires: value.expires,
                metadata:
                  value.accountId || value.enterpriseUrl
                    ? {
                        ...(value.accountId ? { accountID: value.accountId } : {}),
                        ...(value.enterpriseUrl ? { enterpriseUrl: value.enterpriseUrl } : {}),
                      }
                    : undefined,
              })
      const label = credential.type === "oauth" ? "OAuth" : "API key"
      const now = Date.now()
      // Raw SQL bypasses drizzle's json-mode serializer, so apply it explicitly: the column
      // stores a JSON-encoded string, which the read path decrypts when prefixed enc:v1:.
      const stored = JSON.stringify(Secret.encrypt(JSON.stringify(credential)))
      yield* tx.run(sql`
        INSERT INTO credential (id, integration_id, label, value, time_created, time_updated)
        VALUES (${Credential.ID.create()}, ${integrationID}, ${label}, ${stored}, ${now}, ${now})
      `)
    }

    if (!origins.length) return
    const stored = yield* tx.get<{ value: string }>(sql`SELECT value FROM kv WHERE key = ${wellKnownSourcesKey}`)
    const decoded = stored ? Option.getOrUndefined(decodeJson(stored.value)) : undefined
    const current = Array.isArray(decoded) ? decoded.filter((item): item is string => typeof item === "string") : []
    const value = JSON.stringify(Array.from(new Set([...current, ...origins])))
    const now = Date.now()
    yield* tx.run(sql`
      INSERT INTO kv (key, value, time_created, time_updated)
      VALUES (${wellKnownSourcesKey}, ${value}, ${now}, ${now})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, time_updated = excluded.time_updated
    `)
  })
}

function methodID(integrationID: string) {
  if (integrationID === "openai") return "chatgpt-browser"
  if (["github-copilot", "opencode", "marsai", "xai"].includes(integrationID)) return "device"
  return "oauth"
}

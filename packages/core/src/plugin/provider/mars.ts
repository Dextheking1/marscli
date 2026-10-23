import { Duration, Effect, Schema, Semaphore, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Scope } from "effect"
import { define } from "@opencode/plugin/effect/plugin"
import { Model as ModelSchema } from "@opencode/schema/model"
import { Money } from "@opencode/schema/money"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Provider } from "../../provider.js"

const fallbackServer = "https://marsai.click"

function normalizeServer(raw: string) {
  try {
    const url = new URL(raw)
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]"
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return undefined
    return `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "")}`
  } catch {
    return undefined
  }
}

// MARSAI_URL gets the same check as a credential server. Without it the
// fallback itself could point the key at a remote host over plaintext http.
const defaultServer = (process.env.MARSAI_URL ? normalizeServer(process.env.MARSAI_URL) : undefined) ?? fallbackServer
const integrationID = Integration.ID.make("marsai")
const providerID = Provider.ID.make("marsai")
const ModelsResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      created: Schema.optional(Schema.Finite),
      owned_by: Schema.optional(Schema.String),
      access: Schema.optional(Schema.String),
      label: Schema.optional(Schema.String),
      usage_ratio: Schema.optional(Schema.Finite),
      context_tokens: Schema.optional(Schema.Finite),
    }),
  ),
})

function serverUrl(value: Credential.Key) {
  const raw = value.metadata?.server
  if (typeof raw !== "string") return defaultServer
  return normalizeServer(raw) ?? defaultServer
}

function modelsFor(http: HttpClient.HttpClient, value: Credential.Key) {
  return http
    .execute(
      HttpClientRequest.get(`${serverUrl(value)}/v1/models`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(value.key),
      ),
    )
    .pipe(
      Effect.flatMap((response) =>
        response.status !== 200
          ? Effect.flatMap(response.text, (body) =>
              Effect.fail(new Error(`GET /v1/models ${response.status}: ${body.slice(0, 300)}`)),
            )
          : HttpClientResponse.schemaBodyJson(ModelsResponse)(response).pipe(
              Effect.map((remote) => remote.data),
            ),
      ),
    )
}

export const MarsPlugin = define<HttpClient.HttpClient | Bus.Service | Scope.Scope>({
  id: "marsai.provider.marsai",
  effect: Effect.fn(function* (ctx) {
    const bus = yield* Bus.Service
    const http = yield* HttpClient.HttpClient
    const loading = Semaphore.makeUnsafe(1)

    const load = Effect.fn("MarsPlugin.load")(function* () {
      const connection = yield* ctx.integration.connection.active(integrationID)
      if (!connection) return undefined
      return yield* ctx.integration.connection.resolve(connection).pipe(
        Effect.flatMap((credential) => {
          // OAuth credentials are legacy — v2.0.6+ uses API keys only. Mark them
          // needs_auth so the user re-logs with a pasted key; `single: true` swaps it in.
          if (credential?.type === "oauth") {
            return ctx.integration.connection
              .status({
                integrationID,
                connection,
                status: {
                  status: "needs_auth",
                  message: "MarsAI sign-in changed to API keys. Run /login and paste your key from the MarsAI dashboard.",
                },
              })
              .pipe(Effect.as(undefined))
          }
          return credential && credential.type === "key" ? modelsFor(http, credential) : Effect.succeed(undefined)
        }),
        Effect.tap(() => ctx.integration.connection.status({ integrationID, connection, status: undefined })),
        Effect.catch((cause) =>
          Effect.gen(function* () {
            // A rejected key or a 401/403 on the model list means the stored credential is
            // unusable. Mark it needs_auth so the UI offers /login instead of an empty catalog.
            if (
              cause instanceof Integration.AuthorizationError ||
              (cause instanceof Error && /\b(401|403)\b/.test(cause.message))
            ) {
              yield* ctx.integration.connection.status({
                integrationID,
                connection,
                status: { status: "needs_auth", message: "MarsAI key rejected. Run /login to paste a new one." },
              })
            }
            return yield* Effect.logWarning("failed to load MarsAI models", { cause }).pipe(Effect.as(undefined))
          }),
        ),
      )
    })

    const apply = (models: typeof ModelsResponse.Type.data | undefined) =>
      Effect.gen(function* () {
        yield* ctx.provider.transform((providers) => {
          providers.remove(providerID)
          providers.add({
            info: {
              id: providerID,
              name: "MarsAI",
              integrationID,
              activation: "enabled",
              // The @opencode/ai wrapper exports model(modelID, settings) and is bundled;
              // the raw @ai-sdk/openai-compatible package only exports a factory.
              package: "@opencode/ai/providers/openai-compatible",
              settings: { baseURL: `${defaultServer}/v1`, apiKey: process.env.MARSAI_API_KEY ?? "public" },
            },
            models: (models ?? []).map((item) => {
              const model: ModelSchema.Info = {
                ...ModelSchema.Info.default(providerID, ModelSchema.ID.make(item.id)),
                // The endpoint's `label` is a category tag ("Free", "Subagent"), not a name; the id is the real one.
                name: item.id,
                capabilities: { tools: true, input: ["text"], output: ["text"] },
                cost: [
                  {
                    input: Money.USDPerMillionTokens.zero,
                    output: Money.USDPerMillionTokens.zero,
                    cache: { read: Money.USDPerMillionTokens.zero, write: Money.USDPerMillionTokens.zero },
                  },
                ],
                status: "active",
                enabled: true,
                limit: {
                  context:
                    item.context_tokens !== undefined && item.context_tokens > 0
                      ? Math.floor(item.context_tokens)
                      : 128000,
                  output: 8192,
                },
                time: { released: item.created ? item.created * 1000 : 0 },
                body: {
                  mars_access: item.access === "free" ? "free" : "paid",
                  ...(item.label ? { mars_label: item.label } : {}),
                  ...(item.usage_ratio !== undefined ? { mars_usage_ratio: item.usage_ratio } : {}),
                },
              }
              return model
            }),
          })
        })
      })

    yield* ctx.integration.transform((editor) => {
      editor.update(integrationID, (integration) => {
        integration.name = "MarsAI"
        // Consumer integration: exactly one account, new sign-ins replace the old credential.
        integration.metadata = { ...integration.metadata, single: true }
      })
      editor.method.update({
        integrationID,
        method: {
          type: "key",
          label: "MarsAI API key",
        },
      })
    })

    const initial = yield* load()
    yield* apply(initial)
    const refresh = () => loading.withPermit(load().pipe(Effect.flatMap((next) => apply(next))))
    yield* bus.subscribe(Credential.Event.Switched).pipe(
      Stream.filter((event) => event.data.integrationID === integrationID),
      Stream.runForEach(refresh),
      Effect.forkScoped({ startImmediately: true }),
    )
    // Model inventory changes server-side (new free models, rotated IDs), so re-fetch periodically.
    yield* Effect.sleep(Duration.minutes(1)).pipe(Effect.andThen(refresh()), Effect.forever, Effect.forkScoped)
  }),
})

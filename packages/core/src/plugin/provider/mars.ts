import { Duration, Effect, Schedule, Schema, Semaphore, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Scope } from "effect"
import type { IntegrationOAuthMethodRegistration } from "@opencode/plugin/effect/integration"
import { define } from "@opencode/plugin/effect/plugin"
import { Model as ModelSchema } from "@opencode/schema/model"
import { Money } from "@opencode/schema/money"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Provider } from "../../provider.js"

const defaultServer = (process.env.MARSAI_URL ?? "https://marsai.click").replace(/\/+$/, "").replace(/\/v1$/i, "")
const clientID = "marscli"
const scope = "mars:inference mars:models mars:account"
const integrationID = Integration.ID.make("marsai")
const methodID = Integration.MethodID.make("device")
const providerID = Provider.ID.make("marsai")
const Device = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri_complete: Schema.String,
  expires_in: Schema.Number,
  interval: Schema.Number,
})
const Token = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Number,
})
const TokenPending = Schema.Struct({ error: Schema.String })
const DeviceToken = Schema.Union([Token, TokenPending])
const User = Schema.Struct({ id: Schema.String, email: Schema.String, name: Schema.optional(Schema.String) })
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

function oauth(http: HttpClient.HttpClient) {
  return {
    integrationID,
    method: {
      id: methodID,
      type: "oauth",
      label: "MarsAI account",
    },
    authorize: (_inputs) =>
      Effect.gen(function* () {
        const device = yield* post(http, `${defaultServer}/oauth/device/code`, { client_id: clientID, scope }, Device)
        const verification = yield* Effect.try({
          try: () => {
            const url = new URL(device.verification_uri_complete, `${defaultServer}/`)
            if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("expected HTTP(S)")
            return url
          },
          catch: (cause) =>
            new Error(`Invalid device verification URL: ${cause instanceof Error ? cause.message : String(cause)}`),
        })
        return {
          mode: "auto" as const,
          url: verification.href,
          instructions: `Enter code: ${device.user_code}`,
          callback: poll(http, defaultServer, device.device_code, Duration.seconds(device.interval)),
        }
      }),
    refresh: (credential) =>
      Effect.gen(function* () {
        const server = serverUrl(credential)
        const token = yield* post(
          http,
          `${server}/oauth/token`,
          // Scope must travel on the refresh grant too, or the new access token can come back
          // scoped-down and 401 every API call while refresh itself succeeds.
          { grant_type: "refresh_token", refresh_token: credential.refresh, client_id: clientID, scope },
          Token,
        )
        return {
          ...credential,
          access: token.access_token,
          refresh: token.refresh_token,
          expires: Date.now() + token.expires_in * 1000,
        }
      }),
    label: (credential) => {
      return typeof credential.metadata?.email === "string" ? credential.metadata.email : undefined
    },
  } satisfies IntegrationOAuthMethodRegistration
}

function serverUrl(value: Credential.Key | Credential.OAuth) {
  return typeof value.metadata?.server === "string" ? value.metadata.server : defaultServer
}

function modelsFor(http: HttpClient.HttpClient, value: Credential.Key | Credential.OAuth) {
  const token = value.type === "oauth" ? value.access : value.key
  return http
    .execute(
      HttpClientRequest.get(`${serverUrl(value)}/v1/models`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(token),
      ),
    )
    .pipe(
      Effect.flatMap((response) =>
        HttpClientResponse.filterStatusOk(response).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ModelsResponse)),
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
    const scope = yield* Scope.Scope

    // Keep the session alive while the service runs: resolve() refreshes the token when it is
    // near expiry, so a periodic resolve means the login never lapses between uses.
    const keepalive = Effect.fn("MarsPlugin.keepalive")(function* () {
      const connection = yield* ctx.integration.connection.active(integrationID)
      if (!connection) return
      yield* ctx.integration.connection.resolve(connection).pipe(Effect.ignore)
    })
    yield* keepalive().pipe(Effect.repeat(Schedule.spaced(Duration.minutes(30))), Effect.forkIn(scope))

    const load = Effect.fn("MarsPlugin.load")(function* () {
      const connection = yield* ctx.integration.connection.active(integrationID)
      if (!connection) return undefined
      return yield* ctx.integration.connection.resolve(connection).pipe(
        Effect.flatMap((credential) =>
          credential && credential.type !== "external" ? modelsFor(http, credential) : Effect.succeed(undefined),
        ),
        Effect.tap(() => ctx.integration.connection.status({ integrationID, connection, status: undefined })),
        Effect.catch((cause) =>
          Effect.gen(function* () {
            // A rejected refresh or a 401 on the model list both mean the stored session is
            // unusable. Mark it needs_auth so the UI offers /login instead of an empty catalog.
            if (
              cause instanceof Integration.AuthorizationError ||
              (cause instanceof Error && /\(401 /.test(cause.message))
            ) {
              yield* ctx.integration.connection.status({
                integrationID,
                connection,
                status: { status: "needs_auth", message: "MarsAI session expired. Run /login to sign in again." },
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
                  mars_access:
                    item.access === "free" || item.id.toLowerCase().includes("free") ? "free" : "paid",
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
      })
      editor.method.update(oauth(http))
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

function poll(http: HttpClient.HttpClient, server: string, deviceCode: string, interval: Duration.Duration) {
  const loop = (wait: Duration.Duration): Effect.Effect<Credential.OAuth, unknown> =>
    Effect.gen(function* () {
      yield* Effect.sleep(wait)
      const result = yield* post(
        http,
        `${server}/oauth/token`,
        {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: clientID,
        },
        DeviceToken,
        false,
      )
      if ("access_token" in result) return yield* credential(http, server, result)
      if (result.error === "authorization_pending") return yield* loop(wait)
      if (result.error === "slow_down") {
        return yield* loop(Duration.sum(wait, Duration.seconds(5)))
      }
      return yield* Effect.fail(new Error(`Device authorization failed: ${result.error}`))
    })
  return loop(interval)
}

function credential(http: HttpClient.HttpClient, server: string, token: typeof Token.Type) {
  return Effect.gen(function* () {
    const user = yield* get(http, `${server}/oauth/userinfo`, token.access_token, User).pipe(
      Effect.catch(() => Effect.succeed(undefined)),
    )
    return Credential.OAuth.make({
      type: "oauth" as const,
      methodID,
      access: token.access_token,
      refresh: token.refresh_token,
      expires: Date.now() + token.expires_in * 1000,
      metadata: {
        server,
        ...(user ? { accountID: user.id, email: user.email } : {}),
      },
    })
  })
}

function get<S extends Schema.Top>(http: HttpClient.HttpClient, url: string, token: string, schema: S) {
  return HttpClient.filterStatusOk(http)
    .execute(HttpClientRequest.get(url).pipe(HttpClientRequest.acceptJson, HttpClientRequest.bearerToken(token)))
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)))
}

function post<S extends Schema.Top>(
  http: HttpClient.HttpClient,
  url: string,
  body: Record<string, string>,
  schema: S,
  statusOk = true,
) {
  const request = HttpClientRequest.post(url).pipe(HttpClientRequest.acceptJson, HttpClientRequest.bodyUrlParams(body))
  return http.execute(request).pipe(
    Effect.flatMap((response) => (statusOk ? HttpClientResponse.filterStatusOk(response) : Effect.succeed(response))),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
  )
}

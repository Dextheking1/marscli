import { Model } from "@opencode/core/model"
import { Generate } from "@opencode/core/generate"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { awaitPlugins, response } from "../location"

export const ModelHandler = HttpApiBuilder.group(Api, "server.model", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "model.list",
        Effect.fn(function* () {
          yield* awaitPlugins
          const models = yield* Model.Service
          return yield* response(models.available())
        }),
      )
      .handle(
        "model.probe",
        Effect.fn(function* () {
          yield* awaitPlugins
          const models = yield* Model.Service
          const generate = yield* Generate.Service
          const catalog = yield* models.available()
          return yield* response(generate.probe(catalog))
        }),
      )
      .handle(
        "model.default",
        Effect.fn(function* () {
          yield* awaitPlugins
          const models = yield* Model.Service
          return yield* response(models.default())
        }),
      )
  }),
)

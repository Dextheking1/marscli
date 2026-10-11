import { DynamicProviderPlugin } from "./provider/dynamic.js"
import { MarsPlugin } from "./provider/mars.js"
import type { PluginInternal } from "./internal.js"

export const ProviderPlugins: PluginInternal.InternalPlugin[] = [MarsPlugin, DynamicProviderPlugin]

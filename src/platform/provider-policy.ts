import type { config } from "../config.js";
import { FleetError, type ModelSettings } from "../domain.js";
import { assertCacheSelection, cacheResource } from "./cache-profile.js";

export function providerCapacity(settings: ReturnType<typeof config>, model: ModelSettings) {
  if (model.provider === "vllm" && settings.inferenceConcurrency["openai-compatible"] > 1 && !settings.vllmCacheProfile)
    throw new FleetError("PROVIDER_CACHE_PROFILE_REQUIRED", true);
  if (settings.vllmCacheProfile && (model.route === "openai-compatible" || model.provider === "vllm")) {
    if (!settings.routes["openai-compatible"]) throw new FleetError("PROVIDER_CACHE_PROFILE_MISMATCH", true);
    assertCacheSelection(
      settings.vllmCacheProfile,
      model,
      settings.routes["openai-compatible"],
      settings.inferenceConcurrency["openai-compatible"],
    );
  }
  return model.route === "codex-cli"
    ? { key: "codex-cli:process", capacity: 1 }
    : {
        key: `${model.route}:${settings.routes[model.route] ?? "unconfigured"}`,
        capacity: settings.inferenceConcurrency[model.route],
        ...(model.provider === "vllm" && settings.vllmCacheProfile
          ? { resource: cacheResource(settings.vllmCacheProfile) }
          : {}),
        ...(model.provider === "vllm" && settings.vllmTokenCapacity !== undefined
          ? { tokenCapacity: settings.vllmTokenCapacity }
          : {}),
      };
}

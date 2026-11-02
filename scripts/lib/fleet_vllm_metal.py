"""Pinned Metal worker metadata bridge; native allocation and execution stay upstream.

Select with --worker-cls fleet_vllm_metal.FleetMetalWorker and the existing
fleet_vllm_capacity.CacheProfileMiddleware. No model calls are performed here.
"""
import os

from vllm_metal.v1.worker import MetalWorker
from fleet_vllm_capacity import build_profile


class FleetMetalWorker(MetalWorker):
    def initialize_from_config(self, kv_cache_config):
        if hasattr(self, '_fleet_initialized_cache'):
            raise ValueError('PROVIDER_CACHE_ALREADY_INITIALIZED')
        super().initialize_from_config(kv_cache_config)
        # Export only the exact configuration that successfully allocated natively.
        self._fleet_initialized_cache = kv_cache_config

    def fleet_cache_profile(self):
        if not hasattr(self, '_fleet_initialized_cache'):
            raise ValueError('PROVIDER_CACHE_NOT_INITIALIZED')
        return build_profile(
            self.vllm_config, self._fleet_initialized_cache,
            endpoint=os.environ.get('FLEET_CAPACITY_ENDPOINT'),
            instance_id=os.environ.get('FLEET_PROVIDER_INSTANCE_ID'),
        )

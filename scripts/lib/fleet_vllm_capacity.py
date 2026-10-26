"""Supported vLLM worker-extension/ASGI hooks; metadata only, never inference."""
import hashlib
import hmac
import json
import os


def build_profile(config, kv, *, endpoint, instance_id):
    from vllm import __version__
    from vllm.v1.kv_cache_interface import FullAttentionSpec, MambaSpec, UniformTypeKVCacheSpecs
    if (config.cache_config.enable_prefix_caching or config.speculative_config is not None
            or config.cache_config.mamba_cache_mode != 'none'
            or config.parallel_config.tensor_parallel_size != 1
            or config.parallel_config.pipeline_parallel_size != 1):
        raise ValueError('UNSUPPORTED_PROVIDER_CACHE_PROFILE')
    groups = []
    for group in kv.kv_cache_groups:
        if group.host_resident:
            raise ValueError('UNSUPPORTED_PROVIDER_CACHE_PROFILE')
        spec = group.kv_cache_spec
        leaves = list(spec.kv_cache_specs.values()) if isinstance(spec, UniformTypeKVCacheSpecs) else [spec]
        descriptions = []
        for leaf in leaves:
            if type(leaf) is MambaSpec and leaf.mamba_cache_mode == 'none' and leaf.num_speculative_blocks == 0:
                descriptions.append({'kind': 'mamba', 'mode': 'none', 'blocksPerRequest': 1})
            elif type(leaf) is FullAttentionSpec and leaf.sliding_window is None and leaf.attention_chunk_size is None:
                descriptions.append({'kind': 'full-attention', 'blockTokens': leaf.block_size})
            else:
                raise ValueError('UNSUPPORTED_PROVIDER_CACHE_PROFILE')
        if not descriptions or any(x != descriptions[0] for x in descriptions):
            raise ValueError('UNSUPPORTED_PROVIDER_CACHE_PROFILE')
        groups.append(descriptions[0])
    name = config.model_config.served_model_name
    if isinstance(name, list):
        if len(name) != 1:
            raise ValueError('AMBIGUOUS_SERVED_MODEL')
        name = name[0]
    if not endpoint or not instance_id or kv.num_blocks <= 2 or not groups:
        raise ValueError('PROVIDER_CACHE_IDENTITY_REQUIRED')
    return {
        'schemaVersion': 'fleet.vllm-cache-profile.v1', 'providerVersion': __version__,
        'model': name, 'endpoint': endpoint, 'instanceId': instance_id,
        'engineConfigSha256': hashlib.sha256(config.compute_hash().encode()).hexdigest(),
        'contextLength': config.model_config.max_model_len,
        'maxNumSeqs': config.scheduler_config.max_num_seqs,
        'prefixCaching': False, 'speculativeDecoding': False,
        'poolBlocks': kv.num_blocks, 'nullBlocks': 1, 'safetyBlocks': 1, 'groups': groups,
    }


class CacheInspector:
    def fleet_cache_profile(self):
        return build_profile(self.vllm_config, self.model_runner.kv_cache_config,
                             endpoint=os.environ.get('FLEET_CAPACITY_ENDPOINT'),
                             instance_id=os.environ.get('FLEET_PROVIDER_INSTANCE_ID'))


class CacheProfileMiddleware:
    def __init__(self, app, key=None):
        self.app = app
        self.key = os.environ.get('VLLM_API_KEY', '') if key is None else key
        self.profile = None

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('path') != '/fleet/cache-profile':
            return await self.app(scope, receive, send)
        supplied = dict(scope.get('headers', [])).get(b'authorization', b'')
        status, data = 401, {'error': 'AUTHENTICATION_REQUIRED'}
        if self.key and hmac.compare_digest(supplied, ('Bearer ' + self.key).encode()):
            status, data = 503, {'error': 'PROVIDER_CACHE_PROFILE_UNAVAILABLE'}
            if scope.get('method') == 'GET':
                try:
                    if self.profile is None:
                        result = await scope['app'].state.engine_client.collective_rpc('fleet_cache_profile', timeout=5)
                        if len(result) != 1:
                            raise ValueError('UNSUPPORTED_WORKER_TOPOLOGY')
                        self.profile = result[0]
                    status, data = 200, self.profile
                except Exception:
                    pass
        body = json.dumps(data).encode()
        await send({'type': 'http.response.start', 'status': status,
                    'headers': [(b'content-type', b'application/json'), (b'cache-control', b'no-store')]})
        await send({'type': 'http.response.body', 'body': body})

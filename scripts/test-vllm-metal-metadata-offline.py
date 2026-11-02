"""Synthetic worker wiring only; no vLLM import, devices, model files or inference."""
import importlib
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / 'lib'))

class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.initialized = []
        self.exported = []
        initialized, exported = self.initialized, self.exported
        class Worker:
            def initialize_from_config(self, kv):
                if getattr(kv, 'fail', False):
                    raise RuntimeError('SYNTHETIC_ALLOCATION_FAILURE')
                initialized.append(kv)
        worker = ModuleType('vllm_metal.v1.worker')
        worker.MetalWorker = Worker
        capacity = ModuleType('fleet_vllm_capacity')
        def build_profile(config, kv, **identity):
            exported.append((config, kv, identity))
            return {'synthetic': True}
        capacity.build_profile = build_profile
        self.patches = patch.dict(sys.modules, {'vllm_metal.v1.worker': worker, 'fleet_vllm_capacity': capacity})
        self.patches.start()
        sys.modules.pop('fleet_vllm_metal', None)
        self.cls = importlib.import_module('fleet_vllm_metal').FleetMetalWorker
        self.addCleanup(self.patches.stop)
        self.addCleanup(lambda: sys.modules.pop('fleet_vllm_metal', None))

    def test_requires_successful_native_allocation_before_export(self):
        w = self.cls()
        with self.assertRaisesRegex(ValueError, 'PROVIDER_CACHE_NOT_INITIALIZED'):
            w.fleet_cache_profile()
        kv = SimpleNamespace(fail=True)
        with self.assertRaisesRegex(RuntimeError, 'SYNTHETIC_ALLOCATION_FAILURE'):
            w.initialize_from_config(kv)
        with self.assertRaisesRegex(ValueError, 'PROVIDER_CACHE_NOT_INITIALIZED'):
            w.fleet_cache_profile()
        self.assertEqual(self.exported, [])

    def test_exports_exact_successfully_initialized_config_through_existing_guard(self):
        w = self.cls()
        kv, config = object(), object()
        w.vllm_config = config
        with patch.dict('os.environ', {'FLEET_CAPACITY_ENDPOINT': 'http://127.0.0.1:12345/v1', 'FLEET_PROVIDER_INSTANCE_ID': 'synthetic-metal'}):
            w.initialize_from_config(kv)
            self.assertEqual(w.fleet_cache_profile(), {'synthetic': True})
        self.assertIs(self.initialized[0], kv)
        self.assertIs(self.exported[0][0], config)
        self.assertIs(self.exported[0][1], kv)
        self.assertEqual(self.exported[0][2]['instance_id'], 'synthetic-metal')

    def test_refuses_reinitialization_of_an_attested_instance(self):
        w = self.cls()
        w.initialize_from_config(object())
        with self.assertRaisesRegex(ValueError, 'PROVIDER_CACHE_ALREADY_INITIALIZED'):
            w.initialize_from_config(object())
        self.assertEqual(len(self.initialized), 1)

if __name__ == '__main__':
    unittest.main()

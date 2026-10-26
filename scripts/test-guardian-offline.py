"""CPU-only helper loss tests. No Windows, database, game or model calls."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('guardian', Path(__file__).with_name('local-run-guardian.py'))
guardian = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guardian)

class HelperTests(unittest.TestCase):
    def test_replaces_dead_helper_boundedly_and_records_exit(self):
        events = []
        command = [sys.executable, '-u', '-c', 'import sys,time;print("ready");[(print(str(time.monotonic_ns())+",1000000000,0")) for line in sys.stdin]']
        with tempfile.TemporaryFile(mode='w+') as errors:
            helper = guardian.HostClock(command, errors, events.append)
            try:
                first = helper.sample()
                helper.process.kill()
                helper.process.wait(timeout=2)
                second = helper.sample()
                self.assertGreater(second['qpc'], first['qpc'])
                self.assertEqual(len(events), 1)
                self.assertEqual(events[0]['exitCode'], -9)
                helper.process.kill(); helper.process.wait(timeout=2)
                helper.sample()
                helper.process.kill(); helper.process.wait(timeout=2)
                with self.assertRaisesRegex(RuntimeError, 'WINDOWS_CLOCK_RESTART_LIMIT'):
                    helper.sample()
            finally:
                helper.close()

    def test_validates_original_clock_across_helper_replacement(self):
        start={'qpc':1000,'frequency':1000}
        previous={'qpc':2000,'frequency':1000,'utcTicks':10000000,'monoMs':2000}
        sample={'qpc':2500,'frequency':1000,'utcTicks':15000000,'monoMs':2500,'roundTripMs':1}
        self.assertIsNone(guardian.invalid_clock(sample,start,previous))
        self.assertEqual(guardian.invalid_clock({**sample,'frequency':2000},start,previous),'HOST_CLOCK_INVALID')
        self.assertEqual(guardian.invalid_clock({**sample,'qpc':1500},start,previous),'HOST_CLOCK_DISAGREEMENT')
        self.assertEqual(guardian.invalid_clock({**sample,'utcTicks':19000000},start,previous),'HOST_CLOCK_DISAGREEMENT')

if __name__ == '__main__': unittest.main()

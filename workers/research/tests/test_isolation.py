"""Raw bypass probes, run inside the same production security envelope."""

import os
import socket
import unittest


@unittest.skipUnless(
    os.environ.get("FLEET_ISOLATION_PROBE") == "1",
    "requires owned network-none container",
)
class Isolation(unittest.TestCase):
    def test_no_network_even_without_broker_wrapper(self):
        for address in [
            ("1.1.1.1", 443),
            ("127.0.0.1", 5432),
            ("172.17.0.1", 5432),
            ("127.0.0.1", 11434),
        ]:
            with self.subTest(address=address), self.assertRaises(OSError):
                socket.create_connection(address, timeout=0.2)

    def test_no_host_credentials_or_filesystem_escape(self):
        self.assertFalse(os.path.exists("/var/run/docker.sock"))
        self.assertFalse(os.path.exists("/Users"))
        for key in [
            "DATABASE_URL",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "FLEET_VAULT_KEY",
        ]:
            self.assertNotIn(key, os.environ)
        for path in ["/opt/fleet/escape", "/etc/escape", "/root/escape"]:
            with self.subTest(path=path), self.assertRaises(OSError):
                with open(path, "w") as f:
                    f.write("probe")
        with open("/tmp/probe", "w") as f:
            f.write("synthetic scratch")

    def test_privilege_envelope(self):
        self.assertEqual(os.getuid(), 10001)
        with open("/proc/self/status") as f:
            status = f.read()
        self.assertIn("CapEff:\t0000000000000000", status)
        self.assertIn("NoNewPrivs:\t1", status)


if __name__ == "__main__":
    unittest.main()

import unittest
from server import validate, verify_certificate
from pathlib import Path
from unittest.mock import patch
import json
import threading
import urllib.request
from http.server import HTTPServer
import server


class ServiceTest(unittest.TestCase):
    def test_http_abstention_threshold_with_stub_predictions(self):
        metadata = {"task": "laya-recall-v1", "runtime": "0.4.6", "revision": server.REVISION, "certificate": "a" * 64}
        candidates = [{"id": "first", "text": "An offer"}, {"id": "second", "text": "A delivery"}]
        for probability, abstained in [(0.649, True), (0.65, False), (0.9, False)]:
            with self.subTest(probability=probability), patch.object(server, "AGENT", object(), create=True), patch.object(server, "METADATA", metadata, create=True), patch.object(server, "predict", return_value={"choice": "B", "probabilities": {"A": 1 - probability, "B": probability}}):
                http = HTTPServer(("127.0.0.1", 0), server.Handler)
                worker = threading.Thread(target=http.serve_forever, daemon=True)
                worker.start()
                try:
                    request = urllib.request.Request(f"http://127.0.0.1:{http.server_port}/recall", data=json.dumps({"query": "Was help delivered?", "candidates": candidates}).encode(), headers={"Content-Type": "application/json"})
                    with urllib.request.urlopen(request, timeout=2) as response:
                        actual = json.load(response)
                    self.assertEqual(actual["abstained"], abstained)
                    self.assertEqual(actual["id"], "second")
                    self.assertEqual(actual["probability"], probability)
                finally:
                    http.shutdown()
                    worker.join(timeout=2)
                    http.server_close()

    def test_request_validation(self):
        valid = {"query": "supply", "candidates": [{"id": "A", "text": "grain"}, {"id": "B", "text": "army"}]}
        self.assertEqual(len(validate(valid)), 2)
        for invalid in [valid | {"query": ""}, valid | {"candidates": valid["candidates"][:1]}, valid | {"command": "act"}, valid | {"candidates": [valid["candidates"][0]]*2}]:
            with self.assertRaises(ValueError): validate(invalid)

    def test_acceptance_and_weight_digest_are_required(self):
        certificate = json.loads(Path(__file__).with_name("acceptance.json").read_text())
        with patch("server.manifest", return_value=certificate["files"]):
            self.assertEqual(len(verify_certificate(certificate, Path("unused"))), 64)
            for change in [{"passed": False}, {"accepted": 0}, {"correct": 1}, {"revision": "rolling"}, {"abstainThreshold": 0.5}]:
                with self.assertRaises(ValueError): verify_certificate(certificate | change, Path("unused"))
        with patch("server.manifest", return_value={}):
            with self.assertRaises(ValueError): verify_certificate(certificate, Path("unused"))


if __name__ == "__main__": unittest.main()

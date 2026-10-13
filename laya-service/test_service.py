import unittest
from server import validate, verify_certificate
from pathlib import Path
from unittest.mock import patch
import json


class ServiceTest(unittest.TestCase):
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

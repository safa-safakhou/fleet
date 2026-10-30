"""Foundation-only protocol inspection. Online operation is implemented in R2."""

import argparse
import json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol-info", action="store_true", required=True)
    parser.parse_args()
    print(json.dumps({"protocolVersion": 1, "onlineExecution": False}))

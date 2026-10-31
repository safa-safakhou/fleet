"""Trusted offline optimizer child. Capability only via protected stdin."""

import asyncio
import json
import sys
import time

from ..client import BrokerClient
from .dataset import load_dataset
from .optimize import optimize


def main():
    control = json.loads(sys.stdin.buffer.read(1048577))
    if control.get("mode") == "tracking":
        from .tracking import TrackingProjection

        result = TrackingProjection(control["directory"]).sync(control["snapshot"])
        print("\nFLEET_FRAMEWORK_RESULT " + json.dumps(result))
        return
    dataset = load_dataset(control["manifestPath"])
    # This host helper is trusted code, not an adversarial-code sandbox. grpc uses
    # its native UDS channel; no provider adapters or ambient keys are admitted.
    import socket

    def deny(*args, **kwargs):
        raise ValueError("OFFLINE_EGRESS_DENIED")

    socket.create_connection = deny
    socket.getaddrinfo = deny
    original_connect = socket.socket.connect

    def connect(self, address):
        if self.family != socket.AF_UNIX or address != control["socket"]:
            return deny()
        return original_connect(self, address)

    socket.socket.connect = connect
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    broker = BrokerClient(
        control["socket"], control["token"], control["scope"], time.time() + 60
    )

    class SyncBroker:
        def call(self, request):
            return loop.run_until_complete(broker.evaluate(request))

    try:
        candidate = optimize(control["config"], dataset, SyncBroker())
        print("\nFLEET_FRAMEWORK_RESULT " + json.dumps(candidate))
    finally:
        loop.run_until_complete(broker.close())
        loop.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 -- redact framework/provider errors at the process/projection boundary
        sys.stderr.write("OFFLINE_OPTIMIZATION_FAILED")
        sys.exit(1)

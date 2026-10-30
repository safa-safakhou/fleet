"""Strict Fleet envelope adapters over generated Protobuf; no model or network IO."""

import base64
import json
import sys

from google.protobuf.json_format import MessageToDict, ParseDict

from fleet_research.generated.fleet.v1.worker_pb2 import BrokerEnvelope
from fleet_research.models import Envelope


def validate(data):
    # bool is an int subclass in Python; the protocol field must still be an integer.
    if type(data.get("protocolVersion")) is not int:
        raise ValueError("UNSUPPORTED_PROTOCOL")
    return Envelope.model_validate(data).model_dump(exclude_unset=True)


def decode(binary):
    message = BrokerEnvelope.FromString(binary)
    data = MessageToDict(message)
    data.setdefault("counter", "0")
    if "scope" in data:
        data["scope"].setdefault("operationEpoch", "0")
    if "result" in data:
        for artifact in data["result"].get("artifacts", []):
            artifact.setdefault("bytes", "0")
            artifact.setdefault("chunks", "0")
        data["result"].setdefault("usage", None)
        if data["result"]["usage"] is not None:
            data["result"]["usage"].setdefault("inputTokens", None)
            data["result"]["usage"].setdefault("outputTokens", None)
    if "coverage" in data:
        for key, default in [("expected", "0"), ("recorded", "0"), ("reasons", [])]:
            data["coverage"].setdefault(key, default)
    return validate(data)


def encode(data):
    validate(data)
    try:
        return ParseDict(data, BrokerEnvelope()).SerializeToString(deterministic=True)
    except Exception as error:
        raise ValueError("INVALID_WIRE_INPUT") from error


def round_trip(data):
    return decode(encode(data))


if __name__ == "__main__":
    data = decode(base64.b64decode(sys.argv[1], validate=True))
    print(json.dumps({"json": data, "binary": base64.b64encode(encode(data)).decode()}))

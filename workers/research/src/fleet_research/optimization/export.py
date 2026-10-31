"""Explicit immutable export; canonical JSON shared with Fleet's compiler."""

import hashlib
import json


def canonical(value):
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def export_candidate(content, lineage):
    content = json.loads(canonical(content))
    lineage = json.loads(canonical(lineage))
    if len(content["demonstrations"]) > 2:
        raise ValueError("DEMONSTRATION_CAP")
    body = {
        "schemaVersion": "fleet.candidate/v1",
        "content": content,
        "digest": digest(content),
        "lineage": lineage,
    }
    return {**body, "artifactDigest": digest(body)}

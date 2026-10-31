"""Validate frozen provenance before opening any optimizer-visible split."""

import json
from pathlib import Path

from .export import digest


def load_dataset(path, split=None):
    if split == "heldout":
        raise ValueError("HELDOUT_ACCESS_DENIED")
    if split not in (None, "train", "development"):
        raise ValueError("DATASET_SPLIT_INVALID")
    path = Path(path).resolve()
    manifest = json.loads(path.read_text())
    if manifest["schemaVersion"] != "fleet.dataset/v1":
        raise ValueError("DATASET_SCHEMA_INVALID")
    for key in ("family", "world", "contentHash"):
        seen = {}
        for record in manifest["records"]:
            if record[key] in seen and seen[record[key]] != record["split"]:
                raise ValueError("DATASET_SPLIT_OVERLAP")
            seen[record[key]] = record["split"]
    declared = {r["id"]: r for r in manifest["records"]}
    if len(declared) != len(manifest["records"]):
        raise ValueError("DATASET_CASE_CONFLICT")
    result = {"manifest": manifest}
    for name in [split] if split else ["train", "development"]:
        file = (path.parent / manifest["files"][name]).resolve()
        if not file.is_relative_to(path.parent):
            raise ValueError("DATASET_PATH_FORBIDDEN")
        cases = [json.loads(line) for line in file.read_text().splitlines() if line]
        if digest(cases) != manifest["splitDigests"][name]:
            raise ValueError("DATASET_DIGEST_MISMATCH")
        if len(cases) != sum(r["split"] == name for r in declared.values()):
            raise ValueError("DATASET_POPULATION_MISMATCH")
        for case in cases:
            r = declared.get(case["id"])
            if (
                not r
                or any(case[k] != r[k] for k in ("family", "world", "split"))
                or r["split"] != name
                or digest(case["actorInput"]) != r["contentHash"]
            ):
                raise ValueError("DATASET_PROVENANCE_MISMATCH")
        result[name] = cases
    return result

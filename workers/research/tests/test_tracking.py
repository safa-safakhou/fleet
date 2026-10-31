import json

from fleet_research.optimization.tracking import TrackingProjection


def test_tracking_logs_only_allowlisted_metadata_and_resync_is_idempotent(tmp_path):
    projection = TrackingProjection(tmp_path)
    payload = {
        "snapshotDigest": "a" * 64,
        "parameters": {"seed": "42", "primaryMetric": "first_pass_accuracy.v1"},
        "metrics": {"first_pass_accuracy.v1": 1.0},
        "artifactRefs": ["opaque-artifact"],
        "privatePrompt": "PRIVATE_SENTINEL_DO_NOT_COPY",
    }
    first = projection.sync(payload)
    second = projection.sync(payload)
    assert first["status"] == "synced"
    assert first["runId"] == second["runId"]
    from mlflow.tracking import MlflowClient

    client = MlflowClient(tracking_uri=f"sqlite:///{tmp_path / 'tracking.db'}")
    assert len(client.get_metric_history(first["runId"], "first_pass_accuracy.v1")) == 1
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert b"PRIVATE_SENTINEL_DO_NOT_COPY" not in path.read_bytes()


def test_tracking_outage_does_not_change_authoritative_input(tmp_path):
    def unavailable(*args, **kwargs):
        raise ConnectionError("offline fixture")

    projection = TrackingProjection(tmp_path, client_factory=unavailable)
    payload = {
        "snapshotDigest": "b" * 64,
        "parameters": {},
        "metrics": {},
        "artifactRefs": [],
    }
    before = json.dumps(payload, sort_keys=True)
    assert projection.sync(payload)["status"] == "unavailable"
    assert json.dumps(payload, sort_keys=True) == before
